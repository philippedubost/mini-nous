const SECRET_KEY = 'mn_worker_secret'
const WORKER_ID_KEY = 'mn_worker_id'
const WORKER_LABEL_KEY = 'mn_worker_label'

export function loadWorkerSecret() {
  try {
    return localStorage.getItem(SECRET_KEY) || ''
  } catch {
    return ''
  }
}

export function saveWorkerSecret(value) {
  try {
    if (value) localStorage.setItem(SECRET_KEY, value)
    else localStorage.removeItem(SECRET_KEY)
  } catch { /* ignore */ }
}

export function getOrCreateWorkerId() {
  try {
    let id = localStorage.getItem(WORKER_ID_KEY)
    if (!id) {
      id = `w-${crypto.randomUUID().slice(0, 8)}`
      localStorage.setItem(WORKER_ID_KEY, id)
    }
    return id
  } catch {
    return `w-${Date.now()}`
  }
}

export function getWorkerProfile() {
  const id = getOrCreateWorkerId()
  let label = ''
  try {
    label = localStorage.getItem(WORKER_LABEL_KEY) || ''
  } catch { /* ignore */ }
  if (!label && typeof navigator !== 'undefined') {
    label = typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'worker'
  }
  return { id, label }
}

export function isMotorLockStale(lock) {
  if (!lock?.expiresAt) return true
  return new Date(lock.expiresAt).getTime() <= Date.now()
}

export function isMotorLockHeldByOther(lock, workerId) {
  if (!lock?.workerId || isMotorLockStale(lock)) return false
  return lock.workerId !== workerId
}

function workerHeaders(secret) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`,
  }
}

async function parseJson(res) {
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch { /* réponse non-JSON (crash Vercel, HTML…) */ }
  if (!res.ok) {
    const detail = data.error || (text && !text.startsWith('<') ? text.slice(0, 300) : null)
    throw new Error(detail || `Erreur HTTP ${res.status}`)
  }
  return data
}

export async function fetchWorkerBoard(secret, { weekKey = null } = {}) {
  const qs = weekKey ? `?weekKey=${encodeURIComponent(weekKey)}` : ''
  const res = await fetch(`/api/studio-worker${qs}`, { headers: workerHeaders(secret) })
  return parseJson(res)
}

export async function fetchWorkerOrder(secret, orderId) {
  const res = await fetch(
    `/api/studio-worker?orderId=${encodeURIComponent(orderId)}`,
    { headers: workerHeaders(secret) },
  )
  return parseJson(res)
}

export async function queueStudioJob(secret, orderId, { mode = 'initial', feedback = null } = {}) {
  const res = await fetch('/api/studio-generate', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({ orderId, queue: true, mode, feedback }),
  })
  return parseJson(res)
}

/** Un passage moteur = une étape FAL traitée par le pico PC. */
export async function runMotorPass(secret, orderId) {
  const res = await fetch('/api/studio-generate', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({ orderId }),
  })
  return parseJson(res)
}

export async function queueLaserJob(secret, orderId, { force = false } = {}) {
  const res = await fetch('/api/studio-laser', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({ orderId, queue: true, force }),
  })
  return parseJson(res)
}

export async function runLaserPass(secret, orderId) {
  const res = await fetch('/api/studio-laser', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({ orderId }),
  })
  return parseJson(res)
}

/** Carte éligible au moteur auto (hors erreurs, skips session et verrous autres workers). */
export function isMotorActionable(job, skipIds = null, workerId = null) {
  if (!job?.needsTick && !job?.needsQueue) return false
  if (skipIds?.has(job.orderId)) return false
  if (workerId && isMotorLockHeldByOther(job.motorLock, workerId)) return false
  if (job.studioJob?.phase === 'error') return false
  if (job.studioLaser?.phase === 'error') return false
  return true
}

export function pickNextJob(jobs, { skipIds = null, workerId = null } = {}) {
  const actionable = (jobs ?? []).filter(j => isMotorActionable(j, skipIds, workerId))
  if (!actionable.length) return null
  actionable.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
  return actionable.find(j => j.needsTick) ?? actionable[0]
}

export async function claimNextMotorJob(secret, { weekKey = null, skipOrderIds = [] } = {}) {
  const res = await fetch('/api/studio-worker', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({
      action: 'claim_next',
      weekKey,
      skipOrderIds,
      worker: getWorkerProfile(),
    }),
  })
  return parseJson(res)
}

export async function claimMotorJob(secret, orderId) {
  const res = await fetch('/api/studio-worker', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({
      action: 'claim_job',
      orderId,
      worker: getWorkerProfile(),
    }),
  })
  return parseJson(res)
}

export async function releaseMotorJob(secret, orderId) {
  const res = await fetch('/api/studio-worker', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({
      action: 'release_job',
      orderId,
      workerId: getOrCreateWorkerId(),
    }),
  })
  return parseJson(res)
}

export async function renewMotorJob(secret, orderId) {
  const res = await fetch('/api/studio-worker', {
    method: 'POST',
    headers: workerHeaders(secret),
    body: JSON.stringify({
      action: 'renew_job',
      orderId,
      worker: getWorkerProfile(),
    }),
  })
  return parseJson(res)
}

export async function runWorkerBulkAction(secret, action, orderIds) {
  const res = await fetch('/api/studio-worker', {
    method: 'PATCH',
    headers: workerHeaders(secret),
    body: JSON.stringify({ action, orderIds }),
  })
  return parseJson(res)
}
