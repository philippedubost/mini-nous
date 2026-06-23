import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrderByToken, resumeCheckout } from '../lib/storage'
import CustomerLayout from '../components/CustomerLayout'
import StudioCustomerFlow from '../components/StudioCustomerFlow'
import OrderTimeline from '../components/OrderTimeline'
import PaywallPhotoReplace from '../components/PaywallPhotoReplace'
import PaywallCompositionEditor from '../components/PaywallCompositionEditor'
import OrderCreationGallery from '../components/OrderCreationGallery'
import NpsSurvey from '../components/NpsSurvey'
import MiniNousShareProgram from '../components/MiniNousShareProgram'
import { useAuth } from '../context/AuthContext'

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function OrderStatusPage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
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

  useEffect(() => {
    load()
    const t = setInterval(load, order?.isPaid === false ? 5000 : 30000)
    return () => clearInterval(t)
  }, [load, order?.isPaid])

  const shipLabel = order?.deliveryDateLabel ?? null

  const showStudio = order?.isPaid && (order?.sourcePhotoUrl || order?.previewUrl || order?.workflowStatus === 'in_studio')
  const showGallery = order?.isPaid && (order?.sourcePhotoUrl || order?.validatedLineartUrl || order?.previewUrl)
  const showNps = order?.isPaid
    && ['approved', 'in_production', 'shipped'].includes(order?.workflowStatus)
    && !order?.npsSubmittedAt
  const showShare = order?.isPaid && order?.workflowStatus === 'shipped' && !order?.mininousShareUrl

  return (
    <CustomerLayout
      title={order ? 'Votre commande' : undefined}
      subtitle={order ? `${order.packLabel} · ${order.faceCount} figurine${order.faceCount > 1 ? 's' : ''}${order.amountEur ? ` · ${order.amountEur} €` : ''}` : undefined}
      navRight={(
        order?.isPaid && order?.editable ? (
          <Link
            to={`/studio?order=${encodeURIComponent(orderToken)}`}
            className="customer-link text-xs"
          >
            Studio →
          </Link>
        ) : (
          <span className="customer-muted text-xs">Suivi commande</span>
        )
      )}
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
                Votre photo est enregistrée. Finalisez le paiement pour lancer le studio.
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

          {showGallery && (
            <OrderCreationGallery
              sourcePhotoUrl={order.sourcePhotoUrl}
              validatedLineartUrl={order.validatedLineartUrl}
              previewUrl={order.previewUrl}
              lineartVersion={order.validatedLineartVersion ?? order.lineartVersion}
            />
          )}

          {showStudio && (
            <StudioCustomerFlow
              orderToken={orderToken}
              bearerToken={bearerToken}
              embedMode
              autoStart={!order.previewUrl && order.workflowStatus === 'in_studio'}
              onOrderChange={setOrder}
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
            <NpsSurvey
              orderToken={orderToken}
              submitted={!!order.npsSubmittedAt}
              initialScore={order.npsScore}
            />
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

          {!order.previewUrl && order.isPaid && order.editable && order.workflowStatus === 'awaiting_photo' && (
            <Link
              to={`/studio?order=${encodeURIComponent(orderToken)}&auto=1`}
              className="customer-btn-clay w-full text-center block"
            >
              Ouvrir le studio →
            </Link>
          )}

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
