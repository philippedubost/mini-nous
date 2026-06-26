import { hasAdminHeader } from '../../server/admin.js'
import { listStudioWorkerJobs } from '../../server/studio-worker.js'

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
    const jobs = await listStudioWorkerJobs()
    const pending = jobs.filter(j => j.needsQueue || j.needsTick).length
    const errors = jobs.filter(j => j.canRetry).length
    return res.status(200).json({
      ok: true,
      workerMode: process.env.STUDIO_AUTO_CHAIN !== '1',
      pending,
      errors,
      jobs,
    })
  } catch (e) {
    console.error('[studio-worker]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
