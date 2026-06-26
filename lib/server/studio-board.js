import { getSupabase } from './supabase.js'
import { WORKFLOW_STATUS } from './order-workflow.js'
import { loadLineartVersions } from './studio-version.js'
import { publicAssetUrl } from './asset-url.js'

/** Colonnes Kanban — ordre du flux atelier → livraison. */
export const SERVER_KANBAN_COLUMNS = [
  { key: 'photo_payment', label: 'Photo · Paiement', hint: 'Photo uploadée — paiement en attente' },
  { key: 'order_step1', label: 'Step 1 lancée', hint: 'Commande passée — photo de face séparée' },
  { key: 'step1_done_step2', label: 'Step 2 lancée', hint: 'Step 1 finie — tracé v1 en cours' },
  { key: 'trace_v1', label: 'Tracé v1 fini', hint: 'Première version prête' },
  { key: 'trace_v2', label: 'Tracé v2 fini', hint: 'Ajustement automatique' },
  { key: 'trace_v3', label: 'Tracé v3 fini', hint: 'Révision équipe' },
  { key: 'validated', label: 'Validé', hint: 'En attente fabrication' },
  { key: 'fabrication', label: 'Fabrication', hint: 'Semaine en production' },
  { key: 'fabricated', label: 'Fabriqué', hint: 'Découpe terminée' },
  { key: 'shipped', label: 'Envoyé', hint: 'Colis expédié' },
  { key: 'received', label: 'Reçu', hint: 'Livré chez le client' },
]

const ACTIVE_JOB_PHASES = new Set(['queued', 'step1', 'step2'])

function studioJob(meta) {
  return meta?.studio_generate ?? null
}

function orderHasPhoto(order, assets) {
  const meta = order.metadata ?? {}
  return !!(assets?.source || meta.paywall_source_url || meta.draft_generation_id || order.generation_id)
}

export function resolveServerColumn(order, { assets, lineartVersions, generation, job }) {
  const meta = order.metadata ?? {}
  const ws = order.workflow_status

  if (meta.received_at) return 'received'
  if (ws === WORKFLOW_STATUS.SHIPPED) return 'shipped'
  if (generation?.fabricated_at) return 'fabricated'
  if (ws === WORKFLOW_STATUS.IN_PRODUCTION) return 'fabrication'
  if (ws === WORKFLOW_STATUS.APPROVED) return 'validated'

  const versionCount = lineartVersions?.length ?? 0
  if (versionCount >= 3) return 'trace_v3'
  if (versionCount >= 2) return 'trace_v2'
  if (versionCount >= 1 && assets?.step2) return 'trace_v1'

  const phase = job?.phase ?? null
  if (assets?.step1 && (!assets?.step2 || phase === 'step2' || job?.step2RequestId)) {
    return 'step1_done_step2'
  }

  if (ws === WORKFLOW_STATUS.REVISION_REQUESTED && versionCount < 3) {
    return 'step1_done_step2'
  }

  if (order.status === 'paid' && orderHasPhoto(order, assets)) {
    if (ACTIVE_JOB_PHASES.has(phase) || ws === WORKFLOW_STATUS.IN_STUDIO) {
      return 'order_step1'
    }
    if (ws === WORKFLOW_STATUS.AWAITING_PHOTO || ws === WORKFLOW_STATUS.PENDING_VALIDATION) {
      if (!assets?.step1) return 'order_step1'
    }
  }

  return 'photo_payment'
}

export function workerActionsForCard(card) {
  const job = card.studioJob
  if (job?.phase === 'error') {
    return { needsQueue: false, needsTick: false, canRetry: true }
  }
  if (job?.phase === 'done') {
    return { needsQueue: false, needsTick: false, canRetry: false }
  }

  const motorColumns = new Set(['photo_payment', 'order_step1', 'step1_done_step2'])
  if (!motorColumns.has(card.column)) {
    return { needsQueue: false, needsTick: false, canRetry: false }
  }

  if (!card.isPaid || !card.hasPhoto) {
    return { needsQueue: false, needsTick: false, canRetry: false }
  }

  if (!job || job.phase == null) {
    return { needsQueue: true, needsTick: false, canRetry: false }
  }

  if (ACTIVE_JOB_PHASES.has(job.phase)) {
    return { needsQueue: false, needsTick: true, canRetry: false }
  }

  return { needsQueue: false, needsTick: false, canRetry: false }
}

async function loadAssetsMap(supabase, generationIds) {
  const map = new Map()
  if (!generationIds.length) return map

  const { data, error } = await supabase
    .from('mini_nous_generation_steps')
    .select('generation_id, asset_type, image_url, fal_url, status')
    .in('generation_id', generationIds)
    .in('asset_type', ['source', 'step1', 'step2'])
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    if (!map.has(row.generation_id)) {
      map.set(row.generation_id, { source: null, step1: null, step2: null })
    }
    const bucket = map.get(row.generation_id)
    const url = row.image_url || row.fal_url
    if (url) bucket[row.asset_type] = url
  }
  return map
}

async function loadGenerations(supabase, generationIds) {
  const map = new Map()
  if (!generationIds.length) return map
  const { data, error } = await supabase
    .from('mini_nous_generations')
    .select('id, status, error_message, fabricated_at, updated_at')
    .in('id', generationIds)
  if (error) throw new Error(error.message)
  for (const row of data ?? []) map.set(row.id, row)
  return map
}

function pickThumb({ column, assets, lineartVersions, sourceFallback }) {
  if (['trace_v3', 'trace_v2', 'trace_v1'].includes(column)) {
    const v = column === 'trace_v1' ? 0 : column === 'trace_v2' ? 1 : 2
    return lineartVersions[v]?.url ?? assets?.step2 ?? assets?.step1 ?? sourceFallback ?? null
  }
  if (column === 'step1_done_step2') return assets?.step1 ?? sourceFallback ?? null
  if (column === 'order_step1') return sourceFallback ?? assets?.source ?? null
  return sourceFallback ?? assets?.source ?? null
}

export async function buildStudioOrderCard(req, order, { supabase, assetsMap, generationsMap, lineartCache }) {
  const meta = order.metadata ?? {}
  const generationId = order.generation_id ?? meta.draft_generation_id ?? null
  const assetsRaw = generationId ? assetsMap.get(generationId) ?? {} : {}
  const pub = url => (url ? publicAssetUrl(req, url) : null)
  const assets = {
    source: pub(assetsRaw.source || meta.paywall_source_url),
    step1: pub(assetsRaw.step1),
    step2: pub(assetsRaw.step2),
  }

  let lineartVersions = []
  if (generationId) {
    if (!lineartCache.has(generationId)) {
      lineartCache.set(
        generationId,
        await loadLineartVersions(supabase, generationId, pub),
      )
    }
    lineartVersions = lineartCache.get(generationId) ?? []
  }

  const generation = generationId ? generationsMap.get(generationId) ?? null : null
  const job = studioJob(meta)
  const hasPhoto = orderHasPhoto(order, assets)
  const column = resolveServerColumn(order, { assets: assetsRaw, lineartVersions, generation, job })
  const thumbUrl = pickThumb({
    column,
    assets,
    lineartVersions,
    sourceFallback: assets.source,
  })

  const card = {
    orderId: order.id,
    email: order.email ?? null,
    customerName: meta.customer_name ?? meta.stripe_customer_name ?? null,
    packLabel: meta.pack_label ?? null,
    faceCount: order.face_count,
    status: order.status,
    isPaid: order.status === 'paid',
    hasPhoto,
    workflowStatus: order.workflow_status,
    generationId,
    column,
    thumbUrl,
    assets,
    lineartVersions,
    studioJob: job
      ? {
          phase: job.phase ?? null,
          mode: job.mode ?? 'initial',
          error: job.error ?? null,
          updatedAt: job.updatedAt ?? null,
          step1RequestId: job.step1RequestId ?? null,
          step2RequestId: job.step2RequestId ?? null,
        }
      : null,
    generationStatus: generation?.status ?? null,
    generationError: generation?.error_message ?? null,
    updatedAt: job?.updatedAt ?? order.updated_at,
    accessToken: order.access_token ?? null,
  }

  return { ...card, ...workerActionsForCard(card) }
}

export async function buildStudioBoard(req) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('id, email, status, workflow_status, generation_id, face_count, metadata, updated_at, access_token, paid_at, created_at')
    .in('status', ['pending', 'paid'])
    .neq('workflow_status', 'cancelled')
    .order('updated_at', { ascending: false })
    .limit(120)
  if (error) throw new Error(error.message)

  const orders = data ?? []
  const generationIds = [...new Set(
    orders.map(o => o.generation_id ?? o.metadata?.draft_generation_id).filter(Boolean),
  )]

  const [assetsMap, generationsMap] = await Promise.all([
    loadAssetsMap(supabase, generationIds),
    loadGenerations(supabase, generationIds),
  ])

  const lineartCache = new Map()
  const cards = []
  for (const order of orders) {
    const card = await buildStudioOrderCard(req, order, { supabase, assetsMap, generationsMap, lineartCache })
    cards.push(card)
  }

  const columns = Object.fromEntries(SERVER_KANBAN_COLUMNS.map(c => [c.key, []]))
  for (const card of cards) {
    if (columns[card.column]) columns[card.column].push(card)
  }

  const motorJobs = cards.filter(c => c.needsQueue || c.needsTick || c.canRetry)
  motorJobs.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))

  return {
    columns: SERVER_KANBAN_COLUMNS,
    byColumn: columns,
    cards,
    motorJobs,
    pending: motorJobs.filter(c => c.needsQueue || c.needsTick).length,
    errors: motorJobs.filter(c => c.canRetry).length,
  }
}

export async function buildStudioOrderDetail(req, orderId) {
  const supabase = getSupabase()
  const { data: order, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!order) return null

  const generationId = order.generation_id ?? order.metadata?.draft_generation_id ?? null
  const [assetsMap, generationsMap] = await Promise.all([
    loadAssetsMap(supabase, generationId ? [generationId] : []),
    loadGenerations(supabase, generationId ? [generationId] : []),
  ])

  const lineartCache = new Map()
  const card = await buildStudioOrderCard(req, order, { supabase, assetsMap, generationsMap, lineartCache })

  const { data: steps } = generationId
    ? await supabase
      .from('mini_nous_generation_steps')
      .select('asset_type, image_url, fal_url, status, updated_at')
      .eq('generation_id', generationId)
      .order('updated_at', { ascending: true })
    : { data: [] }

  const pub = url => (url ? publicAssetUrl(req, url) : null)
  const stepRows = (steps ?? []).map(s => ({
    assetType: s.asset_type,
    url: pub(s.image_url || s.fal_url),
    status: s.status,
    updatedAt: s.updated_at,
  }))

  return {
    ...card,
    steps: stepRows,
    week: order.week
      ? { shipDate: order.week.ship_date, status: order.week.status }
      : null,
    metadata: {
      packLabel: order.metadata?.pack_label,
      lineartVersion: order.metadata?.lineart_version,
      validatedLineartVersion: order.metadata?.validated_lineart_version,
      regenCount: order.metadata?.regen_count,
      receivedAt: order.metadata?.received_at ?? null,
    },
  }
}

export function pickNextWorkerJob(jobs) {
  const actionable = (jobs ?? []).filter(j => j.needsTick || j.needsQueue)
  if (!actionable.length) return null
  actionable.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
  return actionable.find(j => j.needsTick) ?? actionable[0]
}
