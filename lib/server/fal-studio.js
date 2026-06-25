import { fal } from '@fal-ai/client'
import { extractPreviewUrl } from './fal-landing.js'

export const STUDIO_FAL_MODEL = 'fal-ai/nano-banana-pro/edit'

export function configureFal() {
  const falKey = process.env.FAL_KEY
  if (!falKey) throw new Error('FAL_KEY non configurée')
  fal.config({ credentials: falKey })
}

export function buildPrompt1(faceCount, basePrompt) {
  const who = faceCount > 0 ? `ces ${faceCount} personnes` : 'ces personnes'
  return basePrompt.replace('ces personnes', who)
}

export function falStepFormat(step, globalSettings = {}) {
  return {
    resolution: step?.resolution === '1K' ? '2K' : (step?.resolution ?? globalSettings.resolution ?? '2K'),
    aspectRatio: step?.aspectRatio ?? globalSettings.aspectRatio ?? '16:9',
  }
}

export function resolveImageUrls(imageInputs, urlMap) {
  return (imageInputs ?? []).map(id => urlMap[id]).filter(Boolean)
}

export async function uploadBufferToFal(buf, mime, filename) {
  const file = typeof File !== 'undefined'
    ? new File([buf], filename, { type: mime })
    : new Blob([buf], { type: mime })
  return fal.storage.upload(file)
}

export async function uploadRemoteImageToFal(url, filename = 'photo.jpg') {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Impossible de charger l'image (${url})`)
  const mime = res.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return uploadBufferToFal(buf, mime, filename)
}

export async function submitStudioFalStep(model, stepConfig, imageUrls) {
  configureFal()
  const fmt = falStepFormat(stepConfig)
  const { request_id: requestId } = await fal.queue.submit(model, {
    input: {
      prompt: stepConfig.prompt,
      image_urls: imageUrls,
      aspect_ratio: fmt.aspectRatio,
      resolution: fmt.resolution,
    },
  })
  if (!requestId) throw new Error('fal.ai n\'a pas renvoyé de requestId')
  return requestId
}

export async function pollStudioFalJob(model, requestId) {
  configureFal()
  const status = await fal.queue.status(model, { requestId, logs: false })
  const state = status?.status

  if (state === 'COMPLETED') {
    const result = await fal.queue.result(model, { requestId })
    const url = extractPreviewUrl(result)
    if (!url) throw new Error('Aucune image retournée par fal.ai')
    return { status: 'COMPLETED', url, requestId }
  }

  if (state === 'FAILED') {
    return {
      status: 'FAILED',
      error: status?.error || 'Génération fal.ai échouée',
      requestId,
    }
  }

  return {
    status: state || 'IN_QUEUE',
    queuePosition: status?.queue_position ?? null,
    requestId,
  }
}

export async function pollStudioFalJobWithWait(model, requestId, maxWaitMs = 8000) {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const result = await pollStudioFalJob(model, requestId)
    if (result.status === 'COMPLETED' || result.status === 'FAILED') return result
    await new Promise(r => setTimeout(r, 2000))
  }
  return pollStudioFalJob(model, requestId)
}
