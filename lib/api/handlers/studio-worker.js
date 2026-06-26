import { isWorkerAuthorized } from '../../server/admin.js'
import { buildStudioBoard, buildStudioOrderDetail, pickNextWorkerJob } from '../../server/studio-board.js'
import { runWorkerAction } from '../../server/studio-worker-actions.js'
import { getJsonBody } from '../prepare-req.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!isWorkerAuthorized(req)) {
    return res.status(403).json({ error: 'Mot de passe worker requis (Bearer admin)' })
  }

  try {
    if (req.method === 'PATCH') {
      const { action, orderIds } = getJsonBody(req)
      if (!action || !Array.isArray(orderIds) || !orderIds.length) {
        return res.status(400).json({ error: 'action et orderIds[] requis' })
      }
      const results = await runWorkerAction(req, action, orderIds)
      const failed = results.filter(r => !r.ok)
      return res.status(200).json({ ok: failed.length === 0, results, failed: failed.length })
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const orderId = req.query?.orderId
    if (orderId) {
      const detail = await buildStudioOrderDetail(req, String(orderId))
      if (!detail) return res.status(404).json({ error: 'Commande introuvable' })
      return res.status(200).json({ ok: true, order: detail })
    }

    const weekKey = req.query?.weekKey ? String(req.query.weekKey) : null
    const board = await buildStudioBoard(req, { weekKey })
    const nextJob = pickNextWorkerJob(board.motorJobs)
    return res.status(200).json({
      ok: true,
      workerMode: process.env.STUDIO_AUTO_CHAIN !== '1',
      pending: board.pending,
      errors: board.errors,
      columns: board.columns,
      byColumn: board.byColumn,
      columnTotals: board.columnTotals,
      weeks: board.weeks,
      totalOrders: board.totalOrders,
      totalFaces: board.totalFaces,
      jobs: board.motorJobs,
      nextJob,
      weekKey,
      blocked24h: board.blocked24h,
      falErrors: board.falErrors,
    })
  } catch (e) {
    console.error('[studio-worker]', e)
    const status = e.status || 500
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
