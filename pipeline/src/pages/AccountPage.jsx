import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createAdminOrder, fetchMyOrders } from '../lib/storage'
import CustomerLayout from '../components/CustomerLayout'

function formatShip(iso) {
  if (!iso) return null
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function AccountPage() {
  const navigate = useNavigate()
  const { user, loading, signOut, accessToken } = useAuth()
  const [orders, setOrders] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [creatingId, setCreatingId] = useState(null)

  const loadOrders = () => {
    if (!accessToken) return
    setBusy(true)
    fetchMyOrders(accessToken)
      .then(({ orders: list, user: me }) => {
        setOrders(list ?? [])
        setIsAdmin(!!me?.isAdmin)
      })
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false))
  }

  useEffect(() => {
    loadOrders()
  }, [accessToken])

  const handleNewOrder = async (fromOrder) => {
    if (!accessToken) return
    setCreatingId(fromOrder?.id ?? 'new')
    setErr(null)
    try {
      const { accessToken: token } = await createAdminOrder(accessToken, {
        faceCount: fromOrder?.faceCount,
        fromOrderId: fromOrder?.id,
      })
      navigate(`/commande?order=${encodeURIComponent(token)}`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setCreatingId(null)
    }
  }

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
        <div className="flex items-center gap-3">
          {isAdmin && (
            <a href="/admin" className="customer-badge customer-badge-green text-[10px]">
              Admin
            </a>
          )}
          <button type="button" onClick={signOut} className="customer-link text-xs bg-transparent border-0 cursor-pointer">
            Déconnexion
          </button>
        </div>
      )}
    >
      {isAdmin && (
        <div className="customer-card-muted flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#2C1F14]">
            Mode admin — créez un MiniNous depuis une photo (studio), régénérations illimitées.
          </p>
          <button
            type="button"
            disabled={creatingId === 'new'}
            onClick={() => handleNewOrder(null)}
            className="customer-btn-clay !py-2 !px-4 !text-xs"
          >
            {creatingId === 'new' ? 'Ouverture…' : '+ Nouveau MiniNous'}
          </button>
        </div>
      )}

      <h2 className="text-lg font-semibold">{isAdmin ? 'Toutes les commandes' : 'Mes commandes'}</h2>

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
                  {o.email && isAdmin ? ` · ${o.email}` : ''}
                </p>
              </div>
              <span className="customer-badge">{o.workflowLabel}</span>
            </div>
            {(o.deliveryDateLabel || o.shipDate) && (
              <p className="text-xs customer-muted">
                Livraison prévue {o.deliveryDateLabel || formatShip(o.shipDate)}
              </p>
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
                  {(isAdmin || o.editable) && (
                    <Link
                      to={`/commande?order=${encodeURIComponent(o.accessToken)}`}
                      className="customer-btn-clay !py-2 !px-4 !text-xs"
                    >
                      Studio
                    </Link>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={creatingId === o.id}
                      onClick={() => handleNewOrder(o)}
                      className="customer-btn-ghost"
                    >
                      {creatingId === o.id ? 'Ouverture…' : 'Nouveau MiniNous'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-4 pt-2">
        <a href="/" className="customer-link">← Boutique</a>
        {isAdmin && <a href="/admin" className="customer-link">Admin →</a>}
      </div>
    </CustomerLayout>
  )
}
