import { useEffect, useState } from 'react'
import { updateOrderShipping } from '../lib/storage'

const EMPTY = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  postalCode: '',
  country: 'FR',
  phone: '',
}

export default function ShippingAddressEditor({
  orderToken,
  bearerToken,
  shippingAddress,
  onUpdated,
  disabled = false,
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (shippingAddress) {
      setForm({
        name: shippingAddress.name ?? '',
        line1: shippingAddress.line1 ?? '',
        line2: shippingAddress.line2 ?? '',
        city: shippingAddress.city ?? '',
        postalCode: shippingAddress.postalCode ?? '',
        country: shippingAddress.country ?? 'FR',
        phone: shippingAddress.phone ?? '',
      })
    }
  }, [shippingAddress])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const { order } = await updateOrderShipping(orderToken, form, bearerToken)
      onUpdated?.(order)
      setEditing(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!shippingAddress && !editing) return null

  if (!editing) {
    return (
      <div className="customer-card-muted !p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold text-[#2C1F14]">Adresse de livraison</p>
          {!disabled && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs customer-link shrink-0"
            >
              Modifier
            </button>
          )}
        </div>
        <p className="text-xs text-[#2C1F14] leading-relaxed">
          {form.name && <>{form.name}<br /></>}
          {form.line1}
          {form.line2 ? `, ${form.line2}` : ''}
          <br />
          {form.postalCode} {form.city}
          {' · '}{form.country}
          {form.phone && <><br />{form.phone}</>}
        </p>
      </div>
    )
  }

  return (
    <div className="customer-card-muted !p-4 space-y-3">
      <p className="text-xs font-semibold text-[#2C1F14]">Modifier l&apos;adresse de livraison</p>
      <label className="block">
        <span className="text-[10px] customer-muted">Nom complet</span>
        <input className="customer-input text-sm mt-1 w-full" value={form.name} onChange={e => set('name', e.target.value)} />
      </label>
      <label className="block">
        <span className="text-[10px] customer-muted">Adresse</span>
        <input className="customer-input text-sm mt-1 w-full" value={form.line1} onChange={e => set('line1', e.target.value)} required />
      </label>
      <label className="block">
        <span className="text-[10px] customer-muted">Complément (optionnel)</span>
        <input className="customer-input text-sm mt-1 w-full" value={form.line2} onChange={e => set('line2', e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] customer-muted">Code postal</span>
          <input className="customer-input text-sm mt-1 w-full" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-[10px] customer-muted">Ville</span>
          <input className="customer-input text-sm mt-1 w-full" value={form.city} onChange={e => set('city', e.target.value)} required />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] customer-muted">Pays (code ISO, ex. FR)</span>
        <input className="customer-input text-sm mt-1 w-full" value={form.country} onChange={e => set('country', e.target.value.toUpperCase())} maxLength={2} />
      </label>
      <label className="block">
        <span className="text-[10px] customer-muted">Téléphone (optionnel)</span>
        <input className="customer-input text-sm mt-1 w-full" value={form.phone} onChange={e => set('phone', e.target.value)} />
      </label>
      {error && <p className="text-xs text-[#8A4030]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="customer-btn-clay flex-1 text-sm">
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { setEditing(false); setError(null) }}
          className="customer-btn-ghost text-sm"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
