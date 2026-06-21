import { getSupabase } from '../../server/supabase.js'
import { getJsonBody } from '../prepare-req.js'
import { requireOrderByToken } from '../../server/order-access.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { token, action, score, postUrl } = getJsonBody(req)
    if (!token) return res.status(400).json({ error: 'token requis' })
    if (!action) return res.status(400).json({ error: 'action requise' })

    const order = await requireOrderByToken(token)
    const supabase = getSupabase()
    const meta = order.metadata ?? {}
    const now = new Date().toISOString()

    if (action === 'nps') {
      const nps = Number(score)
      if (!Number.isFinite(nps) || nps < 1 || nps > 5) {
        return res.status(400).json({ error: 'score NPS invalide (1–5)' })
      }
      if (meta.nps_submitted_at) {
        return res.status(200).json({ ok: true, skipped: true })
      }
      await supabase
        .from('mini_nous_orders')
        .update({
          metadata: { ...meta, nps_score: nps, nps_submitted_at: now },
          updated_at: now,
        })
        .eq('id', order.id)
      return res.status(200).json({
        ok: true,
        score: nps,
        showReviewLinks: nps >= 5,
      })
    }

    if (action === 'mininous_share') {
      const url = String(postUrl || '').trim()
      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'URL de publication invalide' })
      }
      if (meta.mininous_share_url) {
        return res.status(200).json({ ok: true, skipped: true })
      }
      await supabase
        .from('mini_nous_orders')
        .update({
          metadata: {
            ...meta,
            mininous_share_url: url,
            mininous_share_submitted_at: now,
            mininous_share_pending: true,
          },
          updated_at: now,
        })
        .eq('id', order.id)
      return res.status(200).json({
        ok: true,
        message: 'Merci ! Nous vérifions votre publication et vous enverrons un code −20 % sous 48 h.',
      })
    }

    return res.status(400).json({ error: 'action inconnue' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[engagement]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
