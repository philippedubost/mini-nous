const STATUS_STYLES = {
  idle: 'border-stone-700 bg-stone-900',
  running: 'border-amber-500 bg-stone-900',
  done: 'border-green-600 bg-stone-900',
  error: 'border-red-600 bg-stone-900',
}

const STATUS_BADGE = {
  idle: <span className="text-stone-500 text-xs">En attente</span>,
  running: (
    <span className="flex items-center gap-1 text-amber-400 text-xs">
      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      Génération…
    </span>
  ),
  done: <span className="text-green-400 text-xs">✓ Terminé</span>,
  error: <span className="text-red-400 text-xs">✗ Erreur</span>,
}

export default function Step({ number, label, status = 'idle', image, log, error }) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${STATUS_STYLES[status]}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-stone-800 border border-stone-600 flex items-center justify-center text-sm font-bold text-stone-300">
            {number}
          </span>
          <span className="font-medium text-stone-200">{label}</span>
        </div>
        {STATUS_BADGE[status]}
      </div>

      {log && status === 'running' && (
        <p className="text-xs text-stone-500 font-mono truncate">{log}</p>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {image && (
        <img
          src={image}
          alt={`résultat étape ${number}`}
          className="w-full rounded-lg object-contain max-h-72"
        />
      )}
    </div>
  )
}
