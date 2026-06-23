import { MAX_FACES } from './packs.js'
import { customerDeliveryLabel } from './delivery-dates.js'

/** Statuts visibles côté client (parcours post-paiement). */
export const WORKFLOW_STATUS = {
  AWAITING_PHOTO: 'awaiting_photo',
  IN_STUDIO: 'in_studio',
  PENDING_VALIDATION: 'pending_validation',
  REVISION_REQUESTED: 'revision_requested',
  APPROVED: 'approved',
  IN_PRODUCTION: 'in_production',
  SHIPPED: 'shipped',
}

export const WORKFLOW_META = {
  awaiting_photo: {
    label: 'En attente de votre photo',
    hint: 'Envoyez votre photo de groupe pour lancer la création de vos figurines.',
    step: 1,
  },
  in_studio: {
    label: 'Design en cours',
    hint: 'Votre photo est en cours de transformation en tracé atelier.',
    step: 2,
  },
  pending_validation: {
    label: 'À valider',
    hint: 'Votre tracé est prêt — validez-le avant l\'impression.',
    step: 2,
  },
  revision_requested: {
    label: 'Révision en cours',
    hint: 'Notre équipe reprend votre tracé — réponse sous 24 h.',
    step: 2,
  },
  approved: {
    label: 'Prêt à fabriquer',
    hint: 'Votre tracé est validé — vos figurines entrent en file d\'impression.',
    step: 3,
  },
  in_production: {
    label: 'Fabrication terminée',
    hint: 'Découpe et finition réalisées — en attente d\'expédition.',
    step: 3,
  },
  shipped: {
    label: 'Expédié',
    hint: 'Votre colis est en route.',
    step: 4,
  },
}

const EDITABLE_STATUSES = new Set([
  WORKFLOW_STATUS.AWAITING_PHOTO,
  WORKFLOW_STATUS.IN_STUDIO,
  WORKFLOW_STATUS.PENDING_VALIDATION,
  WORKFLOW_STATUS.REVISION_REQUESTED,
  WORKFLOW_STATUS.APPROVED,
])

export function computeWorkflowStatus({ order, generation, week }) {
  const stored = order?.workflow_status
  if (stored === WORKFLOW_STATUS.SHIPPED) return WORKFLOW_STATUS.SHIPPED
  if (stored === WORKFLOW_STATUS.IN_PRODUCTION) return WORKFLOW_STATUS.IN_PRODUCTION
  if (stored === WORKFLOW_STATUS.REVISION_REQUESTED) return WORKFLOW_STATUS.REVISION_REQUESTED
  if (stored === WORKFLOW_STATUS.PENDING_VALIDATION) return WORKFLOW_STATUS.PENDING_VALIDATION
  if (stored === WORKFLOW_STATUS.APPROVED) return WORKFLOW_STATUS.APPROVED
  if (stored === WORKFLOW_STATUS.AWAITING_PHOTO) return WORKFLOW_STATUS.AWAITING_PHOTO
  if (stored === WORKFLOW_STATUS.IN_STUDIO) return WORKFLOW_STATUS.IN_STUDIO

  if (generation?.fabricated_at) return WORKFLOW_STATUS.IN_PRODUCTION
  if (week?.status === 'in_production') return WORKFLOW_STATUS.IN_PRODUCTION

  if (order?.generation_id) return WORKFLOW_STATUS.IN_STUDIO
  return WORKFLOW_STATUS.AWAITING_PHOTO
}

export function isOrderEditable({ workflowStatus, generation }) {
  if (generation?.fabricated_at) return false
  if (workflowStatus === WORKFLOW_STATUS.IN_PRODUCTION) return false
  if (workflowStatus === WORKFLOW_STATUS.SHIPPED) return false
  return EDITABLE_STATUSES.has(workflowStatus)
}

export async function loadOrderContext(supabase, order) {
  if (!order) return { generation: null, previewUrl: null, lineartUrl: null, sourcePhotoUrl: null }

  const generationId = order.generation_id ?? order.metadata?.draft_generation_id ?? null
  let generation = null
  if (generationId) {
    const { data } = await supabase
      .from('mini_nous_generations')
      .select('id, status, error_message, fabricated_at, fabricated_week_id, updated_at')
      .eq('id', generationId)
      .maybeSingle()
    generation = data
  }

  let previewUrl = null
  let lineartUrl = null
  let sourcePhotoUrl = order.metadata?.paywall_source_url ?? null

  if (generationId) {
    const { data: steps } = await supabase
      .from('mini_nous_generation_steps')
      .select('asset_type, image_url')
      .eq('generation_id', generationId)
      .in('asset_type', ['step2', 'step1', 'source'])
    const stepMap = Object.fromEntries((steps ?? []).map(s => [s.asset_type, s.image_url]))
    sourcePhotoUrl = stepMap.source || sourcePhotoUrl
    lineartUrl = stepMap.step2 || null
    previewUrl = lineartUrl || stepMap.step1 || null

    if (!sourcePhotoUrl) {
      const { data: version } = await supabase
        .from('mini_nous_asset_versions')
        .select('image_url')
        .eq('generation_id', generationId)
        .eq('asset_type', 'source')
        .eq('is_selected', true)
        .is('deleted_at', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      sourcePhotoUrl = version?.image_url ?? sourcePhotoUrl
    }
  }

  return { generation, previewUrl, lineartUrl, sourcePhotoUrl }
}

export async function syncOrderWorkflowStatus(supabase, order, { generation, week } = {}) {
  const next = computeWorkflowStatus({ order, generation, week: week ?? order.week })
  if (order.workflow_status === next) return next

  const { error } = await supabase
    .from('mini_nous_orders')
    .update({ workflow_status: next, updated_at: new Date().toISOString() })
    .eq('id', order.id)

  if (error) {
    console.warn('[order-workflow] sync skip:', error.message)
    return order.workflow_status ?? next
  }
  return next
}

export function buildCustomerOrderPayload({
  order, generation, previewUrl, lineartUrl, sourcePhotoUrl, siteUrl,
}) {
  const site = (siteUrl || process.env.SITE_URL || 'https://mininous.app').replace(/\/$/, '')
  const token = order.access_token
  const workflowStatus = computeWorkflowStatus({
    order,
    generation,
    week: order.week,
  })
  const meta = WORKFLOW_META[workflowStatus] ?? WORKFLOW_META.awaiting_photo
  const packLabel = order.metadata?.pack_label
    ?? order.pack_type
  const amountEur = order.amount_cents != null
    ? (order.amount_cents / 100).toFixed(2)
    : null

  return {
    id: order.id,
    packType: order.metadata?.base_pack ?? order.pack_type,
    packLabel,
    faceCount: order.face_count,
    email: order.email,
    customerName: order.customer_name,
    generationId: order.generation_id ?? order.metadata?.draft_generation_id ?? null,
    shipDate: order.week?.ship_date ?? null,
    fridayDelivery: !!order.metadata?.friday_delivery,
    deliveryDateLabel: customerDeliveryLabel(
      order.week?.ship_date ?? null,
      !!order.metadata?.friday_delivery,
    ),
    cutoffAt: order.week?.cutoff_at ?? null,
    paidAt: order.paid_at ?? null,
    amountEur,
    workflowStatus,
    workflowLabel: meta.label,
    workflowHint: meta.hint,
    workflowStep: meta.step,
    editable: isOrderEditable({
      workflowStatus,
      generation,
      week: order.week,
    }),
    previewUrl,
    lineartUrl: lineartUrl ?? null,
    sourcePhotoUrl: sourcePhotoUrl ?? null,
    hasPaywallPhoto: !!sourcePhotoUrl,
    generationStatus: generation?.status ?? null,
    generationError: generation?.error_message ?? null,
    generationUpdatedAt: generation?.updated_at ?? null,
    links: {
      status: `${site}/pipeline/commande?order=${encodeURIComponent(token)}`,
      studio: `${site}/pipeline/studio?order=${encodeURIComponent(token)}&auto=1`,
      shop: site,
    },
    paymentStatus: order.status,
    isPaid: order.status === 'paid',
    childCount: Number(order.metadata?.child_count) || 0,
    maxFaces: MAX_FACES,
  }
}

export async function markOrdersInProductionForGenerations(supabase, generationIds) {
  const ids = [...new Set(generationIds)].filter(Boolean)
  if (!ids.length) return

  const { error } = await supabase
    .from('mini_nous_orders')
    .update({
      workflow_status: WORKFLOW_STATUS.IN_PRODUCTION,
      updated_at: new Date().toISOString(),
    })
    .in('generation_id', ids)
    .eq('status', 'paid')

  if (error) console.warn('[order-workflow] in_production:', error.message)
}
