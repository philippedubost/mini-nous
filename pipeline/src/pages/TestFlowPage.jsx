import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CustomerLayout from '../components/CustomerLayout'
import {
  adminHeaders,
  checkAdminPassword,
  isAdminAuthed,
  setAdminAuthed,
} from '../lib/adminAuth'

const DEFAULTS = {
  email: 'pdubost@gmail.com',
  customerName: 'Jean-Test',
  faceCount: 2,
  childCount: 0,
}

async function testFlowApi(body) {
  const res = await fetch('/api/test-flow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

function StepLog({ steps }) {
  if (!steps.length) return null
  return (
    <ol className="text-xs space-y-1.5 customer-card-muted !p-4 max-h-64 overflow-y-auto">
      {steps.map((s, i) => (
        <li key={i} className={s.ok ? 'text-[#4A8A52]' : s.pending ? 'text-[#C0684A]' : 'text-[#8A4030]'}>
          {s.ok ? '✓' : s.pending ? '…' : '✗'} {s.label}
          {s.detail && <span className="customer-muted"> — {s.detail}</span>}
        </li>
      ))}
    </ol>
  )
}

export default function TestFlowPage() {
  const [searchParams] = useSearchParams()
  const [authed, setAuthed] = useState(isAdminAuthed)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [steps, setSteps] = useState([])
  const [result, setResult] = useState(null)
  const resumed = useRef(false)

  const log = useCallback((label, { ok = true, pending = false, detail } = {}) => {
    setSteps(prev => [...prev, { label, ok, pending, detail }])
  }, [])

  const runAfterPayment = useCallback(async (accessToken) => {
    log('Tracé placeholder (sans FAL)', { pending: true })
    const data = await testFlowApi({ action: 'run_after_payment', accessToken })
    log('Tracé placeholder (sans FAL)')
    log('Validation client')
    log('Admin → prêt à fabriquer')
    log('Admin → fabrication terminée')
    log('Admin → expédié')
    setResult(data)
    return data
  }, [log])

  const continueFromStripe = useCallback(async (accessToken, sessionId) => {
    setBusy(true)
    setError(null)
    try {
      log('Confirmation paiement Stripe')
      const confirm = await testFlowApi({ action: 'confirm_payment', accessToken, sessionId })
      if (!confirm.paid) throw new Error(`Paiement non confirmé (${confirm.paymentStatus})`)
      await runAfterPayment(accessToken)
    } catch (e) {
      setError(e.message)
      log(e.message, { ok: false })
    } finally {
      setBusy(false)
    }
  }, [log, runAfterPayment])

  useEffect(() => {
    if (resumed.current) return
    const sessionId = searchParams.get('session_id')
    const orderToken = searchParams.get('order')
    if (!sessionId || !orderToken || !isAdminAuthed()) return
    resumed.current = true
    setSteps([{ label: 'Retour Stripe — reprise automatique', ok: true }])
    continueFromStripe(orderToken, sessionId)
  }, [searchParams, continueFromStripe])

  const startFullFlow = async () => {
    setBusy(true)
    setError(null)
    setSteps([])
    setResult(null)
    try {
      const data = await testFlowApi({
        action: 'full_start',
        ...DEFAULTS,
      })
      log('Création brouillon + photo placeholder (duo.webp)')
      log('Session Stripe Checkout (mode test)')
      log(`Commande ${data.accessToken?.slice(0, 8)}…`)
      sessionStorage.setItem('mn_test_flow_token', data.accessToken)
      log('Redirection Stripe — carte 4242 4242 4242 4242 · 08/27 · 123', { pending: true })
      window.location.href = data.checkoutUrl
    } catch (e) {
      setError(e.message)
      log(e.message, { ok: false })
      setBusy(false)
    }
  }

  const login = (e) => {
    e.preventDefault()
    if (!checkAdminPassword(password)) {
      setError('Mot de passe admin incorrect')
      return
    }
    setAdminAuthed()
    setAuthed(true)
    setError(null)
  }

  if (!authed) {
    return (
      <CustomerLayout title="Test E2E" subtitle="Accès admin requis">
        <form onSubmit={login} className="customer-card space-y-3 max-w-sm mx-auto">
          <p className="text-sm customer-muted">Page réservée aux tests (Stripe test + parcours complet).</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mot de passe admin"
            className="customer-input w-full"
          />
          {error && <p className="text-xs text-[#8A4030]">{error}</p>}
          <button type="submit" className="customer-btn-clay w-full">Accéder</button>
        </form>
      </CustomerLayout>
    )
  }

  return (
    <CustomerLayout
      title="Test E2E MiniNous"
      subtitle="Upload placeholder → Stripe test → tracé → validation → expédition"
      navRight={<Link to="/admin" className="customer-link text-xs">Admin →</Link>}
    >
      <div className="space-y-4 max-w-lg mx-auto">
        <div className="customer-card-muted !p-4 text-sm space-y-2">
          <p><strong>Client :</strong> {DEFAULTS.customerName} · {DEFAULTS.email}</p>
          <p><strong>Figurines :</strong> {DEFAULTS.faceCount} (photo <code className="text-xs">duo.webp</code>)</p>
          <p><strong>Stripe test :</strong> 4242 4242 4242 4242 · 08/27 · 123</p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={startFullFlow}
          className="customer-btn-clay w-full"
        >
          {busy ? 'En cours…' : 'Lancer le test complet →'}
        </button>

        <StepLog steps={steps} />

        {error && <div className="customer-alert-warn">{error}</div>}

        {result?.order && (
          <div className="customer-alert-ok space-y-2 text-sm">
            <p>Parcours terminé — statut <strong>{result.order.workflowLabel}</strong></p>
            <Link
              to={`/commande?order=${encodeURIComponent(result.accessToken)}`}
              className="customer-link block"
            >
              Voir la commande →
            </Link>
          </div>
        )}

        <p className="text-xs customer-muted text-center leading-relaxed">
          Actif en dev / preview ou avec <code>ENABLE_TEST_FLOW=1</code>.
          Le tracé est simulé (pas d&apos;appel FAL). Stripe doit être en mode test.
        </p>
      </div>
    </CustomerLayout>
  )
}
