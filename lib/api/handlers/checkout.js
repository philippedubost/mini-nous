import { getStripe, getSiteUrl } from '../../server/stripe-client.js'
import { computeQuote, getPack, FRIDAY_DELIVERY_CENTS } from '../../server/packs.js'
import { resolveCheckoutOrder } from '../../server/paywall-order.js'
import { getJsonBody } from '../prepare-req.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      pack, faceCount, email, customerName, giftDelivery, giftRecipientName, giftMessage, childCount,
      accessToken, photoBase64, fridayDelivery,
    } = getJsonBody(req)
    if (!pack) return res.status(400).json({ error: 'pack requis' })

    const quote = faceCount != null ? computeQuote(faceCount) : computeQuote(getPack(pack).faceCount)
    if (!quote.ok) {
      const msg = quote.reason === 'too_many'
        ? `Maximum ${quote.maxFaces} personnages — choisissez une photo avec au plus ${quote.maxFaces} visages.`
        : 'Nombre de personnages invalide'
      return res.status(400).json({ error: msg })
    }

    const resolved = await resolveCheckoutOrder(req, process.env, {
      accessToken,
      pack,
      faceCount: quote.faceCount,
      email,
      customerName,
      childCount,
      giftDelivery,
      giftRecipientName,
      giftMessage,
      photoBase64,
      fridayDelivery: !!fridayDelivery,
    })

    const order = resolved.order
    const week = resolved.week
    const stripe = getStripe()
    const site = getSiteUrl(req)
    const packDef = quote.basePack

    const lineItems = [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: packDef.label,
          description: `${packDef.faceCount} personnage${packDef.faceCount > 1 ? 's' : ''} inclus · Édition du ${week.ship_date}`,
        },
        unit_amount: packDef.priceCents,
      },
      quantity: 1,
    }]

    if (quote.extraCount > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Personnage supplémentaire',
            description: `${quote.extraCount} personnage${quote.extraCount > 1 ? 's' : ''} en plus du pack`,
          },
          unit_amount: quote.extraPersonCents,
        },
        quantity: quote.extraCount,
      })
    }

    if (quote.shippingCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Frais de port' },
          unit_amount: quote.shippingCents,
        },
        quantity: 1,
      })
    }

    if (fridayDelivery) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Livraison express vendredi' },
          unit_amount: FRIDAY_DELIVERY_CENTS,
        },
        quantity: 1,
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      line_items: lineItems,
      success_url: `${site}/pipeline/studio?order=${order.access_token}&auto=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/pipeline/paiement/annule`,
      metadata: {
        order_id: order.id,
        pack_type: packDef.id,
        face_count: String(quote.faceCount),
        extra_count: String(quote.extraCount),
        week_id: week.id,
        access_token: order.access_token,
        pack_label: order.metadata?.pack_label ?? packDef.label,
        ship_date: week.ship_date ?? '',
        gift_delivery: giftDelivery ? '1' : '0',
        friday_delivery: fridayDelivery ? '1' : '0',
        gift_recipient_name: giftRecipientName?.trim() || '',
        gift_message: giftMessage?.trim() || '',
        child_count: childCount != null ? String(childCount) : '',
      },
      allow_promotion_codes: true,
    })

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
      orderId: order.id,
      accessToken: order.access_token,
    })
  } catch (e) {
    console.error('[checkout]', e)
    const code = e.message?.includes('complète') || e.message?.includes('Maximum') ? 409 : 500
    return res.status(code).json({ error: e.message || 'Erreur checkout' })
  }
}
