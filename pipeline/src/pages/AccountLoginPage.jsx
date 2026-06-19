import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AccountLoginPage() {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signInWithEmail(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-stone-800 bg-stone-900/80 p-8 space-y-6">
        <div>
          <Link to="/compte" className="text-xs text-stone-500 hover:text-stone-300">← Mon compte</Link>
          <h1 className="text-2xl font-bold text-stone-100 mt-2">Connexion</h1>
          <p className="text-sm text-stone-400 mt-2 leading-relaxed">
            Entrez l&apos;e-mail utilisé lors du paiement — nous vous envoyons un lien magique, sans mot de passe.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-4 text-sm text-emerald-100">
            Lien envoyé à <strong>{email}</strong>. Vérifiez votre boîte mail (et les spams).
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email"
              required
              placeholder="vous@exemple.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-stone-950 border border-stone-700 text-stone-100 placeholder:text-stone-600 focus:border-amber-500 outline-none"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Envoi…' : 'Recevoir mon lien'}
            </button>
          </form>
        )}

        <a href="/" className="block text-center text-sm text-stone-500 hover:text-stone-300">← Boutique</a>
      </div>
    </div>
  )
}
