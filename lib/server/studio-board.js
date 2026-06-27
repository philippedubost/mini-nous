import { getSupabase } from './supabase.js'
import { WORKFLOW_STATUS } from './order-workflow.js'
import { publicAssetUrl } from './asset-url.js'
import { resolveCustomerFirstName } from './customer-name.js'

/** Colonnes Kanban — ordre du flux atelier → livraison. */
export const SERVER_KANBAN_COLUMNS = [
  { key: 'photo_payment', label: 'Paiement en attente', hint: 'Photo uploadée — paiement ou lancement' },
  { key: 'order_step1', label: 'Step 1 lancée', hint: 'Commande passée — photo de face séparée' },
  { key: 'step1_done_step2', label: 'Step 2 lancée', hint: 'Step 1 finie — tracé v1 en cours' },
  { key: 'trace_v1', label: 'Tracé v1 fini', hint: 'Première version prête' },
  { key: 'trace_v2', label: 'Tracé v2 fini', hint: 'Ajustement automatique' },
  { key: 'trace_v3', label: 'Tracé v3 fini', hint: 'Révision équipe' },
  { key: 'validated_fabrication', label: 'Validé · Fabrication', hint: 'Tracé validé — en production' },
  { key: 'fabricated', label: 'Fabriqué', hint: 'Découpe terminée' },
  { key: 'shipped', label: 'Expédié', hint: 'Colis expédié' },
  { key: 'received', label: 'Reçu', hint: 'Livré chez le client' },
]

const ACTIVE_JOB_PHASES = new Set(['queued', 'step1', 'step2'])
const MS_24H = 24 * 60 * 60 * 1000

function cardHasFalError(card) {
  return !!(card.studioJob?.phase === 'error' || card.studioJob?.error)
}

function cardHasLaserError(card) {
  return !!(card.studioLaser?.phase === 'error' || card.studioLaser?.error)
}

function cardHasGenerationError(card) {
  return !!card.generationError
}

function cardHasAnyError(card) {
  return cardHasFalError(card)
    || cardHasLaserError(card)
    || cardHasGenerationError(card)
    || (card.errorLog?.length ?? 0) > 0
}

function resolveCardErrorKind(card) {
  if (cardHasLaserError(card)) return 'laser'
  if (cardHasFalError(card)) return 'fal'
  if (cardHasGenerationError(card)) return 'generation'
  const log = card.errorLog
  if (log?.length) {
    const last = log[log.length - 1]
    if (last.source === 'studio_laser' || last.step === 'laser') return 'laser'
    if (last.source === 'generation') return 'generation'
    return 'studio'
  }
  return null
}

function cardStuckMs(card) {
  const ts = card.studioJob?.updatedAt ?? card.updatedAt
  if (!ts) return 0
  const ms = Date.now() - new Date(ts).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

function isBlocked24h(card) {
  if (card.column === 'received') return false
  if (card.needsTick) return false
  return cardStuckMs(card) >= MS_24H
}

function buildErrorLog(job, generationError, laser) {
  const log = [...(job?.errorLog ?? []), ...(laser?.errorLog ?? [])]
  if (laser?.error) {
    const msg = String(laser.error)
    if (!log.some(e => e.message === msg)) {
      log.push({
        at: laser.updatedAt ?? null,
        phase: 'error',
        step: 'laser',
        message: msg,
        source: 'studio_laser',
      })
    }
  }
  if (generationError) {
    const msg = String(generationError)
    const hasMsg = log.some(e => e.message === msg)
    if (!hasMsg) {
      log.push({
        at: job?.updatedAt ?? null,
        phase: 'error',
        step: job?.phase ?? null,
        message: msg,
        source: 'generation',
      })
    }
  }
  return log.slice(-30)
}

function studioJob(meta) {
  return meta?.studio_generate ?? null
}

function laserJob(meta) {
  return meta?.studio_laser ?? null
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
  const isValidatedForFabrication = ws === WORKFLOW_STATUS.IN_PRODUCTION
    || ws === WORKFLOW_STATUS.APPROVED
    || meta.validated_at
    || meta.worker_validated_at
  if (isValidatedForFabrication) {
    return 'validated_fabrication'
  }

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
  const laser = card.studioLaser

  if (card.column === 'validated_fabrication' && !card.hasLaserSvg) {
    if (laser?.phase === 'running') {
      return { needsQueue: false, needsTick: false, canRetry: false }
    }
    if (laser?.phase === 'error') {
      return { needsQueue: false, needsTick: false, canRetry: true }
    }
    if (laser?.phase === 'queued') {
      return { needsQueue: false, needsTick: true, canRetry: false }
    }
    return { needsQueue: true, needsTick: false, canRetry: false }
  }

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

async function loadLineartCountsMap(supabase, generationIds) {
  const map = new Map()
  if (!generationIds.length) return map

  const { data, error } = await supabase
    .from('mini_nous_asset_versions')
    .select('generation_id')
    .in('generation_id', generationIds)
    .eq('asset_type', 'step2')
    .is('deleted_at', null)
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    map.set(row.generation_id, (map.get(row.generation_id) || 0) + 1)
  }
  return map
}

function lineartVersionsStub(count) {
  return Array.from({ length: count }, () => ({ url: null }))
}

function toKanbanCard(card) {
  return {
    orderId: card.orderId,
    email: card.email,
    customerName: card.customerName,
    displayName: card.displayName,
    faceCount: card.faceCount,
    weekKey: card.weekKey,
    weekShipDate: card.weekShipDate,
    status: card.status,
    isPaid: card.isPaid,
    hasPhoto: card.hasPhoto,
    workflowStatus: card.workflowStatus,
    generationId: card.generationId,
    column: card.column,
    thumbUrl: card.thumbUrl,
    studioJob: card.studioJob
      ? {
          phase: card.studioJob.phase,
          mode: card.studioJob.mode,
          error: card.studioJob.error,
          updatedAt: card.studioJob.updatedAt,
        }
      : null,
    studioLaser: card.studioLaser
      ? {
          phase: card.studioLaser.phase,
          error: card.studioLaser.error,
          log: card.studioLaser.log,
          updatedAt: card.studioLaser.updatedAt,
        }
      : null,
    hasLaserSvg: card.hasLaserSvg,
    generationStatus: card.generationStatus,
    generationError: card.generationError,
    errorLog: card.errorLog,
    updatedAt: card.updatedAt,
    accessToken: card.accessToken,
    needsQueue: card.needsQueue,
    needsTick: card.needsTick,
    canRetry: card.canRetry,
    hasFalError: card.hasFalError,
    hasLaserError: card.hasLaserError,
    hasGenerationError: card.hasGenerationError,
    hasAnyError: card.hasAnyError,
    errorKind: card.errorKind,
    isBlocked24h: card.isBlocked24h,
    stuckHours: card.stuckHours,
  }
}

async function loadLaserSvgMap(supabase, generationIds) {
  const map = new Map()
  if (!generationIds.length) return map
  const { data, error } = await supabase
    .from('mini_nous_generation_steps')
    .select('generation_id, image_url, fal_url')
    .in('generation_id', generationIds)
    .eq('asset_type', 'laser_merged')
  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    map.set(row.generation_id, !!(row.image_url || row.fal_url))
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

function pickThumb({ column, assets, lineartVersions, sourceFallback, kanbanThumb }) {
  if (kanbanThumb) return kanbanThumb
  if (['trace_v3', 'trace_v2', 'trace_v1'].includes(column)) {
    const v = column === 'trace_v1' ? 0 : column === 'trace_v2' ? 1 : 2
    return lineartVersions[v]?.url ?? assets?.step2 ?? assets?.step1 ?? sourceFallback ?? null
  }
  if (column === 'step1_done_step2') return assets?.step1 ?? sourceFallback ?? null
  if (column === 'order_step1') return sourceFallback ?? assets?.source ?? null
  return sourceFallback ?? assets?.source ?? null
}

export async function buildStudioOrderCard(req, order, {
  supabase, assetsMap, generationsMap, lineartCountsMap, laserSvgMap, detail = false,
}) {
  const meta = order.metadata ?? {}
  const generationId = order.generation_id ?? meta.draft_generation_id ?? null
  const assetsRaw = generationId ? assetsMap.get(generationId) ?? {} : {}
  const pub = url => (url ? publicAssetUrl(req, url) : null)
  const kanbanThumb = pub(meta.kanban_thumb_url)
  const assets = detail
    ? {
        source: pub(assetsRaw.source || meta.paywall_source_url),
        step1: pub(assetsRaw.step1),
        step2: pub(assetsRaw.step2),
      }
    : null

  const versionCount = generationId ? (lineartCountsMap?.get(generationId) ?? 0) : 0
  let lineartVersions = lineartVersionsStub(versionCount)

  if (detail && generationId) {
    const { loadLineartVersions } = await import('./studio-version.js')
    lineartVersions = await loadLineartVersions(supabase, generationId, pub)
  }

  const generation = generationId ? generationsMap.get(generationId) ?? null : null
  const job = studioJob(meta)
  const laser = laserJob(meta)
  const hasLaserSvg = generationId ? (laserSvgMap?.get(generationId) ?? false) : false
  const errorLog = buildErrorLog(job, generation?.error_message ?? null, laser)
  const hasPhoto = orderHasPhoto(order, assetsRaw)
  const column = resolveServerColumn(order, { assets: assetsRaw, lineartVersions, generation, job })
  const assetsForThumb = {
    source: pub(assetsRaw.source || meta.paywall_source_url),
    step1: pub(assetsRaw.step1),
    step2: pub(assetsRaw.step2),
  }
  const thumbUrl = pickThumb({
    column,
    assets: assetsForThumb,
    lineartVersions,
    sourceFallback: kanbanThumb || assetsForThumb.source,
    kanbanThumb,
  })

  const firstName = resolveCustomerFirstName({
    customer_name: order.customer_name,
    customerName: order.customer_name,
    metadata: meta,
  })
  const displayName = firstName
    || (order.email ? order.email.split('@')[0] : null)
    || 'Client'

  const card = {
    orderId: order.id,
    email: order.email ?? null,
    customerName: order.customer_name ?? meta.customer_name ?? null,
    displayName,
    packLabel: meta.pack_label ?? null,
    faceCount: order.face_count,
    weekKey: order.week?.week_key ?? null,
    weekShipDate: order.week?.ship_date ?? null,
    weekId: order.week_id ?? null,
    status: order.status,
    isPaid: order.status === 'paid',
    hasPhoto,
    workflowStatus: order.workflow_status,
    generationId,
    column,
    thumbUrl,
    ...(detail ? { assets, lineartVersions } : {}),
    studioJob: job
      ? {
          phase: job.phase ?? null,
          mode: job.mode ?? 'initial',
          error: job.error ?? null,
          errorLog,
          updatedAt: job.updatedAt ?? null,
          step1RequestId: job.step1RequestId ?? null,
          step2RequestId: job.step2RequestId ?? null,
        }
      : null,
    studioLaser: laser
      ? {
          phase: laser.phase ?? null,
          error: laser.error ?? null,
          log: laser.log ?? null,
          errorLog: laser.errorLog ?? [],
          updatedAt: laser.updatedAt ?? null,
        }
      : null,
    hasLaserSvg,
    generationStatus: generation?.status ?? null,
    generationError: generation?.error_message ?? null,
    errorLog,
    updatedAt: job?.updatedAt ?? order.updated_at,
    accessToken: order.access_token ?? null,
  }

  const enriched = { ...card, ...workerActionsForCard(card) }
  const withErrors = {
    ...enriched,
    hasFalError: cardHasFalError(enriched),
    hasLaserError: cardHasLaserError(enriched),
    hasGenerationError: cardHasGenerationError(enriched),
  }
  withErrors.hasAnyError = cardHasAnyError(withErrors)
  withErrors.errorKind = resolveCardErrorKind(withErrors)
  return {
    ...withErrors,
    isBlocked24h: isBlocked24h(withErrors),
    stuckHours: Math.floor(cardStuckMs(withErrors) / (60 * 60 * 1000)),
  }
}

export async function buildStudioBoard(req, { weekKey = null } = {}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('id, email, status, workflow_status, generation_id, face_count, metadata, updated_at, access_token, paid_at, created_at, week_id, customer_name, week:mini_nous_production_weeks(week_key, ship_date)')
    .in('status', ['pending', 'paid'])
    .order('updated_at', { ascending: false })
    .limit(400)
  if (error) throw new Error(error.message)

  let orders = data ?? []
  if (weekKey) {
    orders = orders.filter(o => o.week?.week_key === weekKey)
  }

  const { data: weeksRaw } = await supabase
    .from('mini_nous_production_weeks')
    .select('week_key, ship_date, sold_count, capacity')
    .order('ship_date', { ascending: false })
    .limit(24)

  const weeks = (weeksRaw ?? []).map(w => ({
    weekKey: w.week_key,
    shipDate: w.ship_date,
    soldCount: w.sold_count,
    capacity: w.capacity,
  }))
  const generationIds = [...new Set(
    orders.map(o => o.generation_id ?? o.metadata?.draft_generation_id).filter(Boolean),
  )]

  const [assetsMap, generationsMap, lineartCountsMap, laserSvgMap] = await Promise.all([
    loadAssetsMap(supabase, generationIds),
    loadGenerations(supabase, generationIds),
    loadLineartCountsMap(supabase, generationIds),
    loadLaserSvgMap(supabase, generationIds),
  ])

  const cards = await Promise.all(
    orders.map(order => buildStudioOrderCard(req, order, {
      supabase, assetsMap, generationsMap, lineartCountsMap, laserSvgMap, detail: false,
    })),
  )
  const kanbanCards = cards.map(toKanbanCard)

  const columns = Object.fromEntries(SERVER_KANBAN_COLUMNS.map(c => [c.key, []]))
  const columnTotals = Object.fromEntries(
    SERVER_KANBAN_COLUMNS.map(c => [c.key, { orders: 0, faces: 0, errors: 0, blocked24h: 0 }]),
  )
  for (const card of kanbanCards) {
    if (columns[card.column]) {
      columns[card.column].push(card)
      columnTotals[card.column].orders += 1
      columnTotals[card.column].faces += Number(card.faceCount) || 0
      if (card.hasAnyError) columnTotals[card.column].errors += 1
      if (card.isBlocked24h) columnTotals[card.column].blocked24h += 1
    }
  }

  const motorJobs = kanbanCards.filter(c => c.needsQueue || c.needsTick || c.canRetry)
  motorJobs.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))

  const totalFaces = kanbanCards.reduce((n, c) => n + (Number(c.faceCount) || 0), 0)

  return {
    columns: SERVER_KANBAN_COLUMNS,
    byColumn: columns,
    columnTotals,
    cards: kanbanCards,
    motorJobs,
    weeks,
    totalOrders: kanbanCards.length,
    totalFaces,
    pending: motorJobs.filter(c => c.needsQueue || c.needsTick).length,
    errors: motorJobs.filter(c => c.hasAnyError).length,
    blocked24h: kanbanCards.filter(c => c.isBlocked24h).length,
    falErrors: kanbanCards.filter(c => c.hasFalError).length,
    laserErrors: kanbanCards.filter(c => c.hasLaserError).length,
    generationErrors: kanbanCards.filter(c => c.hasGenerationError).length,
    totalErrors: kanbanCards.filter(c => c.hasAnyError).length,
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
  const [assetsMap, generationsMap, lineartCountsMap, laserSvgMap] = await Promise.all([
    loadAssetsMap(supabase, generationId ? [generationId] : []),
    loadGenerations(supabase, generationId ? [generationId] : []),
    loadLineartCountsMap(supabase, generationId ? [generationId] : []),
    loadLaserSvgMap(supabase, generationId ? [generationId] : []),
  ])

  const card = await buildStudioOrderCard(req, order, {
    supabase, assetsMap, generationsMap, lineartCountsMap, laserSvgMap, detail: true,
  })

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

export function isWorkerJobActionable(job) {
  if (!job?.needsTick && !job?.needsQueue) return false
  if (job.studioJob?.phase === 'error') return false
  if (job.studioLaser?.phase === 'error') return false
  return true
}

export function pickNextWorkerJob(jobs) {
  const actionable = (jobs ?? []).filter(isWorkerJobActionable)
  if (!actionable.length) return null
  actionable.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
  return actionable.find(j => j.needsTick) ?? actionable[0]
}
