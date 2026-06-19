import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrderByToken } from '../lib/storage'

const STEPS = [
  { key: 'awaiting_photo', label: 'Photo' },
  { key: 'in_studio', label: 'Design' },
  { key: 'in_production', label: 'Fabrication' },
  { key: 'shipped', label: 'Livraison' },
]

function stepIndex(status) {
  if (status === 'awaiting_photo') return 0
  if (['in_studio', 'pending_validation', 'revision_requested', 'approved'].includes(status)) return 1
  if (status === 'in_production') return 2
  if (status === 'shipped') return 3
  return 0
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function OrderStatusPage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orderToken) {
      setError('Lien incomplet — reprenez depuis votre e-mail de confirmation.')
      setLoading(false)
      return
    }
    try {
      const { order: o } = await fetchOrderByToken(orderToken)
      setOrder(o)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [orderToken])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const currentStep = order ? stepIndex(order.workflowStatus) : 0
  const shipLabel = order?.shipDate
    ? new Date(`${order.shipDate}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    : null

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 px-6 py-4 flex items-center justify-between max-w-3xl mx-auto">
        <Link to="/" className="font-bold text-amber-400/90 hover:text-amber-300 transition-colors">
          Les MiniNous
        </Link>
        <span className="text-xs text-stone-500">Ma commande</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {loading && (
          <p className="text-stone-400 text-center py-16">Chargement de votre commande…</p>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 p-6 text-center space-y-4">
            <p className="text-amber-200 text-sm">{error}</p>
            <a href="/" className="text-sm text-stone-400 hover:text-stone-200">← Boutique</a>
          </div>
        )}

        {order && !loading && (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Votre commande</h1>
              <p className="text-stone-400 text-sm">
                {order.packLabel} · {order.faceCount} figurine{order.faceCount > 1 ? 's' : ''}
                {order.amountEur ? ` · ${order.amountEur} €` : ''}
              </p>
            </div>

            {/* Timeline */}
            <div className="rounded-2xl border border-stone-800 bg-stone-900/50 p-6">
              <div className="flex justify-between gap-2 mb-6">
                {STEPS.map((s, i) => (
                  <div key={s.key} className="flex-1 text-center">
                    <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-2 ${
                      i <= currentStep
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-500'
                    }`}>
                      {i + 1}
                    </div>
                    <span className={`text-[10px] sm:text-xs ${i <= currentStep ? 'text-stone-200' : 'text-stone-600'}`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 px-4 py-3">
                <p className="font-semibold text-amber-100">{order.workflowLabel}</p>
                <p className="text-sm text-amber-200/70 mt-1">{order.workflowHint}</p>
              </div>
            </div>

            {order.previewUrl && (
              <div className="rounded-2xl border border-stone-800 overflow-hidden bg-stone-900/30">
                <p className="text-xs text-stone-500 px-4 pt-3">Aperçu atelier</p>
                <img
                  src={order.previewUrl}
                  alt="Aperçu de votre design"
                  className="w-full max-h-80 object-contain bg-stone-900/50"
                />
              </div>
            )}

            <div className="rounded-2xl border border-stone-800 bg-stone-900/30 p-5 space-y-3 text-sm">
              {shipLabel && (
                <div className="flex justify-between gap-4">
                  <span className="text-stone-500">Livraison prévue</span>
                  <span className="text-stone-200 text-right">{shipLabel}</span>
                </div>
              )}
              {order.paidAt && (
                <div className="flex justify-between gap-4">
                  <span className="text-stone-500">Payé le</span>
                  <span className="text-stone-200">{formatDate(order.paidAt)}</span>
                </div>
              )}
              {order.email && (
                <div className="flex justify-between gap-4">
                  <span className="text-stone-500">E-mail</span>
                  <span className="text-stone-200 truncate">{order.email}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {order.editable && order.workflowStatus === 'awaiting_photo' && (
                <Link
                  to={`/studio?order=${encodeURIComponent(orderToken)}`}
                  className="flex-1 text-center py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors"
                >
                  Envoyer ma photo →
                </Link>
              )}
              {order.editable && order.workflowStatus !== 'awaiting_photo' && (
                <Link
                  to={`/studio?order=${encodeURIComponent(orderToken)}`}
                  className="flex-1 text-center py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors"
                >
                  Ouvrir le studio →
                </Link>
              )}
              {!order.editable && (
                <p className="flex-1 text-center py-3.5 text-sm text-stone-500">
                  Votre commande est en fabrication — modifications fermées.
                </p>
              )}
            </div>

            <p className="text-xs text-stone-600 text-center leading-relaxed">
              Conservez cette page en favori pour retrouver votre commande.
              {order.email ? ' Un e-mail de confirmation vous a aussi été envoyé.' : ''}
              {' '}Ou <Link to="/compte" className="text-amber-600 hover:text-amber-500">connectez-vous</Link> pour tout retrouver.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
