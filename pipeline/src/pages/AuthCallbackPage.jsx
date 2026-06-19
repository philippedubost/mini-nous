import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        {!error ? (
          <p className="text-stone-400">Connexion en cours…</p>
        ) : (
          <>
            <p className="text-amber-300 text-sm max-w-sm">{error}</p>
            <Link to="/compte/connexion" className="text-amber-400 hover:text-amber-300 text-sm">
              Réessayer →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
