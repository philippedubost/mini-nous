import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrderByToken } from '../lib/storage'
import CustomerLayout from '../components/CustomerLayout'

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
    <CustomerLayout
      title={order ? 'Votre commande' : undefined}
      subtitle={order ? `${order.packLabel} · ${order.faceCount} figurine${order.faceCount > 1 ? 's' : ''}${order.amountEur ? ` · ${order.amountEur} €` : ''}` : undefined}
      navRight={<span className="customer-muted text-xs">Suivi commande</span>}
    >
      {loading && (
        <p className="customer-muted text-center py-12">Chargement de votre commande…</p>
      )}

      {error && !loading && (
        <div className="customer-alert-warn text-center space-y-4">
          <p>{error}</p>
          <a href="/" className="customer-link">← Boutique</a>
        </div>
      )}

      {order && !loading && (
        <>
          <div className="customer-card">
            <div className="flex justify-between gap-2 mb-6">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex-1 text-center">
                  <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-2 ${
                    i <= currentStep ? 'customer-step-active' : 'customer-step-idle'
                  }`}>
                    {i + 1}
                  </div>
                  <span className={`text-[10px] sm:text-xs font-medium ${i <= currentStep ? 'text-[#2C1F14]' : 'customer-muted'}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="customer-status-box">
              <p className="font-semibold text-[#C0684A]">{order.workflowLabel}</p>
              <p className="text-sm customer-muted mt-1">{order.workflowHint}</p>
            </div>
          </div>

          {order.previewUrl && (
            <div className="customer-card overflow-hidden !p-0">
              <p className="text-xs customer-muted px-4 pt-3">Aperçu atelier</p>
              <img
                src={order.previewUrl}
                alt="Aperçu de votre design"
                className="w-full max-h-80 object-contain bg-[#F5EDE0] p-2"
              />
            </div>
          )}

          <div className="customer-card space-y-3 text-sm">
            {shipLabel && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">Livraison prévue</span>
                <span className="text-[#2C1F14] text-right font-medium">{shipLabel}</span>
              </div>
            )}
            {order.paidAt && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">Payé le</span>
                <span className="text-[#2C1F14] font-medium">{formatDate(order.paidAt)}</span>
              </div>
            )}
            {order.email && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">E-mail</span>
                <span className="text-[#2C1F14] truncate font-medium">{order.email}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {order.editable && order.workflowStatus === 'awaiting_photo' && (
              <Link
                to={`/studio?order=${encodeURIComponent(orderToken)}`}
                className="customer-btn-clay flex-1 text-center"
              >
                Envoyer ma photo →
              </Link>
            )}
            {order.editable && order.workflowStatus !== 'awaiting_photo' && (
              <Link
                to={`/studio?order=${encodeURIComponent(orderToken)}`}
                className="customer-btn-clay flex-1 text-center"
              >
                Ouvrir le studio →
              </Link>
            )}
            {!order.editable && (
              <p className="flex-1 text-center py-3 text-sm customer-muted">
                Votre commande est en fabrication — modifications fermées.
              </p>
            )}
          </div>

          <p className="text-xs customer-muted text-center leading-relaxed">
            Conservez cette page en favori pour retrouver votre commande.
            {order.email ? ' Un e-mail de confirmation vous a aussi été envoyé.' : ''}
            {' '}Ou <Link to="/compte" className="text-[#C0684A] hover:underline">connectez-vous</Link> pour tout retrouver.
          </p>
        </>
      )}
    </CustomerLayout>
  )
}
