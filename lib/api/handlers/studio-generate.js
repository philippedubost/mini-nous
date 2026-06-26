import { getJsonBody } from '../prepare-req.js'
import { requirePaidOrderByToken } from '../../server/order-access.js'
import { getSupabase } from '../../server/supabase.js'
import { queueStudioGenerate, runStudioTickForOrderId } from '../../server/studio-generate.js'
import { isWorkerAuthorized } from '../../server/admin.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = getJsonBody(req)
    const internal = isWorkerAuthorized(req)

    let orderId = body.orderId
    if (!internal) {
      const token = body.token
      if (!token) return res.status(400).json({ error: 'token requis' })
      const order = await requirePaidOrderByToken(token)
      orderId = order.id
      if (body.start) {
        await queueStudioGenerate(orderId, { mode: body.mode || 'initial' })
        return res.status(202).json({ ok: true, queued: true })
      }
    }

    if (!orderId) return res.status(400).json({ error: 'orderId requis' })

    if (internal && body.queue) {
      await queueStudioGenerate(orderId, { mode: body.mode || 'initial', feedback: body.feedback ?? null })
      return res.status(202).json({ ok: true, queued: true })
    }

    const result = await runStudioTickForOrderId(req, orderId)
    return res.status(result.done ? 200 : 202).json({ ok: true, ...result })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[studio-generate]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}

export async function recoverStaleStudioJobs(req) {
  const supabase = getSupabase()
  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, workflow_status, status')
    .eq('status', 'paid')
    .in('workflow_status', ['in_studio', 'awaiting_photo'])
    .lt('updated_at', cutoff)
    .limit(20)
  if (error) {
    console.error('[studio-generate recover]', error.message)
    return
  }
  for (const order of data ?? []) {
    const job = order.metadata?.studio_generate
    if (!job || job.phase === 'done' || job.phase === 'error') continue
    await queueStudioGenerate(order.id).catch(err => console.error('[studio-generate recover]', order.id, err))
  }
}
