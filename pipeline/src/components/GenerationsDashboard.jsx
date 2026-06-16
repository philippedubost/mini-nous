import { useEffect, useState, useCallback } from 'react'
import { fetchGenerations } from '../lib/storage'
import { STEP_LABELS } from '../lib/settings'

const STATUS_STYLES = {
  running: 'bg-amber-500/20 text-amber-300 border-amber-600/40',
  done: 'bg-emerald-500/20 text-emerald-300 border-emerald-600/40',
  error: 'bg-red-500/20 text-red-300 border-red-600/40',
  pending: 'bg-stone-700 text-stone-400 border-stone-600',
}

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
      {status}
    </span>
  )
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function thumbFor(gen) {
  const steps = gen.steps ?? []
  return steps.find(s => s.asset_type === 'step2')?.image_url
    || steps.find(s => s.asset_type === 'step1')?.image_url
    || steps.find(s => s.asset_type === 'source')?.image_url
    || null
}

function GenerationCard({ gen, expanded, onToggle }) {
  const thumb = thumbFor(gen)
  const steps = [...(gen.steps ?? [])].sort((a, b) =>
    a.step_index - b.step_index || a.asset_type.localeCompare(b.asset_type)
  )

  return (
    <div className="border border-stone-700 rounded-xl overflow-hidden bg-stone-900/60">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-stone-800/60 text-left transition-colors"
      >
        <div className="w-14 h-14 rounded-lg bg-stone-800 border border-stone-700 overflow-hidden shrink-0">
          {thumb
            ? <img src={thumb} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-stone-600 text-xs">—</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-stone-200 truncate">
              {formatDate(gen.created_at)}
            </span>
            <StatusBadge status={gen.status} />
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            {gen.face_count != null ? `${gen.face_count} visage${gen.face_count > 1 ? 's' : ''}` : '—'}
            {' · '}{gen.resolution ?? '—'} · {gen.aspect_ratio ?? '—'}
          </p>
          <p className="text-[10px] text-stone-600 font-mono mt-0.5 truncate">{gen.id}</p>
        </div>
        <span className="text-stone-500 text-lg">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="border-t border-stone-800 p-3 space-y-3">
          {gen.error_message && (
            <p className="text-xs text-red-400 bg-red-950/40 rounded-lg p-2">{gen.error_message}</p>
          )}

          {steps.length === 0 ? (
            <p className="text-sm text-stone-500">Aucune étape enregistrée.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {steps.map(step => (
                <div key={step.id} className="rounded-lg border border-stone-700 bg-stone-950 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-stone-300">
                        {step.label || step.asset_type}
                      </p>
                      <p className="text-[10px] text-stone-600">
                        Étape {step.step_index} · {STEP_LABELS[step.step_index] ?? step.asset_type}
                      </p>
                    </div>
                    <StatusBadge status={step.status} />
                  </div>
                  {step.image_url && (
                    <a href={step.image_url} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={step.image_url}
                        alt={step.label}
                        className="w-full rounded-md border border-stone-800 bg-white object-contain max-h-40"
                      />
                    </a>
                  )}
                  {step.prompt && (
                    <p className="text-[10px] text-stone-500 line-clamp-3 font-mono">{step.prompt}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GenerationsDashboard() {
  const [generations, setGenerations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGenerations()
      setGenerations(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-500">{generations.length} génération{generations.length !== 1 ? 's' : ''}</p>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-amber-500 hover:text-amber-400 disabled:opacity-50"
        >
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && generations.length === 0 && (
        <p className="text-sm text-stone-500 text-center py-8">Aucune génération enregistrée pour l'instant.</p>
      )}

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {generations.map(gen => (
          <GenerationCard
            key={gen.id}
            gen={gen}
            expanded={expandedId === gen.id}
            onToggle={() => setExpandedId(id => id === gen.id ? null : gen.id)}
          />
        ))}
      </div>
    </div>
  )
}
