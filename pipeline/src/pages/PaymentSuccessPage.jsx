import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchOrderByToken } from '../lib/storage'

export default function PaymentSuccessPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const [order, setOrder] = useState(null)
  const [waiting, setWaiting] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orderToken) {
      setWaiting(false)
      setError('Lien incomplet — reprenez depuis la boutique.')
      return
    }

    let cancelled = false
    let attempts = 0

    const poll = async () => {
      try {
        const { order: o } = await fetchOrderByToken(orderToken)
        if (!cancelled) {
          setOrder(o)
          setWaiting(false)
        }
      } catch {
        attempts += 1
        if (cancelled) return
        if (attempts < 20) {
          setTimeout(poll, 2000)
        } else {
          setWaiting(false)
          setError('La confirmation prend plus de temps que prévu. Actualisez dans un instant ou contactez-nous.')
        }
      }
    }

    poll()
    return () => { cancelled = true }
  }, [orderToken, navigate])

  useEffect(() => {
    if (order?.isPaid && orderToken) {
      navigate(`/commande?order=${encodeURIComponent(orderToken)}&auto=1`, { replace: true })
    }
  }, [order, orderToken, navigate])

  const shipLabel = order?.deliveryDateLabel ?? null

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-stone-800 bg-stone-900/80 p-8 text-center space-y-5">
        <div className="text-5xl">{waiting ? '⏳' : '✨'}</div>
        <h1 className="text-2xl font-bold text-stone-100">
          {waiting ? 'Confirmation du paiement…' : 'Merci, c\'est payé !'}
        </h1>

        {waiting && (
          <p className="text-stone-400 text-sm leading-relaxed">
            Stripe valide votre commande — quelques secondes en général.
          </p>
        )}

        {!waiting && order && (
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-4 text-sm text-emerald-100 space-y-1">
            <p><strong>{order.packLabel || order.packType}</strong> · {order.faceCount} personnage{order.faceCount > 1 ? 's' : ''}</p>
            {shipLabel && <p>Réception prévue {shipLabel}</p>}
          </div>
        )}

        {error && (
          <p className="text-amber-300 text-sm">{error}</p>
        )}

        {!waiting && orderToken && !error && (
          <div className="space-y-3 w-full">
            <Link
              to={`/commande?order=${encodeURIComponent(orderToken)}&auto=1`}
              className="inline-block w-full py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors"
            >
              Voir ma commande →
            </Link>
            <p className="text-xs text-stone-500 leading-relaxed">
              Un e-mail de confirmation avec votre lien personnel vous sera envoyé si ce n&apos;est pas déjà fait.
            </p>
          </div>
        )}

        <a href="/" className="block text-sm text-stone-500 hover:text-stone-300">
          ← Retour à la boutique
        </a>
      </div>
    </div>
  )
}
