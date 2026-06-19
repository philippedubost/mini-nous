import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CustomerLayout from '../components/CustomerLayout'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setError('Auth non configurée')
      return
    }

    let cancelled = false

    async function finish() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeErr && !cancelled) {
          setError(exchangeErr.message)
          return
        }
      }

      const { data, error: sessionErr } = await supabase.auth.getSession()
      if (cancelled) return

      if (sessionErr) {
        setError(sessionErr.message)
        return
      }
      if (data.session) {
        navigate('/compte', { replace: true })
        return
      }
      setError('Session introuvable — réessayez depuis le lien reçu par e-mail.')
    }

    finish()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <CustomerLayout center>
      <div className="text-center space-y-4 max-w-sm">
        {!error ? (
          <p className="customer-muted">Connexion en cours…</p>
        ) : (
          <>
            <p className="customer-alert-warn">{error}</p>
            <Link to="/compte/connexion" className="customer-link">
              Réessayer →
            </Link>
          </>
        )}
      </div>
    </CustomerLayout>
  )
}
