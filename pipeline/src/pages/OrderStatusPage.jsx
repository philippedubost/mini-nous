import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrderByToken, resumeCheckout } from '../lib/storage'
import CustomerLayout from '../components/CustomerLayout'
import StudioCustomerFlow from '../components/StudioCustomerFlow'
import OrderTimeline from '../components/OrderTimeline'
import PaywallPhotoReplace from '../components/PaywallPhotoReplace'
import PaywallCompositionEditor from '../components/PaywallCompositionEditor'
import OrderCreationGallery from '../components/OrderCreationGallery'
import { displayLineartVersion } from '../lib/studioFlow'
import NpsSurvey from '../components/NpsSurvey'
import MiniNousShareProgram from '../components/MiniNousShareProgram'
import { useAuth } from '../context/AuthContext'

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function formatDateYmd(ymd) {
  if (!ymd) return null
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function addDaysToYmd(ymd, n) {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function daysLabel(ymd) {
  if (!ymd) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${ymd}T12:00:00`)
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return null
  return diff === 1 ? 'demain' : `dans ${diff} jours`
}

export default function OrderStatusPage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const stripeSessionId = searchParams.get('session_id')
  const autoParam = searchParams.get('auto') === '1'
  const { accessToken: bearerToken } = useAuth()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const load = useCallback(async () => {
    if (!orderToken) {
      setError('Lien incomplet — reprenez depuis votre e-mail de confirmation.')
      setLoading(false)
      return
    }
    try {
      const { order: o } = await fetchOrderByToken(orderToken, bearerToken)
      setOrder(o)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [orderToken, bearerToken])

  const pollMs = !order
    ? 30000
    : order.isPaid === false
      ? 5000
      : (order.studioGenerateActive || ['awaiting_photo', 'in_studio', 'pending_validation', 'revision_requested'].includes(order.workflowStatus))
        ? 5000
        : 30000

  useEffect(() => {
    load()
    const t = setInterval(load, pollMs)
    return () => clearInterval(t)
  }, [load, pollMs])

  useEffect(() => {
    if (window.location.hash !== '#avis') return
    const el = document.getElementById('avis')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [order, loading])

  const shipLabel = order?.deliveryDateLabel ?? null

  const showStudioFlow = order?.isPaid && ['awaiting_photo', 'in_studio', 'pending_validation', 'revision_requested'].includes(order?.workflowStatus)
  const showGallery = order?.isPaid && (order?.sourcePhotoUrl || order?.validatedLineartUrl || order?.previewUrl) && !showStudioFlow
  const showNps = order?.isPaid
    && ['approved', 'in_production', 'shipped'].includes(order?.workflowStatus)
    && !order?.npsSubmittedAt
  const showShare = order?.isPaid && order?.workflowStatus === 'shipped' && !order?.mininousShareUrl

  const autoStart = autoParam || (!order?.previewUrl && order?.workflowStatus === 'in_studio')

  return (
    <CustomerLayout
      title={order ? (order.customerFirstName ? `Bonjour ${order.customerFirstName}` : 'Votre commande') : undefined}
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
          {!order.isPaid && (
            <div className="customer-card space-y-3">
              <p className="font-semibold text-[#C0684A]">Paiement en attente</p>
              <p className="text-sm customer-muted">
                Votre photo est enregistrée. Finalisez le paiement pour lancer la création de votre tracé.
              </p>
              {order.sourcePhotoUrl && (
                <div className="customer-photo-frame max-h-48">
                  <img src={order.sourcePhotoUrl} alt="Votre photo" />
                </div>
              )}
              <PaywallCompositionEditor
                orderToken={orderToken}
                faceCount={order.faceCount}
                childCount={order.childCount}
                maxFaces={order.maxFaces ?? 8}
                amountEur={order.amountEur}
                onUpdated={setOrder}
              />
              <PaywallPhotoReplace
                orderToken={orderToken}
                canReplace={order.canReplacePaywallPhoto}
                replaced={order.paywallPhotoReplaced}
                onUpdated={setOrder}
              />
              <button
                type="button"
                disabled={checkoutBusy}
                onClick={async () => {
                  setCheckoutBusy(true)
                  try {
                    const { url } = await resumeCheckout(orderToken, {
                      pack: order.packType,
                      faceCount: order.faceCount,
                      childCount: order.childCount ?? 0,
                    })
                    window.location.href = url
                  } catch (e) {
                    setError(e.message)
                    setCheckoutBusy(false)
                  }
                }}
                className="customer-btn-clay w-full"
              >
                {checkoutBusy ? 'Redirection…' : 'Finaliser le paiement →'}
              </button>
            </div>
          )}

          <OrderTimeline order={order} />

          {showStudioFlow && (
            <StudioCustomerFlow
              orderToken={orderToken}
              bearerToken={bearerToken}
              autoStart={autoStart}
              stripeSessionId={stripeSessionId}
              onOrderChange={setOrder}
            />
          )}

          {showGallery && (
            <OrderCreationGallery
              sourcePhotoUrl={order.sourcePhotoUrl}
              validatedLineartUrl={order.validatedLineartUrl}
              previewUrl={order.previewUrl}
              lineartVersion={displayLineartVersion(order)}
              lineartVersions={order.lineartVersions ?? []}
            />
          )}

          {order.loyaltyCouponCode && (
            <div className="customer-card-muted !p-4 text-center space-y-2">
              <p className="text-sm font-semibold text-[#2C1F14]">−10 % sur votre prochaine commande</p>
              <p className="font-mono text-lg font-bold text-[#C0684A]">{order.loyaltyCouponCode}</p>
              <p className="text-xs customer-muted">Code unique · à saisir au paiement Stripe</p>
            </div>
          )}

          {showNps && (
            <div id="avis">
              <NpsSurvey
                orderToken={orderToken}
                submitted={!!order.npsSubmittedAt}
                initialScore={order.npsScore}
              />
            </div>
          )}

          {showShare && (
            <MiniNousShareProgram orderToken={orderToken} submitted={!!order.mininousShareUrl} />
          )}

          <div className="customer-card space-y-3 text-sm">
            {order.shippingAddress && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">Livraison</span>
                <span className="text-[#2C1F14] text-right font-medium text-xs leading-relaxed">
                  {order.shippingAddress.name && <>{order.shippingAddress.name}<br /></>}
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
                  <br />
                  {order.shippingAddress.postalCode} {order.shippingAddress.city}
                  {' · '}{order.shippingAddress.country}
                </span>
              </div>
            )}
            {order.shipDate && !order.fridayDelivery && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">Expédition atelier</span>
                <span className="text-[#2C1F14] text-right font-medium">
                  {formatDateYmd(order.shipDate)}
                  {daysLabel(order.shipDate) && (
                    <span className="text-[#C0684A] font-normal"> · {daysLabel(order.shipDate)}</span>
                  )}
                </span>
              </div>
            )}
            {shipLabel && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">Livraison prévue</span>
                <span className="text-[#2C1F14] text-right font-medium">
                  {shipLabel}
                  {order.shipDate && daysLabel(order.fridayDelivery ? order.shipDate : addDaysToYmd(order.shipDate, 4)) && (
                    <span className="text-[#C0684A] font-normal"> · {daysLabel(order.fridayDelivery ? order.shipDate : addDaysToYmd(order.shipDate, 4))}</span>
                  )}
                </span>
              </div>
            )}
            {order.paidAt && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">Payé le</span>
                <span className="text-[#2C1F14] font-medium">{formatDate(order.paidAt)}</span>
              </div>
            )}
            {order.paidAt && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">Facture</span>
                {order.invoiceUrl ? (
                  <a
                    href={order.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#C0684A] font-medium text-sm hover:underline"
                  >
                    Télécharger PDF →
                  </a>
                ) : (
                  <span className="text-[#9A8F88] text-sm">En cours de génération…</span>
                )}
              </div>
            )}
            {order.email && (
              <div className="flex justify-between gap-4">
                <span className="customer-muted">E-mail</span>
                <span className="text-[#2C1F14] truncate font-medium">{order.email}</span>
              </div>
            )}
          </div>

          {order.isPaid && ['in_production', 'shipped'].includes(order.workflowStatus) && (
            <p className="text-sm customer-muted text-center">
              Votre commande est en fabrication — modifications fermées.
            </p>
          )}

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
