import { getOrderByToken } from './orders.js'
import { getSupabase } from './supabase.js'
import { hasAdminAccess, isAdminEmail } from './admin.js'
import {
  buildCustomerOrderPayload,
  isOrderEditable,
  loadOrderContext,
  syncOrderWorkflowStatus,
  WORKFLOW_STATUS,
} from './order-workflow.js'
import { getSiteUrl } from './stripe-client.js'
import { publicAssetUrl } from './asset-url.js'
import { getLineartVersion, getStudioCaps, loadLineartVersions } from './studio-version.js'
import { resolveValidatedLineartUrl } from './lineart-resolve.js'

const MAX_REGEN = 3

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

export async function requireOrderByToken(token, authUser = null) {
  const order = await getOrderByToken(token)
  if (!order) {
    throw Object.assign(new Error('Commande introuvable'), { status: 404 })
  }
  if (order.status === 'cancelled') {
    throw Object.assign(new Error('Commande introuvable'), { status: 404 })
  }
  if (authUser?.id && order.status === 'paid') {
    if (order.user_id && order.user_id !== authUser.id) {
      if (!isAdminEmail(authUser.email)) {
        throw Object.assign(new Error('Accès refusé à cette commande'), { status: 403 })
      }
    }
    if (!order.user_id) {
      await linkOrderToUser(order.id, authUser.id)
      order.user_id = authUser.id
    }
  }
  return order
}

export async function requirePaidOrderByToken(token, authUser = null) {
  const order = await requireOrderByToken(token, authUser)
  if (order.status !== 'paid') {
    throw Object.assign(new Error('Paiement non confirmé'), { status: 402 })
  }
  return order
}

export async function buildOrderResponse(req, order, authUser = null) {
  const supabase = getSupabase()
  const { generation, previewUrl, lineartUrl, sourcePhotoUrl } = await loadOrderContext(supabase, order)
  let workflowStatus = await syncOrderWorkflowStatus(supabase, order, { generation })
  const now = Date.now()

  if (
    lineartUrl
    && workflowStatus === WORKFLOW_STATUS.IN_STUDIO
    && order.status === 'paid'
  ) {
    const { error } = await supabase
      .from('mini_nous_orders')
      .update({
        workflow_status: WORKFLOW_STATUS.PENDING_VALIDATION,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
    if (!error) workflowStatus = WORKFLOW_STATUS.PENDING_VALIDATION
    if (generation?.status === 'running') {
      await supabase
        .from('mini_nous_generations')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', generation.id)
    }
  }

  let generationStatus = generation?.status ?? null
  let generationError = generation?.error_message ?? null
  if (
    generationStatus === 'running'
    && !lineartUrl
    && generation?.updated_at
    && now - new Date(generation.updated_at).getTime() > 20 * 60 * 1000
  ) {
    generationStatus = 'error'
    generationError = generationError || 'Traitement interrompu — relancez depuis le studio.'
    await supabase
      .from('mini_nous_generations')
      .update({
        status: 'error',
        error_message: generationError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', generation.id)
  }

  const orderWithWorkflow = { ...order, workflow_status: workflowStatus }
  const regenCount = Number(order.metadata?.regen_count) || 0
  const admin = hasAdminAccess(req, authUser)
  const lineartVersions = await loadLineartVersions(
    supabase,
    order.generation_id,
    (url) => publicAssetUrl(req, url),
  )
  const validatedLineartVersion = Number(order.metadata?.validated_lineart_version) || null
  const lineartVersion = validatedLineartVersion && ['approved', 'in_production', 'shipped'].includes(workflowStatus)
    ? validatedLineartVersion
    : getLineartVersion(order.metadata)
  const validatedLineartUrl = await resolveValidatedLineartUrl(
    supabase,
    order,
    (url) => publicAssetUrl(req, url),
  )
  const studio = getStudioCaps(order.metadata, workflowStatus, admin, lineartVersions.length)
  const resolvedPreview = lineartUrl || null
  const generationForPayload = generation
    ? { ...generation, status: generationStatus, error_message: generationError }
    : null
  const payload = buildCustomerOrderPayload({
    order: orderWithWorkflow,
    generation: generationForPayload,
    previewUrl: publicAssetUrl(req, resolvedPreview),
    lineartUrl: publicAssetUrl(req, lineartUrl),
    sourcePhotoUrl: publicAssetUrl(req, sourcePhotoUrl),
    siteUrl: getSiteUrl(req),
  })
  const editable = order.status === 'paid' && (admin || isOrderEditable({
    workflowStatus,
    generation,
    week: order.week,
  }))
  const paywallPhotoReplacements = Number(order.metadata?.paywall_photo_replacements) || 0
  const sg = order.metadata?.studio_generate
  const studioGenerateActive = !!(
    sg
    && !['done', 'error', 'awaiting_photo'].includes(sg.phase)
    && !lineartUrl
    && order.status === 'paid'
  )
  return {
    ...payload,
    editable,
    regenCount,
    lineartVersion,
    studio,
    lineartVersions,
    validatedLineartUrl,
    validatedLineartVersion,
    shippingAddress: order.metadata?.shipping_address ?? null,
    shippingZone: order.metadata?.shipping_zone ?? 'fr',
    loyaltyCouponCode: order.metadata?.loyalty_coupon_code ?? null,
    npsScore: order.metadata?.nps_score ?? null,
    npsSubmittedAt: order.metadata?.nps_submitted_at ?? null,
    mininousShareUrl: order.metadata?.mininous_share_url ?? null,
    newsletterOptIn: !!order.metadata?.newsletter_opt_in,
    invoiceUrl: order.metadata?.invoice_url ?? null,
    regenRemaining: studio.canAutoAdjust || studio.canManualAdjust ? 1 : 0,
    revisionDueAt: order.metadata?.revision_due_at ?? null,
    accessToken: order.access_token,
    isAdminView: admin,
    canReplacePaywallPhoto: order.status === 'pending'
      && !!sourcePhotoUrl
      && paywallPhotoReplacements < 1,
    paywallPhotoReplaced: paywallPhotoReplacements >= 1,
    studioGenerateActive,
    studioGeneratePhase: sg?.phase ?? null,
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

export async function listAllPaidOrders() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return data ?? []
}
