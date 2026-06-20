import { useEffect, useRef, useState } from 'react'

const INPUT_LABELS = { user: 'source', ref: 'ref', step1: '→ étape 1', step2: '→ étape 2' }

function ConfigBadge({ config, light }) {
  if (!config) return null
  const inputs = (config.imageInputs ?? []).map(id => INPUT_LABELS[id] ?? id).join(' + ')
  return (
    <span className={`text-[10px] font-mono ml-1 ${light ? 'customer-muted' : 'text-stone-600'}`}>
      {config.resolution} • {config.aspectRatio}{inputs ? ` • ${inputs}` : ''}
    </span>
  )
}

function InitBar({ light }) {
  return (
    <div className={light ? 'customer-progress-track' : 'h-1.5 bg-stone-800 rounded-full overflow-hidden'}>
      <div className={`h-full w-1/3 rounded-full animate-shimmer ${light ? 'customer-progress-fill' : 'bg-amber-700/60'}`} />
    </div>
  )
}

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

function RunningContent({ log, light }) {
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
        <span className={light ? 'text-[#2C1F14]' : 'text-stone-300'}>{getPhaseLabel(elapsed, log)}</span>
        <span className={`tabular-nums text-xs ${light ? 'customer-muted' : 'text-stone-500'}`}>{elapsed}s</span>
      </div>
      <div className={light ? 'customer-progress-track' : 'h-1.5 bg-stone-800 rounded-full overflow-hidden'}>
        <div
          className={`h-full rounded-full relative overflow-hidden transition-all duration-1000 ease-out ${
            light ? 'customer-progress-fill' : 'bg-gradient-to-r from-amber-600 to-amber-400'
          }`}
          style={{ width: `${pct}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      {log && !log.includes('position') && (
        <p className={`text-[11px] font-mono truncate ${light ? 'customer-muted' : 'text-stone-600'}`}>{log}</p>
      )}
    </div>
  )
}

function stylesFor(theme) {
  const light = theme === 'light'
  if (light) {
    return {
      card: (status) => `customer-step-card ${status === 'running' ? 'is-running' : ''} ${status === 'done' ? 'is-done' : ''} ${status === 'error' ? 'is-error' : ''}`,
      num: {
        idle: 'bg-[#F5EDE0] border-[#C4A882] text-[#9A8F88]',
        init: 'bg-[#FAF0EB] border-[#C0684A]/50 text-[#C0684A]',
        running: 'bg-[#C0684A] border-[#A85238] text-white',
        done: 'bg-[#4A8A52] border-[#4A8A52] text-white',
        error: 'bg-red-600 border-red-500 text-white',
      },
      label: (status) => (status === 'idle' ? 'customer-muted' : 'text-[#2C1F14]'),
      imgBorder: 'border-t border-[rgba(196,168,130,0.28)]',
    }
  }
  return {
    card: (status) => `rounded-xl border bg-stone-900 overflow-hidden transition-colors duration-500 ${
      { idle: 'border-stone-800', init: 'border-amber-600/40', running: 'border-amber-500/60', done: 'border-green-600/60', error: 'border-red-600/60' }[status]
    }`,
    num: {
      idle: 'bg-stone-800 border-stone-700 text-stone-500',
      init: 'bg-stone-800 border-amber-500/50 text-amber-400',
      running: 'bg-amber-500 border-amber-400 text-stone-950',
      done: 'bg-green-600 border-green-500 text-white',
      error: 'bg-red-700 border-red-600 text-white',
    },
    label: (status) => (status === 'idle' ? 'text-stone-500' : 'text-stone-100'),
    imgBorder: 'border-t border-stone-800',
  }
}

const NUM_ICON = {
  idle:    n => n,
  init:    n => n,
  running: () => <span className="animate-spin inline-block leading-none">◌</span>,
  done:    () => '✓',
  error:   () => '✗',
}

export default function Step({ number, label, status = 'idle', image, log, error, config, theme = 'dark' }) {
  const light = theme === 'light'
  const s = stylesFor(theme)

  return (
    <div className={s.card(status)}>
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${s.num[status]}`}>
            {NUM_ICON[status](number)}
          </span>
          <div className="min-w-0">
            <span className={`font-medium text-sm transition-colors ${s.label(status)}`}>
              {label}
            </span>
            {(status === 'idle' || status === 'init' || status === 'running') && (
              <ConfigBadge config={config} light={light} />
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-xs">
          {status === 'idle'    && <span className={light ? 'customer-muted' : 'text-stone-600'}>En attente</span>}
          {status === 'init'    && <span className={`flex items-center gap-1 ${light ? 'text-[#C0684A]' : 'text-amber-500/70'}`}><span className={`w-1.5 h-1.5 rounded-full animate-pulse inline-block ${light ? 'bg-[#C0684A]' : 'bg-amber-500'}`} />Initialisation</span>}
          {status === 'done'    && <span className={light ? 'text-[#4A8A52]' : 'text-green-400'}>Terminé</span>}
          {status === 'error'   && <span className="text-red-500">Erreur</span>}
        </div>
      </div>

      {status === 'init' && (
        <div className="px-4 pb-4 space-y-2">
          <p className={`text-xs ${light ? 'customer-muted' : 'text-stone-500'}`}>Upload de l&apos;image en cours…</p>
          <InitBar light={light} />
        </div>
      )}

      {status === 'running' && (
        <div className="px-4 pb-4">
          <RunningContent log={log} light={light} />
        </div>
      )}

      {status === 'error' && error && (
        <div className="px-4 pb-3 text-xs text-red-500">{error}</div>
      )}

      {image && status === 'done' && (
        <div className={s.imgBorder}>
          <img src={image} alt={`résultat étape ${number}`} className="w-full block object-contain max-h-80 bg-[#F5EDE0]" />
        </div>
      )}
    </div>
  )
}
