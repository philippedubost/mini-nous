import { useState, useEffect, useRef, useCallback } from 'react'
import { updatePaywallOrder } from '../lib/storage'

function CounterRow({ label, value, min, max, onChange, hint, disabled }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#2C1F14]">{label}</p>
        {hint && <p className="text-[11px] customer-muted mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          aria-label={`Moins ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
          className="customer-counter-btn"
        >
          −
        </button>
        <span className="text-lg font-bold text-[#2C1F14] min-w-[1.5rem] text-center">{value}</span>
        <button
          type="button"
          aria-label={`Plus ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
          className="customer-counter-btn"
        >
          +
        </button>
      </div>
    </div>
  )
}

export default function PaywallCompositionEditor({
  orderToken,
  faceCount,
  childCount = 0,
  maxFaces = 8,
  amountEur,
  onUpdated,
}) {
  const max = maxFaces
  const [localFaceCount, setLocalFaceCount] = useState(faceCount)
  const [localChildCount, setLocalChildCount] = useState(childCount)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    setLocalFaceCount(faceCount)
    setLocalChildCount(childCount)
  }, [faceCount, childCount])

  const total = Math.max(1, Math.min(max, Number(localFaceCount) || 1))
  const children = Math.max(0, Math.min(total, Number(localChildCount) || 0))
  const adults = total - children

  const persist = useCallback((nextFaceCount, nextChildCount) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setBusy(true)
      setError(null)
      try {
        const { order } = await updatePaywallOrder(orderToken, {
          faceCount: nextFaceCount,
          childCount: nextChildCount,
        })
        onUpdated?.(order)
      } catch (e) {
        setError(e.message)
      } finally {
        setBusy(false)
      }
    }, 350)
  }, [orderToken, onUpdated])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const setAdults = (na) => {
    const nextAdults = Math.max(0, Math.min(max - children, na))
    const fc = Math.max(1, nextAdults + children)
    setLocalFaceCount(fc)
    persist(fc, children)
  }

  const setChildren = (nc) => {
    const nextChildren = Math.max(0, Math.min(max - adults, nc))
    const fc = Math.max(1, adults + nextChildren)
    setLocalFaceCount(fc)
    setLocalChildCount(nextChildren)
    persist(fc, nextChildren)
  }

  return (
    <div className="customer-card-muted !p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-[#2C1F14]">Composition de la commande</p>
        <p className="text-xs customer-muted mt-1">
          Ajustez le nombre de figurines avant de payer.
        </p>
      </div>

      <CounterRow
        label="Adultes"
        value={adults}
        min={children === 0 ? 1 : 0}
        max={max - children}
        onChange={setAdults}
        disabled={busy}
      />
      <CounterRow
        label="Enfants"
        value={children}
        min={0}
        max={max - adults}
        hint="Moins de 12 ans"
        onChange={setChildren}
        disabled={busy}
      />

      <div className="flex justify-between items-center gap-3 pt-2 px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8DCC8]">
        <span className="text-xs customer-muted">Total figurines</span>
        <span className="text-lg font-bold text-[#C0684A]">{total}</span>
      </div>

      {amountEur != null && (
        <p className="text-xs customer-muted text-center">
          Montant actuel : <strong className="text-[#2C1F14]">{amountEur} €</strong>
          {busy ? ' · mise à jour…' : ''}
        </p>
      )}

      {error && (
        <p className="text-xs text-[#8A4030] text-center">{error}</p>
      )}
    </div>
  )
}
