import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fetchGenerations } from '../lib/storage'
import { ImageWithZoom } from '../components/ImageLightbox'

const STATUS_STYLES = {
  running: 'bg-amber-500/20 text-amber-300',
  done: 'bg-emerald-500/20 text-emerald-300',
  error: 'bg-red-500/20 text-red-300',
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function thumbFor(gen) {
  const steps = gen.steps ?? []
  return steps.find(s => s.asset_type === 'step2')?.image_url
    || steps.find(s => s.asset_type === 'step1')?.image_url
    || steps.find(s => s.asset_type === 'source')?.image_url
}

export default function AdminGenerationsPage() {
  const [generations, setGenerations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGenerations(await fetchGenerations())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-stone-400 text-sm">
          {generations.length} génération{generations.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-sm text-amber-500 hover:text-amber-400 disabled:opacity-50"
        >
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {!loading && !error && generations.length === 0 && (
        <p className="text-stone-500 text-center py-16">Aucune génération enregistrée.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {generations.map(gen => (
          <Link
            key={gen.id}
            to={`/admin/g/${gen.id}`}
            className="group rounded-xl border border-stone-800 bg-stone-900/50 hover:border-stone-600 hover:bg-stone-900 transition-colors overflow-hidden"
          >
            <div className="aspect-video bg-stone-800 overflow-hidden relative">
              {thumbFor(gen)
                ? (
                  <ImageWithZoom
                    src={thumbFor(gen)}
                    label={formatDate(gen.created_at)}
                    className="w-full h-full"
                    imgClassName="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                  />
                )
                : <div className="w-full h-full flex items-center justify-center text-stone-600">—</div>
              }
            </div>
            <div className="p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-stone-200">{formatDate(gen.created_at)}</span>
                <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[gen.status] ?? ''}`}>
                  {gen.status}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                {gen.face_count != null ? `${gen.face_count} visage${gen.face_count > 1 ? 's' : ''} · ` : ''}
                {gen.resolution} · {gen.aspect_ratio}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
