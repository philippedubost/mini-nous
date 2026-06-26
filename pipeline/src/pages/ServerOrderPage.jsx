import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchWorkerOrder, loadWorkerSecret } from '../lib/studioWorker'

const STEP_LABELS = {
  source: 'Photo source',
  ref: 'Référence line art',
  step1: 'Step 1 — Photo de face séparée',
  step2: 'Step 2 — Tracé',
  outline: 'Extraction contours',
  laser_merged: 'SVG laser',
}

const PHASE_LABELS = {
  queued: 'En file moteur',
  step1: 'Step 1 en cours',
  step2: 'Step 2 en cours',
  done: 'Terminé',
  error: 'Erreur',
}

function AssetPanel({ label, url, adminOnly }) {
  return (
    <div className="rounded-xl border border-stone-800 overflow-hidden bg-stone-900/40">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 px-3 py-2 border-b border-stone-800 bg-stone-950/60">
        {label}
        {adminOnly && <span className="ml-2 text-stone-600 normal-case">(admin)</span>}
      </p>
      <div className="aspect-[4/3] bg-white flex items-center justify-center p-2 min-h-[140px]">
        {url
          ? <img src={url} alt="" className="max-w-full max-h-full object-contain" />
          : <span className="text-xs text-stone-400">—</span>}
      </div>
    </div>
  )
}

export default function ServerOrderPage() {
  const { orderId } = useParams()
  const secret = loadWorkerSecret()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!secret || !orderId) {
      setLoading(false)
      if (!secret) setError('Secret worker manquant — retournez à l’accueil /server')
      return
    }
    fetchWorkerOrder(secret, orderId)
      .then(data => setOrder(data.order))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [secret, orderId])

  if (loading) {
    return <p className="text-stone-500 text-center py-16">Chargement…</p>
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-red-400">{error}</p>
        <Link to="/" className="text-sky-400 hover:text-sky-300 text-sm">← Retour Kanban</Link>
      </div>
    )
  }

  if (!order) return null

  const title = order.customerName || order.email || 'Commande'
  const col = order.column

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-['Montserrat',sans-serif]">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <header className="space-y-3 border-b border-stone-800 pb-5">
          <Link to="/" className="text-sm text-stone-500 hover:text-stone-300">← Kanban moteur</Link>
          <div className="flex flex-wrap items-start gap-4">
            {order.thumbUrl && (
              <img src={order.thumbUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-stone-700" />
            )}
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-xs font-mono text-stone-500 mt-1">{order.orderId}</p>
              <p className="text-sm text-stone-400 mt-1">
                {order.packLabel} · {order.faceCount} pers. · {order.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-stone-700 px-2 py-1 text-stone-300">
              Colonne : <strong>{col}</strong>
            </span>
            <span className="rounded border border-stone-700 px-2 py-1 text-stone-400">
              workflow : {order.workflowStatus}
            </span>
            {order.studioJob?.phase && (
              <span className="rounded border border-sky-800 px-2 py-1 text-sky-300">
                moteur : {PHASE_LABELS[order.studioJob.phase] ?? order.studioJob.phase}
              </span>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <AssetPanel label="Photo client" url={order.assets?.source} />
          <AssetPanel label="Step 1 — mise en scène" url={order.assets?.step1} adminOnly />
          <AssetPanel label="Step 2 — tracé" url={order.assets?.step2} />
        </section>

        {order.lineartVersions?.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-stone-300">Versions tracé (v1 → v3)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {order.lineartVersions.map(v => (
                <AssetPanel key={v.versionId} label={`Tracé v${v.studioVersion}`} url={v.url} />
              ))}
            </div>
          </section>
        )}

        {order.steps?.length > 0 && (
          <section className="rounded-xl border border-stone-800 overflow-hidden">
            <div className="px-4 py-2 border-b border-stone-800 bg-stone-900/80">
              <h2 className="text-sm font-semibold text-stone-300">Étapes en base</h2>
            </div>
            <ul className="divide-y divide-stone-800 text-sm">
              {order.steps.map(s => (
                <li key={s.assetType} className="px-4 py-2 flex justify-between gap-4">
                  <span className="text-stone-300">{STEP_LABELS[s.assetType] ?? s.assetType}</span>
                  <span className={`text-xs ${s.status === 'done' ? 'text-emerald-400' : 'text-stone-500'}`}>
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-wrap gap-3 text-sm">
          {order.generationId && (
            <a
              href={`/admin/g/${order.generationId}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber-400 hover:text-amber-300"
            >
              Pipeline admin complet →
            </a>
          )}
          {order.accessToken && (
            <a
              href={`/pipeline/commande?order=${encodeURIComponent(order.accessToken)}`}
              target="_blank"
              rel="noreferrer"
              className="text-stone-500 hover:text-stone-300"
            >
              Vue client →
            </a>
          )}
        </section>

        {order.studioJob?.error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
            <strong>Erreur moteur :</strong> {order.studioJob.error}
          </div>
        )}
      </div>
    </div>
  )
}
