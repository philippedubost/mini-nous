import { adminHeaders } from './adminAuth.js'

async function apiJson(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...adminHeaders(), ...options.headers },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

export async function createGeneration({ faceCount, resolution, aspectRatio, settings, falModel, orderId }) {
  const { generation } = await apiJson('/api/generations', {
    method: 'POST',
    body: JSON.stringify({ faceCount, resolution, aspectRatio, settings, falModel, orderId }),
  })
  return generation
}

function authHeaders(bearerToken) {
  return bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}
}

export async function fetchOrderByToken(token, bearerToken) {
  return apiJson(`/api/orders?token=${encodeURIComponent(token)}`, {
    headers: authHeaders(bearerToken),
  })
}

export async function linkOrderGeneration(token, generationId, bearerToken) {
  return apiJson('/api/orders', {
    method: 'PATCH',
    headers: authHeaders(bearerToken),
    body: JSON.stringify({ token, generationId, action: 'link_generation' }),
  })
}

export async function startServerStudio(token, bearerToken, { mode = 'initial' } = {}) {
  return apiJson('/api/studio-generate', {
    method: 'POST',
    headers: authHeaders(bearerToken),
    body: JSON.stringify({ token, start: true, mode }),
  })
}

export async function orderAction(token, action, bearerToken, payload = {}) {
  return apiJson('/api/orders', {
    method: 'PATCH',
    headers: authHeaders(bearerToken),
    body: JSON.stringify({ token, action, ...payload }),
  })
}

export async function updateOrderFaceCount(token, faceCount, bearerToken) {
  return apiJson('/api/orders', {
    method: 'PATCH',
    headers: authHeaders(bearerToken),
    body: JSON.stringify({ token, action: 'update_face_count', faceCount }),
  })
}

export async function fetchPipelineSettings() {
  return apiJson('/api/pipeline-settings')
}

export async function savePipelineSettings(settings) {
  return apiJson('/api/pipeline-settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  })
}

export async function resetPipelineSettings() {
  return apiJson('/api/pipeline-settings', {
    method: 'PUT',
    body: JSON.stringify({ reset: true }),
  })
}

export async function uploadReferenceLineArt(base64) {
  return apiJson('/api/pipeline-settings', {
    method: 'POST',
    body: JSON.stringify({ base64 }),
  })
}

export async function confirmCheckout(sessionId, orderToken) {
  return apiJson(
    `/api/checkout-confirm?session_id=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(orderToken)}`,
  )
}

export async function resumeCheckout(accessToken, { pack, faceCount, childCount } = {}) {
  return apiJson('/api/checkout', {
    method: 'POST',
    body: JSON.stringify({ accessToken, pack, faceCount, childCount }),
  })
}

export async function replacePaywallPhoto(accessToken, photoBase64) {
  return updatePaywallOrder(accessToken, { photoBase64 })
}

export async function updateOrderComposition(token, { faceCount, childCount }, bearerToken) {
  return orderAction(token, 'update_composition', bearerToken, { faceCount, childCount })
}

export async function updateOrderShipping(token, shippingAddress, bearerToken) {
  return orderAction(token, 'update_shipping', bearerToken, { shippingAddress })
}

export async function updatePaywallOrder(accessToken, { faceCount, childCount, photoBase64 } = {}) {
  return apiJson('/api/order-start', {
    method: 'PATCH',
    body: JSON.stringify({ accessToken, faceCount, childCount, photoBase64 }),
  })
}

export async function fetchMyOrders(bearerToken) {
  return apiJson('/api/me', { headers: authHeaders(bearerToken) })
}

export async function claimMyOrders(bearerToken) {
  return apiJson('/api/me', {
    method: 'POST',
    headers: authHeaders(bearerToken),
    body: JSON.stringify({ action: 'claim' }),
  })
}

export async function createAdminOrder(bearerToken, { faceCount, fromOrderId } = {}) {
  return apiJson('/api/me', {
    method: 'POST',
    headers: authHeaders(bearerToken),
    body: JSON.stringify({
      action: 'create_order',
      faceCount,
      fromOrderId,
    }),
  })
}

export async function fetchRevisions(token, bearerToken) {
  return apiJson(`/api/revisions?token=${encodeURIComponent(token)}`, {
    headers: authHeaders(bearerToken),
  })
}

export async function submitRevision(token, characters, bearerToken) {
  return apiJson('/api/revisions', {
    method: 'POST',
    headers: authHeaders(bearerToken),
    body: JSON.stringify({ token, characters }),
  })
}

export async function selectLineartVersion(token, versionId, bearerToken) {
  return orderAction(token, 'select_lineart', bearerToken, { versionId })
}

export async function submitEngagement(token, action, payload = {}) {
  return apiJson('/api/engagement', {
    method: 'POST',
    body: JSON.stringify({ token, action, ...payload }),
  })
}

export async function publishTeamLineart(generationId) {
  return apiJson('/api/generations', {
    method: 'PATCH',
    body: JSON.stringify({ id: generationId, action: 'publish_team_lineart' }),
  })
}

export async function updateGeneration(id, { status, errorMessage, settings } = {}) {
  const { generation } = await apiJson('/api/generations', {
    method: 'PATCH',
    body: JSON.stringify({ id, status, errorMessage, settings }),
  })
  return generation
}

export async function updateStepStatus(id, step) {
  const { step: saved } = await apiJson('/api/generations', {
    method: 'PATCH',
    body: JSON.stringify({ id, step }),
  })
  return saved
}

export async function deleteVersion(generationId, versionId) {
  return apiJson('/api/generations', {
    method: 'PATCH',
    body: JSON.stringify({ id: generationId, deleteVersionId: versionId }),
  })
}

export async function selectVersion(generationId, versionId) {
  return apiJson('/api/generations', {
    method: 'PATCH',
    body: JSON.stringify({ id: generationId, selectVersionId: versionId }),
  })
}

export async function uploadAsset(generationId, assetType, payload = {}) {
  const { url: imageUrl, version } = await apiJson('/api/upload-r2', {
    method: 'POST',
    body: JSON.stringify({ generationId, assetType, ...payload }),
  })
  return { imageUrl, version }
}

export async function fetchGenerations() {
  const { generations } = await apiJson('/api/generations')
  return generations
}

export async function fetchAdminBoard() {
  return apiJson('/api/admin-board')
}

export async function updateAdminWorkflow(orderId, workflowStatus) {
  return apiJson('/api/admin-board', {
    method: 'PATCH',
    body: JSON.stringify({ orderId, workflowStatus }),
  })
}

export async function fetchProductionWeeks() {
  return apiJson('/api/production-weeks')
}

export async function fetchProductionWeek(weekKey) {
  return apiJson(`/api/production-weeks?week=${encodeURIComponent(weekKey)}`)
}

export async function buildProductionWeekBatch(weekKey, { dryRun = false, kerf } = {}) {
  return apiJson('/api/production-weeks', {
    method: 'POST',
    body: JSON.stringify({ action: 'build-batch', weekKey, dryRun, kerf }),
  })
}

export async function buildSelectionBatch(generationIds, { weekKey, dryRun = false, kerf } = {}) {
  return apiJson('/api/production-weeks', {
    method: 'POST',
    body: JSON.stringify({
      action: 'build-batch-selection',
      generationIds,
      weekKey: weekKey || undefined,
      dryRun,
      kerf,
    }),
  })
}

export async function assignGenerationToWeek(weekKey, generationId, { customerName } = {}) {
  return apiJson('/api/production-weeks', {
    method: 'POST',
    body: JSON.stringify({ action: 'assign-generation', weekKey, generationId, customerName }),
  })
}

export async function removeGenerationFromWeek(orderId) {
  return apiJson('/api/production-weeks', {
    method: 'POST',
    body: JSON.stringify({ action: 'remove-order', orderId }),
  })
}

export async function fetchGeneration(id) {
  return apiJson(`/api/generations?id=${encodeURIComponent(id)}`)
}

export async function persistAsset(generationId, assetType, payload) {
  if (!generationId) return null
  try {
    const { imageUrl, version } = await uploadAsset(generationId, assetType, { source: 'pipeline', ...payload })
    return { imageUrl, version }
  } catch (err) {
    console.warn(`[storage] ${assetType}:`, err.message)
    return null
  }
}

export async function markStepRunning(generationId, assetType, log) {
  if (!generationId) return
  try {
    await updateStepStatus(generationId, {
      asset_type: assetType,
      status: 'running',
      log: log ?? null,
    })
  } catch (err) {
    console.warn(`[storage] step ${assetType}:`, err.message)
  }
}

/** Build url map from active (selected) steps for fal input resolution */
export function urlMapFromSteps(steps) {
  const byType = Object.fromEntries((steps ?? []).map(s => [s.asset_type, s.image_url]))
  return {
    user: byType.source,
    ref: byType.ref,
    step1: byType.step1,
    step2: byType.step2,
  }
}
