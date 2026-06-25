import { WORKFLOW_STATUS } from './order-workflow.js'
import { loadOrderContext } from './order-workflow.js'
import { getLineartVersion } from './studio-version.js'
import { publicAssetUrl } from './asset-url.js'
import { resolveValidatedLineartUrl } from './lineart-resolve.js'
import { attachLoyaltyCouponToOrder } from './promo-coupon.js'
import {
  sendShippedEmailIfNeeded,
} from './order-email.js'

/** Statuts modifiables par drag-and-drop admin. */
export const ADMIN_WORKFLOW_TARGETS = [
  WORKFLOW_STATUS.APPROVED,
  WORKFLOW_STATUS.IN_PRODUCTION,
  WORKFLOW_STATUS.SHIPPED,
]

export async function applyAdminWorkflowStatus(req, supabase, order, targetStatus) {
  if (!ADMIN_WORKFLOW_TARGETS.includes(targetStatus)) {
    throw Object.assign(new Error('Statut admin invalide'), { status: 400 })
  }

  const meta = order.metadata ?? {}
  const now = new Date().toISOString()
  const patchMeta = {
    ...meta,
    admin_workflow_updated_at: now,
    admin_workflow_status: targetStatus,
  }

  if (targetStatus === WORKFLOW_STATUS.APPROVED) {
    if (!order.generation_id) {
      throw Object.assign(new Error('Génération requise avant « prêt à fabriquer »'), { status: 400 })
    }
    patchMeta.validated_at = meta.validated_at ?? now
    patchMeta.admin_approved_at = now
  }

  if (targetStatus === WORKFLOW_STATUS.IN_PRODUCTION) {
    patchMeta.fabrication_started_at = meta.fabrication_started_at ?? now
    patchMeta.fabrication_completed_at = now
  }

  if (targetStatus === WORKFLOW_STATUS.SHIPPED) {
    if (!order.email) {
      throw Object.assign(new Error('E-mail client requis pour marquer expédié'), { status: 400 })
    }
    patchMeta.shipped_at = now
    patchMeta.fabrication_completed_at = meta.fabrication_completed_at ?? now
  }

  const { error } = await supabase
    .from('mini_nous_orders')
    .update({
      workflow_status: targetStatus,
      updated_at: now,
      metadata: patchMeta,
    })
    .eq('id', order.id)

  if (error) throw new Error(error.message)

  const { previewUrl: rawPreview, sourcePhotoUrl: rawPhoto } = await loadOrderContext(supabase, order)
  const validatedLineartUrl = await resolveValidatedLineartUrl(
    supabase,
    { ...order, metadata: patchMeta },
    (url) => publicAssetUrl(req, url),
  )
  const previewUrl = validatedLineartUrl ?? publicAssetUrl(req, rawPreview)
  const sourcePhotoUrl = publicAssetUrl(req, rawPhoto ?? meta.paywall_source_url)
  const lineartVersion = Number(patchMeta.validated_lineart_version) || getLineartVersion(patchMeta)

  if (targetStatus === WORKFLOW_STATUS.SHIPPED) {
    let loyaltyCouponCode = patchMeta.loyalty_coupon_code
    try {
      const coupon = await attachLoyaltyCouponToOrder(order.id, order.email)
      loyaltyCouponCode = coupon.code
      patchMeta.loyalty_coupon_code = coupon.code
    } catch (err) {
      console.error('[admin-workflow loyalty-coupon]', err)
    }

    await sendShippedEmailIfNeeded(req, {
      orderId: order.id,
      email: order.email,
      accessToken: order.access_token,
      packLabel: meta.pack_label,
      faceCount: order.face_count,
      previewUrl,
      sourcePhotoUrl,
      lineartVersion,
      customerName: order.customer_name,
      loyaltyCouponCode,
    }).catch(err => console.error('[admin-workflow shipped-email]', err))
  }

  return { workflowStatus: targetStatus }
}
