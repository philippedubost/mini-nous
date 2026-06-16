async function apiJson(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

export async function createGeneration({ faceCount, resolution, aspectRatio, settings, falModel }) {
  const { generation } = await apiJson('/api/generations', {
    method: 'POST',
    body: JSON.stringify({ faceCount, resolution, aspectRatio, settings, falModel }),
  })
  return generation
}

export async function updateGeneration(id, { status, errorMessage } = {}) {
  const { generation } = await apiJson('/api/generations', {
    method: 'PATCH',
    body: JSON.stringify({ id, status, errorMessage }),
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
