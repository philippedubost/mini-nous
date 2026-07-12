import { getStripe, getSiteUrl } from '../../server/stripe-client.js'
import { computeQuote, getPack, FRIDAY_DELIVERY_CENTS } from '../../server/packs.js'
import { resolveCheckoutOrder } from '../../server/paywall-order.js'
import { formatShippingAddress, normalizeShippingZone } from '../../server/shipping.js'
import { getJsonBody } from '../prepare-req.js'
import { trackFunnelEvent } from '../../server/funnel.js'

function figurineProductName(brand, faceCount) {
  const label = brand === 'woodtribe' ? 'WoodTribe' : 'MiniNous'
  return faceCount === 1 ? `1 figurine ${label}` : `${faceCount} figurines ${label}`
}

function checkoutCancelUrl(site, brand) {
  if (brand === 'mininous') return `${site}/mininous/commander`
  return `${site}/commander`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      pack, faceCount, email, customerName, giftDelivery, giftRecipientName, giftMessage, childCount,
      accessToken, photoBase64, fridayDelivery, shippingZone, shippingAddress, newsletterOptIn, brand,
    } = getJsonBody(req)
    if (faceCount == null && !pack) {
      return res.status(400).json({ error: 'faceCount requis' })
    }

    const zone = normalizeShippingZone(shippingZone)
    const expressFriday = zone !== 'international' && !!fridayDelivery
    const quote = faceCount != null ? computeQuote(faceCount, zone) : computeQuote(getPack(pack).faceCount, zone)
    if (!quote.ok) {
      const msg = quote.reason === 'too_many'
        ? `Maximum ${quote.maxFaces} personnages — choisissez une photo avec au plus ${quote.maxFaces} visages.`
        : 'Nombre de personnages invalide'
      return res.status(400).json({ error: msg })
    }

    const resolved = await resolveCheckoutOrder(req, process.env, {
      accessToken,
      pack: quote.basePack.id,
      faceCount: quote.faceCount,
      email,
      customerName,
      childCount,
      giftDelivery,
      giftRecipientName,
      giftMessage,
      photoBase64,
      fridayDelivery: expressFriday,
      shippingZone: zone,
      shippingAddress: formatShippingAddress(shippingAddress),
      newsletterOptIn: !!newsletterOptIn,
      brand,
    })

    const order = resolved.order
    const week = resolved.week
    const orderBrand = brand || order.metadata?.brand || 'woodtribe'
    const stripe = getStripe()
    const site = getSiteUrl(req)
    const packDef = quote.basePack
    const figurineLabel = figurineProductName(orderBrand, quote.faceCount)

    const lineItems = [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: figurineLabel,
          description: `Sur-mesure · Édition du ${week.ship_date}`,
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

    if (expressFriday) {
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
      locale: 'fr',
      customer_email: email || undefined,
      line_items: lineItems,
      invoice_creation: { enabled: true },
      success_url: `${site}/pipeline/commande?order=${order.access_token}&auto=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: checkoutCancelUrl(site, orderBrand),
      metadata: {
        order_id: order.id,
        pack_type: packDef.id,
        face_count: String(quote.faceCount),
        extra_count: String(quote.extraCount),
        week_id: week.id,
        access_token: order.access_token,
        pack_label: order.metadata?.pack_label ?? packDef.label,
        ship_date: week.ship_date ?? '',
        brand: orderBrand,
        gift_delivery: giftDelivery ? '1' : '0',
        friday_delivery: expressFriday ? '1' : '0',
        gift_recipient_name: giftRecipientName?.trim() || '',
        gift_message: giftMessage?.trim() || '',
        child_count: childCount != null ? String(childCount) : '',
        shipping_zone: zone,
        newsletter_opt_in: newsletterOptIn ? '1' : '0',
      },
      shipping_address_collection: {
        allowed_countries: ['FR', 'BE', 'CH', 'LU', 'DE', 'ES', 'IT', 'PT', 'NL', 'GB', 'US', 'CA'],
      },
      allow_promotion_codes: true,
    })

    trackFunnelEvent('checkout_initiated', {
      orderId: order.id,
      faceCount: quote.faceCount,
      weekKey: week.week_key ?? null,
      metadata: { stripeSessionId: session.id, brand: orderBrand },
    }).catch(() => {})

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
