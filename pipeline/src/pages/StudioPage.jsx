import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import StudioCustomerFlow from '../components/StudioCustomerFlow'
import CustomerLayout from '../components/CustomerLayout'
import { useAuth } from '../context/AuthContext'

export default function StudioPage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const stripeSessionId = searchParams.get('session_id')
  const autoStart = searchParams.get('auto') === '1'
  const { accessToken: bearerToken } = useAuth()
  const [order, setOrder] = useState(null)

  const shipLabel = order?.shipDate
    ? new Date(`${order.shipDate}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    : null

  return (
    <CustomerLayout
      title="Studio MiniNous"
      subtitle="Tracé atelier · validation avant impression"
      navRight={(
        <Link
          to={orderToken ? `/commande?order=${encodeURIComponent(orderToken)}` : '/compte'}
          className="customer-link text-xs"
        >
          Ma commande
        </Link>
      )}
    >
      {order && (
        <div className="customer-card space-y-1 text-sm">
          <p className="font-semibold text-[#2C1F14]">
            {order.packLabel} · {order.faceCount} figurine{order.faceCount > 1 ? 's' : ''}
          </p>
          <p className="customer-muted">{order.isPaid ? order.workflowLabel : 'En attente de paiement'}</p>
          {shipLabel && <p className="customer-muted text-xs">Livraison {shipLabel}</p>}
        </div>
      )}

      <StudioCustomerFlow
        orderToken={orderToken}
        bearerToken={bearerToken}
        autoStart={autoStart}
        stripeSessionId={stripeSessionId}
        onOrderChange={setOrder}
      />
    </CustomerLayout>
  )
}
