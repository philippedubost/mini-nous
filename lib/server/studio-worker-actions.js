import { getSupabase } from './supabase.js'
import { WORKFLOW_STATUS } from './order-workflow.js'
import { applyAdminWorkflowStatus } from './admin-workflow.js'
import { queueStudioGenerate } from './studio-generate.js'
import { markGenerationsFabricated } from './fabrication.js'
import { loadLineartVersions } from './studio-version.js'
import { getLineartVersion } from './studio-version.js'
import { selectAssetVersion } from './assets.js'
import { refreshWeekSoldCount } from './weeks.js'

async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw Object.assign(new Error('Commande introuvable'), { status: 404 })
  return data
}

export async function workerDeleteOrders(orderIds) {
  const supabase = getSupabase()
  const results = []
  for (const orderId of orderIds) {
    try {
      const order = await loadOrder(supabase, orderId)
      if (order.generation_id) {
        await supabase
          .from('mini_nous_generations')
          .update({ order_id: null, updated_at: new Date().toISOString() })
          .eq('id', order.generation_id)
      }
      await supabase
        .from('mini_nous_orders')
        .update({
          status: 'cancelled',
          generation_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
      if (order.week_id) await refreshWeekSoldCount(supabase, order.week_id)
      results.push({ orderId, ok: true })
    } catch (err) {
      results.push({ orderId, ok: false, error: err.message })
    }
  }
  return results
}

export async function workerLaunchTraceV1(orderId) {
  const order = await loadOrder(getSupabase(), orderId)
  if (order.status !== 'paid') {
    throw Object.assign(new Error('Paiement requis avant de lancer le tracé'), { status: 400 })
  }
  return queueStudioGenerate(orderId, { mode: 'initial' })
}

export async function workerValidateTrace(req, orderId) {
  const supabase = getSupabase()
  const order = await loadOrder(supabase, orderId)
  if (!order.generation_id) {
    throw Object.assign(new Error('Aucun tracé à valider'), { status: 400 })
  }
  const meta = order.metadata ?? {}
  const versions = await loadLineartVersions(supabase, order.generation_id, url => url)
  let validatedStudioVersion = getLineartVersion(meta)
  const selected = versions.find(v => v.isSelected) ?? versions[versions.length - 1]
  if (selected) validatedStudioVersion = selected.studioVersion
  const resolvedVersionId = selected?.versionId ?? meta.selected_lineart_version_id ?? null
  if (resolvedVersionId) {
    await selectAssetVersion(supabase, order.generation_id, resolvedVersionId)
  }
  const validatedAt = new Date().toISOString()
  const { error } = await supabase
    .from('mini_nous_orders')
    .update({
      workflow_status: WORKFLOW_STATUS.APPROVED,
      updated_at: validatedAt,
      metadata: {
        ...meta,
        validated_at: validatedAt,
        validated_lineart_version: validatedStudioVersion,
        lineart_version: validatedStudioVersion,
        selected_lineart_version_id: resolvedVersionId,
        version_pick_required: false,
        worker_validated_at: validatedAt,
      },
    })
    .eq('id', orderId)
  if (error) throw new Error(error.message)
  return { workflowStatus: WORKFLOW_STATUS.APPROVED }
}

export async function workerFabricationDone(req, orderId) {
  const supabase = getSupabase()
  const order = await loadOrder(supabase, orderId)
  if (order.generation_id) {
    await markGenerationsFabricated(supabase, {
      generationIds: [order.generation_id],
      weekId: order.week_id,
    })
  }
  return applyAdminWorkflowStatus(req, supabase, order, WORKFLOW_STATUS.IN_PRODUCTION)
}

export async function workerMarkShipped(req, orderId) {
  const supabase = getSupabase()
  const order = await loadOrder(supabase, orderId)
  return applyAdminWorkflowStatus(req, supabase, order, WORKFLOW_STATUS.SHIPPED)
}

export async function workerMarkReceived(orderId) {
  const supabase = getSupabase()
  const order = await loadOrder(supabase, orderId)
  const now = new Date().toISOString()
  const meta = order.metadata ?? {}
  const { error } = await supabase
    .from('mini_nous_orders')
    .update({
      updated_at: now,
      metadata: { ...meta, received_at: now },
    })
    .eq('id', orderId)
  if (error) throw new Error(error.message)
  return { receivedAt: now }
}

export async function runWorkerAction(req, action, orderIds) {
  const ids = [...new Set(orderIds)].filter(Boolean)
  if (!ids.length) throw Object.assign(new Error('orderIds requis'), { status: 400 })

  const results = []
  for (const orderId of ids) {
    try {
      let result
      switch (action) {
        case 'delete':
          result = (await workerDeleteOrders([orderId]))[0]
          break
        case 'launch_trace_v1':
          result = { orderId, ok: true, ...(await workerLaunchTraceV1(orderId)) }
          break
        case 'validate_trace':
          result = { orderId, ok: true, ...(await workerValidateTrace(req, orderId)) }
          break
        case 'fabrication_done':
          result = { orderId, ok: true, ...(await workerFabricationDone(req, orderId)) }
          break
        case 'mark_shipped':
          result = { orderId, ok: true, ...(await workerMarkShipped(req, orderId)) }
          break
        case 'mark_received':
          result = { orderId, ok: true, ...(await workerMarkReceived(orderId)) }
          break
        default:
          throw Object.assign(new Error(`Action inconnue : ${action}`), { status: 400 })
      }
      results.push(result?.ok === false ? result : { orderId, ok: true, ...result })
    } catch (err) {
      results.push({ orderId, ok: false, error: err.message })
    }
  }
  return results
}
