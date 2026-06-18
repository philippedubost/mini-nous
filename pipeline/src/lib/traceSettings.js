import { DEFAULT_TRACE_OPTS, DECOUPE_OPTIMIZE_OPTS } from './centerlineTrace'
import { DEFAULT_OUTLINE_OPTS } from './outline'

export const TRACE_SETTINGS_KEY = 'mn_trace_settings_v2'
export const DEFAULT_MASK_CONTOUR_SW = 8

export const DEFAULT_TRACE_SETTINGS = {
  engine: 'browser',
  gravure: { ...DEFAULT_TRACE_OPTS, maskContourSw: DEFAULT_MASK_CONTOUR_SW },
  decoupe: { ...DECOUPE_OPTIMIZE_OPTS },
  outline: { ...DEFAULT_OUTLINE_OPTS, sw: DEFAULT_MASK_CONTOUR_SW },
}

function syncMaskContourSw(gravure, outline) {
  const sw = gravure?.maskContourSw ?? outline?.sw ?? DEFAULT_MASK_CONTOUR_SW
  return {
    gravure: { ...gravure, maskContourSw: sw },
    outline: { ...outline, sw },
  }
}

/** Options gravure pour le tracé (sans épaisseur masque contour). */
export function gravureTraceOpts(gravureOpts) {
  const { maskContourSw, ...rest } = gravureOpts ?? {}
  return rest
}

/** Options gravure pour l'export laser final (tri X + dégradé vert → bleu). */
export function gravureOptsForExport(gravureOpts) {
  return gravureTraceOpts(gravureOpts)
}

/** Options extraction step2 — sw vient des paramètres gravure du labo. */
export function outlineOptsForExtraction(settings) {
  const s = settings ?? {}
  const sw = s.gravure?.maskContourSw ?? s.outline?.sw ?? DEFAULT_MASK_CONTOUR_SW
  return { ...DEFAULT_OUTLINE_OPTS, ...(s.outline ?? {}), sw }
}

export function buildTraceSettingsPayload({ gravure, decoupe, engine = 'browser' }) {
  const { gravure: g, outline: o } = syncMaskContourSw(gravure, {
    ...DEFAULT_OUTLINE_OPTS,
    sw: gravure?.maskContourSw ?? DEFAULT_MASK_CONTOUR_SW,
  })
  return { engine, gravure: g, decoupe, outline: o }
}

export function loadTraceSettings() {
  try {
    const raw = localStorage.getItem(TRACE_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const synced = syncMaskContourSw(
        { ...DEFAULT_TRACE_SETTINGS.gravure, ...parsed.gravure },
        { ...DEFAULT_TRACE_SETTINGS.outline, ...parsed.outline },
      )
      return {
        engine: parsed.engine ?? DEFAULT_TRACE_SETTINGS.engine,
        gravure: synced.gravure,
        decoupe: { ...DEFAULT_TRACE_SETTINGS.decoupe, ...parsed.decoupe },
        outline: synced.outline,
      }
    }
    const legacy = localStorage.getItem('mn_trace_settings_v1')
    if (legacy) {
      const parsed = JSON.parse(legacy)
      const synced = syncMaskContourSw(
        { ...DEFAULT_TRACE_SETTINGS.gravure, ...parsed.gravure },
        { ...DEFAULT_TRACE_SETTINGS.outline },
      )
      return {
        engine: parsed.engine ?? DEFAULT_TRACE_SETTINGS.engine,
        gravure: synced.gravure,
        decoupe: { ...DEFAULT_TRACE_SETTINGS.decoupe, ...parsed.decoupe },
        outline: synced.outline,
      }
    }
  } catch { /* ignore */ }
  return structuredClone(DEFAULT_TRACE_SETTINGS)
}

export function saveTraceSettings(settings) {
  const payload = buildTraceSettingsPayload(settings)
  localStorage.setItem(TRACE_SETTINGS_KEY, JSON.stringify(payload))
  return payload
}

export function resetTraceSettings() {
  localStorage.removeItem(TRACE_SETTINGS_KEY)
  localStorage.removeItem('mn_trace_settings_v1')
  return structuredClone(DEFAULT_TRACE_SETTINGS)
}
