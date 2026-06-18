import { uploadAsset } from './storage'
import { buildLaserSvgFromStoredLayers, svgToDataUrl } from './laserPipeline'
import { loadTraceSettings } from './traceSettings'

export function stepUrl(steps, assetType) {
  return steps?.find(s => s.asset_type === assetType)?.image_url ?? null
}

export function canRegenerateLaserSvg(steps) {
  return !!(
    stepUrl(steps, 'outline')
    && stepUrl(steps, 'outline_bulk')
    && stepUrl(steps, 'gravure')
  )
}

export function traceSettingsFromGeneration(data) {
  const laserStep = data?.steps?.find(s => s.asset_type === 'laser_merged')
  const fromMeta = laserStep?.metadata?.traceSettings
    ?? data?.generation?.settings?.traceSettings
  if (fromMeta?.gravure) return fromMeta
  return loadTraceSettings()
}

/** Regénère et upload une nouvelle version laser_merged pour une génération. */
export async function regenerateLaserSvg({
  generationId,
  steps,
  faceCount,
  traceSettings,
  onProgress,
  source = 'admin_laser_regen',
}) {
  if (!canRegenerateLaserSvg(steps)) {
    throw new Error('PNG outline / masque / gravure manquants — lancez d\'abord l\'extraction.')
  }

  const settings = traceSettings ?? loadTraceSettings()
  const merged = await buildLaserSvgFromStoredLayers({
    outlineUrl: stepUrl(steps, 'outline'),
    outlineBulkyUrl: stepUrl(steps, 'outline_bulk'),
    gravureUrl: stepUrl(steps, 'gravure'),
    photoUrl: stepUrl(steps, 'step1'),
    faceCount,
    traceSettings: settings,
    onProgress,
  })

  await uploadAsset(generationId, 'laser_merged', {
    base64: svgToDataUrl(merged),
    status: 'done',
    source,
    metadata: { traceSettings: settings },
  })

  return merged
}
