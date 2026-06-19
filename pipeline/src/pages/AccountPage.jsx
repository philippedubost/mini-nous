import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchMyOrders } from '../lib/storage'
import CustomerLayout from '../components/CustomerLayout'

function formatShip(iso) {
  if (!iso) return null
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function AccountPage() {
  const { user, loading, signOut, accessToken } = useAuth()
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    setBusy(true)
    fetchMyOrders(accessToken)
      .then(({ orders: list }) => setOrders(list ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false))
  }, [accessToken])

  if (loading) {
    return (
      <CustomerLayout center>
        <p className="customer-muted text-sm">Chargement…</p>
      </CustomerLayout>
    )
  }

  if (!user) {
    return (
      <CustomerLayout center title="Mon compte"
        subtitle="Connectez-vous avec l'e-mail de votre commande pour retrouver toutes vos commandes.">
        <div className="w-full max-w-md space-y-4 text-center">
          <Link to="/compte/connexion" className="customer-btn-clay w-full">
            Connexion par e-mail
          </Link>
          <a href="/" className="customer-link block">← Boutique</a>
        </div>
      </CustomerLayout>
    )
  }

  return (
    <CustomerLayout
      title="Mon compte"
      subtitle={user.email}
      navRight={(
        <button type="button" onClick={signOut} className="customer-link text-xs bg-transparent border-0 cursor-pointer">
          Déconnexion
        </button>
      )}
    >
      <h2 className="text-lg font-semibold">Mes commandes</h2>

      {busy && <p className="customer-muted text-sm">Chargement…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      {!busy && !orders.length && !err && (
        <div className="customer-card-muted space-y-2">
          <p>Aucune commande liée à ce compte pour l&apos;instant.</p>
          <p>Elles apparaîtront automatiquement si l&apos;e-mail correspond à celui du paiement Stripe.</p>
        </div>
      )}

      <div className="space-y-4">
        {orders.map(o => (
          <div key={o.id} className="customer-card space-y-3">
            <div className="flex justify-between gap-4 items-start">
              <div>
                <p className="font-semibold text-[#2C1F14]">{o.packLabel}</p>
                <p className="text-sm customer-muted">
                  {o.faceCount} figurine{o.faceCount > 1 ? 's' : ''}
                  {o.amountEur ? ` · ${o.amountEur} €` : ''}
                </p>
              </div>
              <span className="customer-badge">{o.workflowLabel}</span>
            </div>
            {o.shipDate && (
              <p className="text-xs customer-muted">Livraison prévue {formatShip(o.shipDate)}</p>
            )}
            {o.previewUrl && (
              <img src={o.previewUrl} alt="" className="customer-preview max-h-44"/>
            )}
            <div className="flex flex-wrap gap-2">
              {o.accessToken && (
                <>
                  <Link
                    to={`/commande?order=${encodeURIComponent(o.accessToken)}`}
                    className="customer-btn-ghost"
                  >
                    Suivre
                  </Link>
                  {o.editable && (
                    <Link
                      to={`/studio?order=${encodeURIComponent(o.accessToken)}`}
                      className="customer-btn-clay !py-2 !px-4 !text-xs"
                    >
                      Studio
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <a href="/" className="customer-link block text-center pt-2">← Boutique</a>
    </CustomerLayout>
  )
}
