import { DEFAULT_TRACE_OPTS, DECOUPE_OPTIMIZE_OPTS } from './centerlineTrace'

export const TRACE_SETTINGS_KEY = 'mn_trace_settings_v1'

export const DEFAULT_TRACE_SETTINGS = {
  engine: 'browser',
  gravure: { ...DEFAULT_TRACE_OPTS },
  decoupe: { ...DECOUPE_OPTIMIZE_OPTS },
}

/** Options gravure pour l'export laser final (sans dégradé debug). */
export function gravureOptsForExport(gravureOpts) {
  return { ...gravureOpts, pathOrderDebug: false }
}

export function loadTraceSettings() {
  try {
    const raw = localStorage.getItem(TRACE_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        engine: parsed.engine ?? DEFAULT_TRACE_SETTINGS.engine,
        gravure: { ...DEFAULT_TRACE_SETTINGS.gravure, ...parsed.gravure },
        decoupe: { ...DEFAULT_TRACE_SETTINGS.decoupe, ...parsed.decoupe },
      }
    }
  } catch { /* ignore */ }
  return structuredClone(DEFAULT_TRACE_SETTINGS)
}

export function saveTraceSettings(settings) {
  localStorage.setItem(TRACE_SETTINGS_KEY, JSON.stringify(settings))
}

export function resetTraceSettings() {
  localStorage.removeItem(TRACE_SETTINGS_KEY)
  return structuredClone(DEFAULT_TRACE_SETTINGS)
}
