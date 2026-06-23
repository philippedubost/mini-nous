import { fal } from '@fal-ai/client'

fal.config({ proxyUrl: '/api/fal' })

export const FAL_MODEL = 'fal-ai/nano-banana-pro/edit'

export async function runFalStep(stepConfig, imageUrls, onLog) {
  const timeoutMs = 8 * 60 * 1000
  const subscribe = fal.subscribe(FAL_MODEL, {
    input: {
      prompt: stepConfig.prompt,
      image_urls: imageUrls,
      aspect_ratio: stepConfig.aspectRatio,
      resolution: stepConfig.resolution,
    },
    pollInterval: 2500,
    onQueueUpdate(update) {
      if (update.status === 'IN_QUEUE') {
        onLog?.(`File d'attente — position ${update.queue_position ?? '?'}`)
      } else if (update.status === 'IN_PROGRESS') {
        const msg = update.logs?.at(-1)?.message
        if (msg) onLog?.(msg)
      }
    },
  })
  const result = await Promise.race([
    subscribe,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Délai dépassé (8 min) — le traitement a été interrompu. Réessayez.')),
        timeoutMs,
      )
    }),
  ])
  const url = result?.data?.images?.[0]?.url ?? result?.data?.image?.url ?? result?.images?.[0]?.url
  if (!url) throw new Error('Aucune image retournée')
  return url
}

export async function uploadToFal(file) {
  return fal.storage.upload(file)
}
