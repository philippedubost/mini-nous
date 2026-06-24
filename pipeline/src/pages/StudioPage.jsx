import { Navigate, useSearchParams } from 'react-router-dom'

export default function StudioPage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const stripeSessionId = searchParams.get('session_id')
  const autoStart = searchParams.get('auto') === '1'

  const params = new URLSearchParams()
  if (orderToken) params.set('order', orderToken)
  if (stripeSessionId) params.set('session_id', stripeSessionId)
  if (autoStart) params.set('auto', '1')

  const qs = params.toString()
  return <Navigate to={`/commande${qs ? `?${qs}` : ''}`} replace />
}
