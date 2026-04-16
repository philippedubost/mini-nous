import { useEffect, useRef, useState } from 'react'

const INPUT_LABELS = { user: 'source', ref: 'ref', step1: '→ étape 1', step2: '→ étape 2' }

function ConfigBadge({ config }) {
  if (!config) return null
  const inputs = (config.imageInputs ?? []).map(id => INPUT_LABELS[id] ?? id).join(' + ')
  return (
    <span className="text-[10px] text-stone-600 font-mono ml-1">
      {config.resolution} • {config.aspectRatio}{inputs ? ` • ${inputs}` : ''}
    </span>
  )
}

// ── Indeterminate bar for init phase ──────────────────────
function InitBar() {
  return (
    <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
      <div className="h-full w-1/3 rounded-full bg-amber-700/60 animate-shimmer" />
    </div>
  )
}

// ── Timed progress bar for running phase ──────────────────
const PHASE_LABELS = [
  { at: 0,  text: "En file d'attente…" },
  { at: 10, text: 'Génération en cours…' },
  { at: 28, text: 'Rendu en cours…' },
  { at: 40, text: 'Finalisation…' },
]

function getPhaseLabel(elapsed, log) {
  if (log?.includes('position')) return log
  for (let i = PHASE_LABELS.length - 1; i >= 0; i--) {
    if (elapsed >= PHASE_LABELS[i].at) return PHASE_LABELS[i].text
  }
  return PHASE_LABELS[0].text
}

function RunningContent({ log }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const pct = Math.min(95, (elapsed / 45) * 100)

  return (
    <div className="space-y-2.5 pt-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-stone-300">{getPhaseLabel(elapsed, log)}</span>
        <span className="text-stone-500 tabular-nums text-xs">{elapsed}s</span>
      </div>
      <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 relative overflow-hidden transition-all duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      {log && !log.includes('position') && (
        <p className="text-[11px] text-stone-600 font-mono truncate">{log}</p>
      )}
    </div>
  )
}

// ── Style maps ────────────────────────────────────────────
const BORDER = {
  idle:    'border-stone-800',
  init:    'border-amber-600/40',
  running: 'border-amber-500/60',
  done:    'border-green-600/60',
  error:   'border-red-600/60',
}

const NUM_STYLE = {
  idle:    'bg-stone-800 border-stone-700 text-stone-500',
  init:    'bg-stone-800 border-amber-500/50 text-amber-400',
  running: 'bg-amber-500 border-amber-400 text-stone-950',
  done:    'bg-green-600 border-green-500 text-white',
  error:   'bg-red-700 border-red-600 text-white',
}

const NUM_ICON = {
  idle:    n => n,
  init:    n => n,
  running: () => <span className="animate-spin inline-block leading-none">◌</span>,
  done:    () => '✓',
  error:   () => '✗',
}

export default function Step({ number, label, status = 'idle', image, log, error, config }) {
  return (
    <div className={`rounded-xl border bg-stone-900 overflow-hidden transition-colors duration-500 ${BORDER[status]}`}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${NUM_STYLE[status]}`}>
            {NUM_ICON[status](number)}
          </span>
          <div className="min-w-0">
            <span className={`font-medium text-sm transition-colors ${status === 'idle' ? 'text-stone-500' : 'text-stone-100'}`}>
              {label}
            </span>
            {(status === 'idle' || status === 'init' || status === 'running') && (
              <ConfigBadge config={config} />
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-xs">
          {status === 'idle'    && <span className="text-stone-600">En attente</span>}
          {status === 'init'    && <span className="text-amber-500/70 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />Initialisation</span>}
          {status === 'done'    && <span className="text-green-400">Terminé</span>}
          {status === 'error'   && <span className="text-red-400">Erreur</span>}
        </div>
      </div>

      {/* Init — indeterminate loader */}
      {status === 'init' && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs text-stone-500">Upload de l'image en cours…</p>
          <InitBar />
        </div>
      )}

      {/* Running */}
      {status === 'running' && (
        <div className="px-4 pb-4">
          <RunningContent log={log} />
        </div>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <div className="px-4 pb-3 text-xs text-red-400">{error}</div>
      )}

      {/* Result image */}
      {image && status === 'done' && (
        <div className="border-t border-stone-800">
          <img src={image} alt={`résultat étape ${number}`} className="w-full block object-contain max-h-80" />
        </div>
      )}
    </div>
  )
}
