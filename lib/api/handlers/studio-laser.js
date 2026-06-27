import { getJsonBody } from '../prepare-req.js'
import { isWorkerAuthorized } from '../../server/admin.js'
import { queueStudioLaser, runStudioLaserForOrderId } from '../../server/studio-laser.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!isWorkerAuthorized(req)) {
    return res.status(403).json({ error: 'Mot de passe worker requis (Bearer admin)' })
  }

  try {
    const body = getJsonBody(req)
    const orderId = body.orderId
    if (!orderId) return res.status(400).json({ error: 'orderId requis' })

    if (body.queue) {
      const q = await queueStudioLaser(orderId, { force: !!body.force })
      return res.status(202).json({ ok: true, ...q })
    }

    const result = await runStudioLaserForOrderId(orderId)
    return res.status(result.done ? 200 : 202).json({ ok: true, ...result })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[studio-laser]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
