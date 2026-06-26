import { useEffect, useState } from 'react'
import { fetchMetrics } from '../lib/storage'

function StatCard({ label, value, sub, tone }) {
  const tones = {
    green: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-600/40 bg-amber-500/10 text-amber-300',
    blue:  'border-sky-600/40 bg-sky-500/10 text-sky-300',
    rose:  'border-rose-600/40 bg-rose-500/10 text-rose-300',
    stone: 'border-stone-600/40 bg-stone-800/60 text-stone-300',
  }
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-1 ${tones[tone] ?? tones.stone}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-3xl font-bold">{value ?? '—'}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  )
}

function FunnelBar({ label, count, max, tone }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  const toneMap = {
    green:  'bg-emerald-500',
    amber:  'bg-amber-500',
    blue:   'bg-sky-500',
    violet: 'bg-violet-500',
  }
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-stone-300">{label}</span>
        <span className="text-stone-400">{count} <span className="text-stone-600">({pct}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-stone-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${toneMap[tone] ?? 'bg-stone-500'}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  )
}

function WaitlistTable({ emails }) {
  if (!emails?.length) {
    return <p className="text-stone-500 text-sm">Aucune inscription pour cette semaine.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-stone-800">
            <th className="pb-2 text-stone-400 font-medium">E-mail</th>
            <th className="pb-2 text-stone-400 font-medium">Personnages</th>
            <th className="pb-2 text-stone-400 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((row, i) => (
            <tr key={i} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
              <td className="py-2 text-stone-200">{row.email}</td>
              <td className="py-2 text-stone-400">{row.face_count ?? '—'}</td>
              <td className="py-2 text-stone-500 text-xs">
                {row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminMetricsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMetrics()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-stone-400 animate-pulse">Chargement…</p>
  if (error) return <p className="text-rose-400">Erreur : {error}</p>

  const { funnel, conversion, waitlist, week } = data ?? {}
  const wk = conversion?.thisWeek ?? {}
  const all = conversion?.last30Days ?? {}
  const wlWeek = waitlist?.thisWeek ?? {}
  const wlAll = waitlist?.allTime ?? {}
  const funnelMax = Math.max(wk.uploads ?? 0, 1)
  const allMax = Math.max(all.uploads ?? 0, 1)

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Métriques</p>
        <h2 className="text-2xl font-bold text-stone-100">Conversion & liste d&apos;attente</h2>
        <p className="text-stone-400 text-sm">
          Semaine en cours : <code className="text-stone-300">{week?.weekKey}</code>
          {' '}· Expédition : <code className="text-stone-300">{week?.shipDate}</code>
          {' '}· Capacité : <span className="text-stone-300">{week?.paidCount} / {week?.capacity}</span>
        </p>
      </header>

      {/* Semaine courante */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Semaine en cours</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Photos uploadées" value={wk.uploads} tone="blue" sub="POST order-start réussi" />
          <StatCard label="Checkouts Stripe" value={wk.checkouts} tone="amber" sub="Sessions créées" />
          <StatCard label="Commandes payées" value={wk.paid} tone="green" sub="Stripe webhook" />
          <StatCard label="Liste d'attente" value={wlWeek.total} tone="rose" sub="Inscriptions cette semaine" />
        </div>
        {(wk.uploads ?? 0) > 0 && (
          <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5 space-y-4">
            <p className="text-sm font-semibold text-stone-300">Funnel de conversion — semaine courante</p>
            <FunnelBar label="Photos uploadées" count={wk.uploads} max={funnelMax} tone="blue" />
            <FunnelBar label="Checkouts initiés" count={wk.checkouts} max={funnelMax} tone="amber" />
            <FunnelBar label="Paiements complétés" count={wk.paid} max={funnelMax} tone="green" />
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-stone-800">
              <div className="text-center">
                <p className="text-xs text-stone-500">Upload → Checkout</p>
                <p className="text-lg font-bold text-amber-300">
                  {wk.uploadToCheckout != null ? `${wk.uploadToCheckout}%` : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-stone-500">Checkout → Payé</p>
                <p className="text-lg font-bold text-emerald-300">
                  {wk.checkoutToPaid != null ? `${wk.checkoutToPaid}%` : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-stone-500">Upload → Payé</p>
                <p className="text-lg font-bold text-violet-300">
                  {wk.uploadToPaid != null ? `${wk.uploadToPaid}%` : '—'}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 30 derniers jours */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">30 derniers jours</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Photos uploadées" value={all.uploads} tone="blue" />
          <StatCard label="Checkouts" value={all.checkouts} tone="amber" />
          <StatCard label="Paiements" value={all.paid} tone="green" />
          <StatCard label="Waitlist total" value={wlAll.total} tone="rose" />
        </div>
        {(all.uploads ?? 0) > 0 && (
          <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5 space-y-4">
            <p className="text-sm font-semibold text-stone-300">Funnel 30 jours</p>
            <FunnelBar label="Photos uploadées" count={all.uploads} max={allMax} tone="blue" />
            <FunnelBar label="Checkouts initiés" count={all.checkouts} max={allMax} tone="amber" />
            <FunnelBar label="Paiements complétés" count={all.paid} max={allMax} tone="green" />
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-stone-800">
              <div className="text-center">
                <p className="text-xs text-stone-500">Upload → Checkout</p>
                <p className="text-lg font-bold text-amber-300">
                  {all.uploadToCheckout != null ? `${all.uploadToCheckout}%` : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-stone-500">Checkout → Payé</p>
                <p className="text-lg font-bold text-emerald-300">
                  {all.checkoutToPaid != null ? `${all.checkoutToPaid}%` : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-stone-500">Upload → Payé</p>
                <p className="text-lg font-bold text-violet-300">
                  {all.uploadToPaid != null ? `${all.uploadToPaid}%` : '—'}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Liste d'attente */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
          Liste d&apos;attente · semaine {week?.weekKey}
        </h3>
        {(wlWeek.total ?? 0) === 0 ? (
          <p className="text-stone-500 text-sm">
            Aucune inscription cette semaine.
            {wlAll.total > 0 && ` (${wlAll.total} au total)`}
          </p>
        ) : (
          <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5 space-y-4">
            <p className="text-stone-400 text-sm">
              {wlWeek.total} inscription{wlWeek.total > 1 ? 's' : ''} cette semaine
              {wlAll.total > wlWeek.total ? ` · ${wlAll.total} au total` : ''}
            </p>
            <WaitlistTable emails={waitlist?.emails} />
          </div>
        )}
      </section>

      {/* Aide */}
      <div className="rounded-xl border border-stone-800 bg-stone-900/40 p-5 text-sm text-stone-400 space-y-2">
        <p className="font-semibold text-stone-300">Comment les données sont collectées</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><code className="text-stone-300">photo_uploaded</code> — POST /api/order-start réussi</li>
          <li><code className="text-stone-300">checkout_initiated</code> — session Stripe créée</li>
          <li><code className="text-stone-300">payment_completed</code> — webhook/confirm Stripe OK</li>
          <li><code className="text-stone-300">waitlist_signup</code> — formulaire liste d&apos;attente</li>
        </ul>
        <p className="text-stone-500 text-xs mt-2">
          Données stockées dans <code>mini_nous_funnel_events</code> et <code>mini_nous_waitlist</code> (Supabase).
        </p>
      </div>
    </div>
  )
}
