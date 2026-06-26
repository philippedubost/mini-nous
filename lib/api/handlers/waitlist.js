import { saveWaitlistEmail } from '../../server/waitlist.js'
import { trackFunnelEvent } from '../../server/funnel.js'
import { getJsonBody } from '../prepare-req.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { email, faceCount, weekKey, source } = getJsonBody(req)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' })
    }

    const result = await saveWaitlistEmail(email, {
      faceCount: faceCount ?? null,
      weekKey: weekKey ?? null,
      source: source ?? 'landing',
    })

    trackFunnelEvent('waitlist_signup', {
      faceCount: faceCount ?? null,
      weekKey: result.weekKey,
      metadata: { source: source ?? 'landing' },
    }).catch(() => {})

    return res.status(200).json({ ok: true, weekKey: result.weekKey })
  } catch (e) {
    console.error('[waitlist]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
