import { getStripe } from '../../server/stripe-client.js'
import { getOrderByToken } from '../../server/orders.js'
import { buildOrderResponse } from '../../server/order-access.js'
import { fulfillCheckoutSession, isCheckoutSessionPaid } from '../../server/checkout-fulfill.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const sessionId = req.query?.session_id
    const token = req.query?.token
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'session_id requis' })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['invoice'],
    })

    if (token && session.metadata?.access_token && session.metadata.access_token !== token) {
      return res.status(403).json({ error: 'Token commande invalide pour cette session' })
    }

    if (!isCheckoutSessionPaid(session)) {
      return res.status(200).json({
        paid: false,
        paymentStatus: session.payment_status,
      })
    }

    const accessToken = token || session.metadata?.access_token
    const existing = accessToken ? await getOrderByToken(accessToken) : null
    if (existing?.status === 'paid') {
      return res.status(200).json({
        paid: true,
        order: await buildOrderResponse(req, existing, null),
      })
    }

    const result = await fulfillCheckoutSession(req, session)
    if (!result.ok) {
      return res.status(400).json({ error: 'Impossible de confirmer le paiement' })
    }

    const order = await getOrderByToken(result.accessToken || accessToken)
    return res.status(200).json({
      paid: true,
      order: order ? await buildOrderResponse(req, order, null) : null,
    })
  } catch (e) {
    console.error('[checkout-confirm]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
