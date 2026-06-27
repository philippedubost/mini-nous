import { extractAndBuildLaserSvg, svgToDataUrl } from './laserPipeline'
import { loadTraceSettings } from './traceSettings'
import { fetchGeneration, updateGeneration, uploadAsset } from './storage'

function stepUrl(steps, type) {
  const row = steps?.find(s => s.asset_type === type)
  return row?.image_url || row?.fal_url || null
}

/** Même flux que AdminGenerationPage.runExtraction — navigateur, pas Vercel. */
export async function runClientLaserPass(generationId, { faceCount, onProgress } = {}) {
  if (!generationId) throw new Error('generation_id manquant')

  const data = await fetchGeneration(generationId)
  const step2Url = stepUrl(data.steps, 'step2')
  const photoUrl = stepUrl(data.steps, 'step1') || stepUrl(data.steps, 'source')
  if (!step2Url) {
    throw new Error('Tracé step2 introuvable — sélectionnez ou générez une version step2.')
  }

  const faces = faceCount ?? data.generation?.face_count ?? null
  onProgress?.('Chargement line art…')

  const { layers, merged } = await extractAndBuildLaserSvg({
    step2Url,
    photoUrl,
    faceCount: faces,
    traceSettings: loadTraceSettings(),
    onProgress,
  })

  onProgress?.('Upload calques PNG + SVG…')
  const traceSettingsSnapshot = loadTraceSettings()
  const laserMergedUrl = svgToDataUrl(merged)

  await Promise.all([
    uploadAsset(generationId, 'outline', {
      base64: layers.outline.toDataURL('image/png'),
      status: 'done',
      source: 'studio_worker',
    }),
    uploadAsset(generationId, 'outline_bulk', {
      base64: layers.outlineBulky.toDataURL('image/png'),
      status: 'done',
      source: 'studio_worker',
    }),
    uploadAsset(generationId, 'gravure', {
      base64: layers.gravure.toDataURL('image/png'),
      status: 'done',
      source: 'studio_worker',
    }),
    uploadAsset(generationId, 'overlay', {
      base64: layers.overlay.toDataURL('image/png'),
      status: 'done',
      source: 'studio_worker',
    }),
    uploadAsset(generationId, 'laser_merged', {
      base64: laserMergedUrl,
      status: 'done',
      source: 'studio_worker',
      metadata: { traceSettings: traceSettingsSnapshot },
    }),
  ])

  await updateGeneration(generationId, { status: 'done' })

  return { done: true, phase: 'done', ok: true }
}

export function runClientLaserPassForOrder(order, options = {}) {
  const generationId = order?.generationId ?? order?.generation_id
  const faceCount = order?.faceCount ?? order?.face_count
  return runClientLaserPass(generationId, { faceCount, ...options })
}
