import { getAuthUser } from '../../server/auth.js'
import { hasAdminAccess } from '../../server/admin.js'
import { getSupabase } from '../../server/supabase.js'
import { getJsonBody } from '../prepare-req.js'
import { buildAdminBoard } from '../../server/admin-board.js'
import { applyAdminWorkflowStatus } from '../../server/admin-workflow.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const user = await getAuthUser(req)
    if (!hasAdminAccess(req, user)) {
      return res.status(403).json({ error: 'Accès admin requis' })
    }

    if (req.method === 'GET') {
      const board = await buildAdminBoard(req)
      return res.status(200).json(board)
    }

    if (req.method === 'PATCH') {
      const { orderId, workflowStatus } = getJsonBody(req)
      if (!orderId || !workflowStatus) {
        return res.status(400).json({ error: 'orderId et workflowStatus requis' })
      }

      const supabase = getSupabase()
      const { data: order, error } = await supabase
        .from('mini_nous_orders')
        .select('*, week:mini_nous_production_weeks(*)')
        .eq('id', orderId)
        .eq('status', 'paid')
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!order) return res.status(404).json({ error: 'Commande introuvable' })

      const result = await applyAdminWorkflowStatus(req, supabase, order, workflowStatus)
      return res.status(200).json({ ok: true, ...result })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[admin-board]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
