import { useState, useEffect, useCallback } from 'react'
import AdminSettingsForm from '../components/AdminSettingsForm'
import { adminHeaders } from '../lib/adminAuth'

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    ...opts,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || res.statusText)
  return json
}

function formatDiscount(coupon) {
  if (!coupon) return '?'
  if (coupon.percent_off) return `${coupon.percent_off}%`
  if (coupon.amount_off) return `${(coupon.amount_off / 100).toFixed(2)} €`
  return '?'
}

function PromoCodesSection() {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [form, setForm] = useState({
    code: '',
    type: 'percent',
    percentOff: 100,
    amountOffEur: '',
    maxRedemptions: '',
    expiresAt: '',
  })

  const load = useCallback(async () => {
    try {
      const { codes: list } = await apiFetch('/api/promo-codes')
      setCodes(list)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setSuccess(null)
    try {
      const body = {
        code: form.code,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        expiresAt: form.expiresAt || undefined,
      }
      if (form.type === 'percent') {
        body.percentOff = Number(form.percentOff)
      } else {
        body.amountOffCents = Math.round(parseFloat(form.amountOffEur) * 100)
      }
      await apiFetch('/api/promo-codes', { method: 'POST', body: JSON.stringify(body) })
      setSuccess(`Code "${form.code.toUpperCase()}" créé.`)
      setForm(f => ({ ...f, code: '', maxRedemptions: '', expiresAt: '' }))
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeactivate(promoCodeId, code) {
    if (!confirm(`Désactiver le code "${code}" ?`)) return
    try {
      await apiFetch('/api/promo-codes', {
        method: 'DELETE',
        body: JSON.stringify({ promoCodeId }),
      })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">
        Codes promotionnels Stripe
      </h2>

      <form onSubmit={handleCreate} className="bg-stone-50 rounded-xl p-4 space-y-3 border border-stone-200">
        <p className="text-xs text-stone-500">Nouveau code</p>

        <div className="flex gap-2 flex-wrap">
          <input
            required
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="Ex : BETATEST"
            className="flex-1 min-w-[140px] border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono uppercase bg-white"
          />
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="percent">% de remise</option>
            <option value="amount">Montant fixe (€)</option>
          </select>
          {form.type === 'percent' ? (
            <input
              type="number" min="1" max="100" required
              value={form.percentOff}
              onChange={e => setForm(f => ({ ...f, percentOff: e.target.value }))}
              className="w-20 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white text-right"
            />
          ) : (
            <input
              type="number" min="0.01" step="0.01" required
              value={form.amountOffEur}
              onChange={e => setForm(f => ({ ...f, amountOffEur: e.target.value }))}
              placeholder="€"
              className="w-20 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white text-right"
            />
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            type="number" min="1"
            value={form.maxRedemptions}
            onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))}
            placeholder="Nb utilisations max (illimité)"
            className="flex-1 min-w-[180px] border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
          <input
            type="date"
            value={form.expiresAt}
            onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
            className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-emerald-600">{success}</p>}

        <button
          type="submit"
          disabled={creating}
          className="bg-[#C0684A] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#A85238] disabled:opacity-50"
        >
          {creating ? 'Création…' : 'Créer le code'}
        </button>
      </form>

      <div className="space-y-1">
        {loading && <p className="text-xs text-stone-400">Chargement…</p>}
        {!loading && codes.length === 0 && (
          <p className="text-xs text-stone-400">Aucun code promo actif.</p>
        )}
        {codes.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-4 bg-white border border-stone-200 rounded-lg px-4 py-2.5 text-sm">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-stone-800">{c.code}</span>
              <span className="text-[#C0684A] font-semibold">{formatDiscount(c.coupon)}</span>
              {!c.active && (
                <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">inactif</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-400">
              {c.times_redeemed != null && (
                <span>{c.times_redeemed} utilisé{c.times_redeemed > 1 ? 's' : ''}{c.max_redemptions ? `/${c.max_redemptions}` : ''}</span>
              )}
              {c.active && (
                <button
                  onClick={() => handleDeactivate(c.id, c.code)}
                  className="text-stone-400 hover:text-red-500 transition-colors"
                >
                  Désactiver
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-stone-500 mb-4">
          Prompts pipeline partagés (2K · 16:9). La référence line art est stockée sur R2.
        </p>
        <AdminSettingsForm />
      </div>

      <hr className="border-stone-200" />

      <PromoCodesSection />
    </div>
  )
}
