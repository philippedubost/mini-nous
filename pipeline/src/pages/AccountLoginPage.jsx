import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import CustomerLayout from '../components/CustomerLayout'

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
    <CustomerLayout center>
      <div className="w-full max-w-md customer-card space-y-6">
        <div>
          <Link to="/compte" className="customer-link text-xs">← Mon compte</Link>
          <h1 className="text-2xl font-bold mt-2">Connexion</h1>
          <p className="customer-muted text-sm mt-2 leading-relaxed">
            Entrez l&apos;e-mail utilisé lors du paiement — nous vous envoyons un lien magique, sans mot de passe.
          </p>
        </div>

        {sent ? (
          <div className="customer-alert-ok">
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
              className="customer-input"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="customer-btn-clay w-full">
              {busy ? 'Envoi…' : 'Recevoir mon lien'}
            </button>
          </form>
        )}

        <a href="/" className="customer-link block text-center">← Boutique</a>
      </div>
    </CustomerLayout>
  )
}
