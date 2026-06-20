import { getOrderByToken, linkOrderToGeneration } from '../../server/orders.js'
import { getSupabase } from '../../server/supabase.js'
import { getAuthUser } from '../../server/auth.js'
import { isAdminEmail } from '../../server/admin.js'
import { getJsonBody } from '../prepare-req.js'
import {
  buildOrderResponse,
  requirePaidOrderByToken,
} from '../../server/order-access.js'
import { WORKFLOW_STATUS } from '../../server/order-workflow.js'

const MAX_REGEN = 3

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const token = req.query?.token
      if (!token) return res.status(400).json({ error: 'token requis' })

      const authUser = await getAuthUser(req)
      const order = await requirePaidOrderByToken(token, authUser)
      return res.status(200).json({ order: await buildOrderResponse(req, order, authUser) })
    }

    if (req.method === 'PATCH') {
      const { token, generationId, action, faceCount } = getJsonBody(req)
      if (!token) return res.status(400).json({ error: 'token requis' })

      const authUser = await getAuthUser(req)
      const order = await requirePaidOrderByToken(token, authUser)
      const supabase = getSupabase()

      if (action === 'link_generation' || (!action && generationId)) {
        if (!generationId) {
          return res.status(400).json({ error: 'generationId requis' })
        }
        await linkOrderToGeneration(order.id, generationId)
        return res.status(200).json({ ok: true, orderId: order.id, generationId })
      }

      if (action === 'pending_validation') {
        await supabase
          .from('mini_nous_orders')
          .update({
            workflow_status: WORKFLOW_STATUS.PENDING_VALIDATION,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
        return res.status(200).json({ ok: true, workflowStatus: WORKFLOW_STATUS.PENDING_VALIDATION })
      }

      if (action === 'validate') {
        if (!order.generation_id) {
          return res.status(400).json({ error: 'Aucun design à valider' })
        }
        await supabase
          .from('mini_nous_orders')
          .update({
            workflow_status: WORKFLOW_STATUS.APPROVED,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(order.metadata ?? {}),
              validated_at: new Date().toISOString(),
            },
          })
          .eq('id', order.id)
        return res.status(200).json({ ok: true, workflowStatus: WORKFLOW_STATUS.APPROVED })
      }

      if (action === 'update_face_count') {
        if (!isAdminEmail(authUser?.email)) {
          return res.status(403).json({ error: 'Réservé aux administrateurs' })
        }
        const fc = Number(faceCount)
        if (!Number.isFinite(fc) || fc < 1 || fc > 32) {
          return res.status(400).json({ error: 'faceCount invalide (1–32)' })
        }
        await supabase
          .from('mini_nous_orders')
          .update({ face_count: fc, updated_at: new Date().toISOString() })
          .eq('id', order.id)
        return res.status(200).json({ ok: true, faceCount: fc })
      }

      if (action === 'regen') {
        const count = Number(order.metadata?.regen_count) || 0
        const admin = isAdminEmail(authUser?.email)
        if (!admin && count >= MAX_REGEN) {
          return res.status(409).json({ error: `Maximum ${MAX_REGEN} régénérations atteint` })
        }
        const nextCount = admin ? count : count + 1
        await supabase
          .from('mini_nous_orders')
          .update({
            metadata: { ...(order.metadata ?? {}), regen_count: nextCount },
            workflow_status: WORKFLOW_STATUS.IN_STUDIO,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
        return res.status(200).json({
          ok: true,
          regenCount: nextCount,
          regenRemaining: admin ? null : MAX_REGEN - nextCount,
        })
      }

      return res.status(400).json({ error: 'action inconnue' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[orders]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
