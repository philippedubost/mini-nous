import { Navigate, useSearchParams } from 'react-router-dom'

/** Ancienne route — tout le flux client vit sur /commande. */
export default function StudioPage() {
  const [searchParams] = useSearchParams()
  const qs = searchParams.toString()
  return <Navigate to={qs ? `/commande?${qs}` : '/compte'} replace />
}
