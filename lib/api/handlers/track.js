import { trackFunnelEvent } from '../../server/funnel.js'
import { getJsonBody } from '../prepare-req.js'

const ALLOWED_EVENTS = new Set([
  'photo_uploaded',
  'checkout_initiated',
  'payment_completed',
  'waitlist_signup',
  'paywall_opened',
  'studio_opened',
])

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { event, sessionId, orderId, faceCount, weekKey, metadata } = getJsonBody(req)

    if (!event || !ALLOWED_EVENTS.has(event)) {
      return res.status(400).json({ error: `Événement non reconnu : ${event}` })
    }

    // fire-and-forget — on ne bloque pas le client
    trackFunnelEvent(event, {
      sessionId: sessionId ?? null,
      orderId: orderId ?? null,
      faceCount: faceCount ?? null,
      weekKey: weekKey ?? null,
      metadata: metadata ?? {},
    }).catch(() => {})

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
