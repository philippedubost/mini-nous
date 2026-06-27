import { useCallback, useEffect, useState } from 'react'

const VARIANTS = {
  default: 'bg-stone-800 text-stone-200 hover:bg-stone-700',
  primary: 'bg-amber-700 hover:bg-amber-600 text-white',
  danger: 'bg-red-900/70 text-red-100 hover:bg-red-800/70 border border-red-700/60',
  ghost: 'bg-transparent text-stone-500 hover:text-stone-200 hover:bg-stone-800/60',
  success: 'bg-emerald-700 hover:bg-emerald-600 text-white',
  muted: 'bg-stone-700 hover:bg-stone-600 text-stone-200',
  toolbar: 'bg-stone-800 text-stone-100 hover:bg-stone-700 border border-stone-600 hover:border-stone-500 shadow-sm hover:shadow-md',
}

export function ServerBtn({
  type = 'button',
  className = '',
  variant = 'default',
  children,
  onClick,
  disabled,
  ...rest
}) {
  const [acked, setAcked] = useState(false)

  const handleClick = useCallback((e) => {
    if (disabled) return
    setAcked(true)
    window.setTimeout(() => setAcked(false), 220)
    onClick?.(e)
  }, [disabled, onClick])

  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        'server-btn rounded-lg font-semibold transition-all duration-150',
        'active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant] ?? VARIANTS.default,
        acked ? 'server-btn--acked' : '',
        className,
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ServerConfirmModal({
  open,
  title,
  children,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-[2px]"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-confirm-title"
        className="server-confirm-modal w-full max-w-sm rounded-xl border border-stone-700 bg-stone-900 shadow-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="server-confirm-title" className="text-base font-semibold text-stone-100">
          {title}
        </h3>
        <div className="text-sm text-stone-400 leading-relaxed">{children}</div>
        <div className="flex flex-wrap gap-2 justify-end pt-1">
          <ServerBtn
            variant="ghost"
            className="px-4 py-2 text-sm"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </ServerBtn>
          <ServerBtn
            variant={danger ? 'danger' : 'primary'}
            className="px-4 py-2 text-sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? '…' : confirmLabel}
          </ServerBtn>
        </div>
      </div>
    </div>
  )
}
