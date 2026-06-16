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

export async function uploadAsset(generationId, assetType, { url, base64, falUrl, prompt, status, log, error } = {}) {
  const { url: imageUrl } = await apiJson('/api/upload-r2', {
    method: 'POST',
    body: JSON.stringify({ generationId, assetType, url, base64, falUrl, prompt, status, log, error }),
  })
  return imageUrl
}

export async function fetchGenerations() {
  const { generations } = await apiJson('/api/generations')
  return generations
}

export async function fetchGeneration(id) {
  const { generation, steps } = await apiJson(`/api/generations?id=${encodeURIComponent(id)}`)
  return { generation, steps }
}

/** Persist asset without blocking the pipeline on failure */
export async function persistAsset(generationId, assetType, payload) {
  try {
    return await uploadAsset(generationId, assetType, payload)
  } catch (err) {
    console.warn(`[storage] ${assetType}:`, err.message)
    return null
  }
}

export async function markStepRunning(generationId, assetType, log) {
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
