const SECRET_KEY = 'mn_worker_secret'

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

function workerHeaders(secret) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`,
  }
}

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
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

/** Carte éligible au moteur auto (hors erreurs et skips session). */
export function isMotorActionable(job, skipIds = null) {
  if (!job?.needsTick && !job?.needsQueue) return false
  if (skipIds?.has(job.orderId)) return false
  if (job.studioJob?.phase === 'error') return false
  if (job.studioLaser?.phase === 'error') return false
  return true
}

export function pickNextJob(jobs, { skipIds = null } = {}) {
  const actionable = (jobs ?? []).filter(j => isMotorActionable(j, skipIds))
  if (!actionable.length) return null
  actionable.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
  return actionable.find(j => j.needsTick) ?? actionable[0]
}

export async function runWorkerBulkAction(secret, action, orderIds) {
  const res = await fetch('/api/studio-worker', {
    method: 'PATCH',
    headers: workerHeaders(secret),
    body: JSON.stringify({ action, orderIds }),
  })
  return parseJson(res)
}
