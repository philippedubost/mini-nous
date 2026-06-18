export function SpinnerIcon({ className = 'w-4 h-4' }) {
  return (
    <span
      className={`inline-block shrink-0 border-2 border-current/25 border-t-current rounded-full animate-spin ${className}`}
      aria-hidden
    />
  )
}

/** Indicateur fixe — n'empêche pas le scroll ni la navigation. */
export default function BatchBuildIndicator({ label }) {
  if (!label) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-amber-500/35 bg-stone-950/95 px-4 py-3 shadow-2xl backdrop-blur-sm max-w-sm pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <span
        className="w-5 h-5 shrink-0 border-2 border-amber-600/30 border-t-amber-400 rounded-full animate-spin"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-100 truncate">{label}</p>
        <p className="text-xs text-stone-500">Assemblage SVG en cours…</p>
      </div>
    </div>
  )
}

/** Laisse React peindre le loader avant un appel API long. */
export function yieldToUi() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}
