import { getOrderByToken } from './orders.js'
import { getSupabase } from './supabase.js'
import {
  buildCustomerOrderPayload,
  loadOrderContext,
  syncOrderWorkflowStatus,
} from './order-workflow.js'
import { getSiteUrl } from './stripe-client.js'

export async function linkOrderToUser(orderId, userId) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('mini_nous_orders')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('user_id', null)
  if (error) throw new Error(error.message)
}

export async function claimOrdersByEmail(userId, email) {
  if (!email) return { claimed: 0 }
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .ilike('email', email.trim())
    .is('user_id', null)
    .eq('status', 'paid')
    .select('id')
  if (error) throw new Error(error.message)
  return { claimed: data?.length ?? 0 }
}

export async function requirePaidOrderByToken(token, authUser = null) {
  const order = await getOrderByToken(token)
  if (!order) {
    throw Object.assign(new Error('Commande introuvable'), { status: 404 })
  }
  if (order.status !== 'paid') {
    throw Object.assign(new Error('Paiement non confirmé'), { status: 402 })
  }
  if (authUser?.id && order.user_id && order.user_id !== authUser.id) {
    throw Object.assign(new Error('Accès refusé à cette commande'), { status: 403 })
  }
  if (authUser?.id && !order.user_id) {
    await linkOrderToUser(order.id, authUser.id)
    order.user_id = authUser.id
  }
  return order
}

export async function buildOrderResponse(req, order) {
  const supabase = getSupabase()
  const { generation, previewUrl } = await loadOrderContext(supabase, order)
  const workflowStatus = await syncOrderWorkflowStatus(supabase, order, { generation })
  const orderWithWorkflow = { ...order, workflow_status: workflowStatus }
  const regenCount = Number(order.metadata?.regen_count) || 0
  const payload = buildCustomerOrderPayload({
    order: orderWithWorkflow,
    generation,
    previewUrl,
    siteUrl: getSiteUrl(req),
  })
  return {
    ...payload,
    regenCount,
    regenRemaining: Math.max(0, 3 - regenCount),
    accessToken: order.access_token,
  }
}

export async function listOrdersForUser(userId) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}
