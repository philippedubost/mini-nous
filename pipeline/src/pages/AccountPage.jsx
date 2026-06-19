import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchMyOrders } from '../lib/storage'

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
      <div className="min-h-screen bg-stone-950 flex items-center justify-center text-stone-400">
        Chargement…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-2xl font-bold text-stone-100">Mon compte</h1>
          <p className="text-stone-400 text-sm leading-relaxed">
            Connectez-vous avec l&apos;e-mail de votre commande pour retrouver toutes vos commandes.
          </p>
          <Link
            to="/compte/connexion"
            className="inline-block w-full py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950"
          >
            Connexion par e-mail
          </Link>
          <a href="/" className="block text-sm text-stone-500 hover:text-stone-300">← Boutique</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 px-6 py-4 max-w-3xl mx-auto flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">Mon compte</h1>
          <p className="text-xs text-stone-500">{user.email}</p>
        </div>
        <button type="button" onClick={signOut} className="text-xs text-stone-500 hover:text-stone-300">
          Déconnexion
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h2 className="text-lg font-semibold">Mes commandes</h2>

        {busy && <p className="text-stone-500 text-sm">Chargement…</p>}
        {err && <p className="text-red-400 text-sm">{err}</p>}

        {!busy && !orders.length && !err && (
          <div className="rounded-xl border border-stone-800 p-6 text-sm text-stone-400 space-y-3">
            <p>Aucune commande liée à ce compte pour l&apos;instant.</p>
            <p>Elles apparaîtront automatiquement si l&apos;e-mail correspond à celui du paiement Stripe.</p>
          </div>
        )}

        <div className="space-y-4">
          {orders.map(o => (
            <div key={o.id} className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5 space-y-3">
              <div className="flex justify-between gap-4 items-start">
                <div>
                  <p className="font-semibold">{o.packLabel}</p>
                  <p className="text-sm text-stone-500">
                    {o.faceCount} figurine{o.faceCount > 1 ? 's' : ''}
                    {o.amountEur ? ` · ${o.amountEur} €` : ''}
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-950/50 text-amber-200 border border-amber-800/40">
                  {o.workflowLabel}
                </span>
              </div>
              {o.shipDate && (
                <p className="text-xs text-stone-500">Livraison prévue {formatShip(o.shipDate)}</p>
              )}
              {o.previewUrl && (
                <img src={o.previewUrl} alt="" className="w-full max-h-40 object-contain rounded-lg bg-stone-900"/>
              )}
              <div className="flex flex-wrap gap-2">
                {o.accessToken && (
                  <>
                    <Link
                      to={`/commande?order=${encodeURIComponent(o.accessToken)}`}
                      className="text-xs px-3 py-2 rounded-lg border border-stone-700 hover:border-stone-500"
                    >
                      Suivre
                    </Link>
                    {o.editable && (
                      <Link
                        to={`/studio?order=${encodeURIComponent(o.accessToken)}`}
                        className="text-xs px-3 py-2 rounded-lg bg-amber-500 text-stone-950 font-semibold hover:bg-amber-400"
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

        <a href="/" className="block text-center text-sm text-stone-600 hover:text-stone-400 pt-4">← Boutique</a>
      </main>
    </div>
  )
}
