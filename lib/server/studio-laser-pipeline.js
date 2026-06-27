import { processLineArtFromUrl } from './trace/outline.js'
import { extractBodyRegionsDetailed } from './trace/body-regions.js'
import { traceOutlineLayer, traceGravureLayer } from './trace/trace-bitmap.js'
import { buildMergedLaserSvg } from './trace/laser-merge.js'
import {
  DEFAULT_TRACE_SETTINGS,
  outlineOptsForExtraction,
  gravureTraceOpts,
} from './trace/settings.js'
import { resolveValidatedLineartUrl } from './lineart-resolve.js'

/**
 * Extraction PNG + SVG laser fusionné — même flux que le labo, côté serveur.
 */
export async function runServerLaserPipeline(supabase, {
  generationId,
  order,
  faceCount,
  onProgress,
} = {}) {
  const pub = url => url
  const step2Url = await resolveValidatedLineartUrl(supabase, order, pub)
  if (!step2Url) throw new Error('Tracé step2 validé introuvable')

  const { data: steps } = await supabase
    .from('mini_nous_generation_steps')
    .select('asset_type, image_url, fal_url')
    .eq('generation_id', generationId)
  const stepMap = Object.fromEntries(
    (steps ?? []).map(s => [s.asset_type, s.image_url || s.fal_url]),
  )
  const photoUrl = stepMap.step1 || stepMap.source || order.metadata?.paywall_source_url || null

  const traceSettings = DEFAULT_TRACE_SETTINGS
  const outlineOpts = outlineOptsForExtraction(traceSettings)
  const gravureOpts = traceSettings.gravure
  const decoupeOpts = traceSettings.decoupe

  onProgress?.('Extraction silhouette…')
  const layers = await processLineArtFromUrl(step2Url, outlineOpts)

  onProgress?.('Masque corps / socle…')
  const silhouette = layers.outlineBulky || layers.gravure || layers.outline
  const maskData = extractBodyRegionsDetailed(silhouette, faceCount ?? null)

  onProgress?.('Trace outline…')
  const outlineTrace = await traceOutlineLayer(layers.outline)

  onProgress?.('Trace gravure…')
  const gravureTrace = await traceGravureLayer(layers.gravure, gravureOpts)

  onProgress?.('Fusion SVG laser…')
  const merged = buildMergedLaserSvg({
    decoupeSvg: outlineTrace.svg,
    gravureSvg: gravureTrace.svg,
    maskData,
    mappedEyes: null,
    opts: gravureTraceOpts(gravureOpts),
    decoupeOpts,
  })
  if (!merged) throw new Error('Échec fusion SVG laser')

  return {
    layers,
    merged,
    traceSettings,
    photoUrl,
  }
}
