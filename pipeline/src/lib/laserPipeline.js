import {
  OUTLINE_TRACE_OPTS,
  traceCenterline,
  loadImageDataFromUrl,
} from './centerlineTrace'
import { processLineArt } from './outline'
import { extractBodyRegionsDetailed } from './bodyRegions'
import { detectFacesGuided, mapFacesToTarget, paintEyeMasksOnImageData } from './faceLandmarks'
import { buildMergedLaserSvgAsync } from './laserSvg'
import { gravureOptsForExport, gravureTraceOpts, loadTraceSettings, outlineOptsForExtraction } from './traceSettings'

export function canvasToImageData(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
}

export function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return canvas
}

export function svgToDataUrl(svg) {
  const encoded = btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${encoded}`
}

async function loadLayersFromUrls({ outlineUrl, outlineBulkyUrl, gravureUrl }) {
  const [outlineData, bulkyData, gravureData] = await Promise.all([
    loadImageDataFromUrl(outlineUrl),
    loadImageDataFromUrl(outlineBulkyUrl),
    loadImageDataFromUrl(gravureUrl),
  ])
  return {
    outline: imageDataToCanvas(outlineData),
    outlineBulky: imageDataToCanvas(bulkyData),
    gravure: imageDataToCanvas(gravureData),
  }
}

/** Regénère le SVG laser à partir des PNG déjà stockés (nouvelle version sans ré-extraire). */
export async function buildLaserSvgFromStoredLayers({
  outlineUrl,
  outlineBulkyUrl,
  gravureUrl,
  photoUrl,
  faceCount,
  traceSettings,
  onProgress,
}) {
  if (!outlineUrl || !outlineBulkyUrl || !gravureUrl) {
    throw new Error('PNG outline / masque / gravure manquants — lancez d\'abord l\'extraction.')
  }
  onProgress?.('Chargement des calques PNG…')
  const layers = await loadLayersFromUrls({ outlineUrl, outlineBulkyUrl, gravureUrl })
  return buildGenerationLaserSvg({
    layers,
    photoUrl,
    faceCount,
    traceSettings,
    onProgress,
  })
}

export function resolveTraceSettings(generationSettings) {
  return generationSettings?.traceSettings ?? loadTraceSettings()
}

export async function buildGenerationLaserSvg({
  layers,
  photoUrl,
  faceCount,
  traceSettings,
  onProgress,
}) {
  const settings = traceSettings ?? loadTraceSettings()
  const { gravure: gravureOpts, decoupe: decoupeOpts } = settings

  const outlineData = canvasToImageData(layers.outline)
  const gravureData = canvasToImageData(layers.gravure)
  const silhouetteData = canvasToImageData(layers.outlineBulky)

  onProgress?.('Masque corps / socle…')
  const maskData = extractBodyRegionsDetailed(
    silhouetteData || gravureData || outlineData,
    faceCount ?? null,
  )

  let mappedEyes = null
  if (photoUrl) {
    onProgress?.('Détection visages…')
    try {
      const photoData = await loadImageDataFromUrl(photoUrl)
      const silhouette = silhouetteData || gravureData || outlineData
      const faceData = await detectFacesGuided(photoData, silhouette, faceCount ?? null)
      if (faceData?.faces?.length) {
        mappedEyes = mapFacesToTarget(faceData.faces, gravureData.width, gravureData.height)
      }
    } catch (err) {
      console.warn('[laserPipeline] détection visages:', err.message)
    }
  }

  onProgress?.('Trace outline…')
  const outlineTrace = traceCenterline(outlineData, OUTLINE_TRACE_OPTS)

  onProgress?.('Trace gravure…')
  let gravureInput = gravureData
  if (mappedEyes?.length) {
    gravureInput = paintEyeMasksOnImageData(gravureData, mappedEyes)
  }
  const gravureTrace = traceCenterline(gravureInput, gravureTraceOpts(gravureOpts))

  onProgress?.('Fusion SVG laser…')
  const merged = await buildMergedLaserSvgAsync({
    decoupeSvg: outlineTrace.svg,
    gravureSvg: gravureTrace.svg,
    maskData,
    mappedEyes,
    opts: gravureOptsForExport(gravureOpts),
    decoupeOpts,
    onProgress: msg => onProgress?.(typeof msg === 'string' ? msg : msg?.message),
  })

  if (!merged) throw new Error('Échec fusion SVG laser')
  return merged
}

/** Extraction PNG (outline/gravure) + SVG laser fusionné — même flux que le labo. */
export async function extractAndBuildLaserSvg({
  step2Url,
  photoUrl,
  faceCount,
  traceSettings,
  onProgress,
}) {
  const settings = traceSettings ?? loadTraceSettings()
  const outlineOpts = outlineOptsForExtraction(settings)
  onProgress?.('Extraction silhouette…')
  const layers = await processLineArt(step2Url, outlineOpts)
  const merged = await buildGenerationLaserSvg({
    layers,
    photoUrl,
    faceCount,
    traceSettings,
    onProgress,
  })
  return { layers, merged }
}
