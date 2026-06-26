import { getSupabase } from './supabase.js'
import { WORKFLOW_STATUS } from './order-workflow.js'

const ACTIVE_PHASES = new Set(['queued', 'step1', 'step2'])
const STUDIO_WORKFLOWS = new Set([
  WORKFLOW_STATUS.AWAITING_PHOTO,
  WORKFLOW_STATUS.IN_STUDIO,
  WORKFLOW_STATUS.REVISION_REQUESTED,
])

function studioJob(meta) {
  return meta?.studio_generate ?? null
}

function orderHasPhoto(order) {
  const meta = order.metadata ?? {}
  return !!(meta.paywall_source_url || meta.draft_generation_id || order.generation_id)
}

export function summarizeOrderForWorker(order) {
  const meta = order.metadata ?? {}
  const job = studioJob(meta)
  const phase = job?.phase ?? null

  if (order.status !== 'paid') return null
  if (!orderHasPhoto(order)) return null
  if (phase === 'done') return null
  if ([WORKFLOW_STATUS.APPROVED, WORKFLOW_STATUS.IN_PRODUCTION, WORKFLOW_STATUS.SHIPPED].includes(order.workflow_status)) {
    return null
  }

  const base = {
    orderId: order.id,
    email: order.email ?? null,
    faceCount: order.face_count,
    workflowStatus: order.workflow_status,
    generationId: order.generation_id ?? meta.draft_generation_id ?? null,
    mode: job?.mode ?? 'initial',
    phase,
    step1RequestId: job?.step1RequestId ?? null,
    step2RequestId: job?.step2RequestId ?? null,
    error: job?.error ?? null,
    updatedAt: job?.updatedAt ?? order.updated_at,
  }

  if (phase === 'error') {
    return { ...base, needsQueue: false, needsTick: false, canRetry: true }
  }

  if (!STUDIO_WORKFLOWS.has(order.workflow_status) && !ACTIVE_PHASES.has(phase)) {
    return null
  }

  const needsQueue = !job || phase === null
  const needsTick = ACTIVE_PHASES.has(phase)

  if (!needsQueue && !needsTick) return null

  return { ...base, needsQueue, needsTick, canRetry: false }
}

export async function listStudioWorkerJobs() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('id, email, status, workflow_status, generation_id, face_count, metadata, updated_at')
    .eq('status', 'paid')
    .in('workflow_status', [
      WORKFLOW_STATUS.AWAITING_PHOTO,
      WORKFLOW_STATUS.IN_STUDIO,
      WORKFLOW_STATUS.REVISION_REQUESTED,
      WORKFLOW_STATUS.PENDING_VALIDATION,
    ])
    .order('updated_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(error.message)

  const jobs = []
  for (const order of data ?? []) {
    const summary = summarizeOrderForWorker(order)
    if (summary) jobs.push(summary)
  }
  return jobs
}

export function pickNextWorkerJob(jobs) {
  const actionable = (jobs ?? []).filter(j => j.needsTick || j.needsQueue)
  if (!actionable.length) return null
  actionable.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
  const ticking = actionable.find(j => j.needsTick)
  return ticking ?? actionable[0]
}
