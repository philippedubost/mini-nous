import { hasAdminHeader } from '../../server/admin.js'
import { buildStudioBoard, buildStudioOrderDetail, pickNextWorkerJob } from '../../server/studio-board.js'

function isWorkerAuthorized(req) {
  if (hasAdminHeader(req)) return true
  const secret = process.env.STUDIO_GENERATE_SECRET
  if (!secret) return false
  const auth = req.headers.authorization || ''
  return auth === `Bearer ${secret}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!isWorkerAuthorized(req)) {
    return res.status(403).json({ error: 'Secret worker requis (Bearer STUDIO_GENERATE_SECRET ou admin)' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const orderId = req.query?.orderId
    if (orderId) {
      const detail = await buildStudioOrderDetail(req, String(orderId))
      if (!detail) return res.status(404).json({ error: 'Commande introuvable' })
      return res.status(200).json({ ok: true, order: detail })
    }

    const board = await buildStudioBoard(req)
    const nextJob = pickNextWorkerJob(board.motorJobs)
    return res.status(200).json({
      ok: true,
      workerMode: process.env.STUDIO_AUTO_CHAIN !== '1',
      pending: board.pending,
      errors: board.errors,
      columns: board.columns,
      byColumn: board.byColumn,
      jobs: board.motorJobs,
      nextJob,
    })
  } catch (e) {
    console.error('[studio-worker]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
