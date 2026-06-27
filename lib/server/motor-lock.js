import { getSupabase } from './supabase.js'
import { buildStudioBoard, isWorkerJobActionable } from './studio-board.js'

export const MOTOR_LOCK_TTL_MS = 10 * 60 * 1000

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export function isMotorLockStale(lock) {
  if (!lock?.expiresAt) return true
  return new Date(lock.expiresAt).getTime() <= Date.now()
}

export function isMotorLockHeldByOther(lock, workerId) {
  if (!lock?.workerId || isMotorLockStale(lock)) return false
  return lock.workerId !== workerId
}

export function resolveWorkerFromRequest(req, bodyWorker = null) {
  const forwarded = req.headers?.['x-forwarded-for']
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded?.[0])?.trim()
    || req.headers?.['x-real-ip']
    || req.socket?.remoteAddress
    || 'local'
  const id = bodyWorker?.id || `ip:${ip}`
  const label = bodyWorker?.label || bodyWorker?.host || ip
  return { id, label, ip }
}

async function loadOrderRow(supabase, orderId) {
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, updated_at')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function claimMotorLock(supabase, orderId, worker, { maxAttempts = 5 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const order = await loadOrderRow(supabase, orderId)
    if (!order) return { claimed: false, reason: 'not_found' }

    const meta = order.metadata ?? {}
    const existing = meta.motor_lock
    if (isMotorLockHeldByOther(existing, worker.id)) {
      return { claimed: false, reason: 'held', holder: existing }
    }

    const motor_lock = {
      workerId: worker.id,
      label: worker.label || worker.id,
      ip: worker.ip ?? null,
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + MOTOR_LOCK_TTL_MS).toISOString(),
    }

    const { data: updated, error } = await supabase
      .from('mini_nous_orders')
      .update({
        metadata: { ...meta, motor_lock },
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('updated_at', order.updated_at)
      .select('metadata')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (updated) return { claimed: true, lock: motor_lock }

    await sleep(40 + Math.random() * 80)
  }
  return { claimed: false, reason: 'contention' }
}

export async function renewMotorLock(supabase, orderId, worker) {
  const order = await loadOrderRow(supabase, orderId)
  if (!order) return { renewed: false, reason: 'not_found' }

  const meta = order.metadata ?? {}
  const existing = meta.motor_lock
  if (!existing || existing.workerId !== worker.id) {
    return { renewed: false, reason: 'not_holder' }
  }

  const motor_lock = {
    ...existing,
    expiresAt: new Date(Date.now() + MOTOR_LOCK_TTL_MS).toISOString(),
  }

  const { error } = await supabase
    .from('mini_nous_orders')
    .update({
      metadata: { ...meta, motor_lock },
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('updated_at', order.updated_at)

  if (error) throw new Error(error.message)
  return { renewed: true, lock: motor_lock }
}

export async function releaseMotorLock(supabase, orderId, workerId) {
  const order = await loadOrderRow(supabase, orderId)
  if (!order) return { released: false, reason: 'not_found' }

  const meta = order.metadata ?? {}
  const existing = meta.motor_lock
  if (!existing || (existing.workerId !== workerId && !isMotorLockStale(existing))) {
    return { released: false, reason: 'not_holder' }
  }

  const nextMeta = { ...meta }
  delete nextMeta.motor_lock

  const { error } = await supabase
    .from('mini_nous_orders')
    .update({
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('updated_at', order.updated_at)

  if (error) throw new Error(error.message)
  return { released: true }
}

function sortMotorCandidates(jobs) {
  const actionable = (jobs ?? []).filter(isWorkerJobActionable)
  actionable.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
  return actionable
}

export async function claimNextMotorJob(req, { weekKey = null, worker, skipOrderIds = [] } = {}) {
  const board = await buildStudioBoard(req, { weekKey })
  const skip = new Set(skipOrderIds)
  const candidates = sortMotorCandidates(board.motorJobs).filter(
    j => !skip.has(j.orderId) && !isMotorLockHeldByOther(j.motorLock, worker.id),
  )

  const supabase = getSupabase()
  for (const job of candidates) {
    const claim = await claimMotorLock(supabase, job.orderId, worker)
    if (claim.claimed) return { job, lock: claim.lock }
    if (claim.reason === 'held') continue
  }
  return { job: null, lock: null }
}
