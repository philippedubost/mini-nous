import { Link } from 'react-router-dom'

const MOTOR_BADGE = {
  needsQueue: 'bg-amber-900/50 text-amber-200 border-amber-700',
  needsTick: 'bg-sky-900/50 text-sky-200 border-sky-700',
  error: 'bg-red-900/50 text-red-200 border-red-700',
}

export function ServerOrderCard({ order, busy, onRetry }) {
  const title = order.customerName?.trim() || order.email?.split('@')[0] || 'Commande'
  const motorCls = order.canRetry
    ? MOTOR_BADGE.error
    : order.needsTick
      ? MOTOR_BADGE.needsTick
      : order.needsQueue
        ? MOTOR_BADGE.needsQueue
        : null

  return (
    <article
      className={`rounded-xl border bg-stone-900/80 p-2.5 space-y-2 transition-colors ${
        busy ? 'border-sky-500/60 ring-1 ring-sky-500/30' : 'border-stone-700/80 hover:border-stone-600'
      }`}
    >
      <Link to={`/c/${order.orderId}`} className="flex gap-2 group">
        <div className="w-10 h-10 rounded-md bg-white shrink-0 overflow-hidden flex items-center justify-center border border-stone-700">
          {order.thumbUrl
            ? <img src={order.thumbUrl} alt="" className="w-full h-full object-cover" />
            : <span className="text-[9px] text-stone-400 text-center leading-tight px-0.5">photo</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-stone-100 truncate group-hover:text-sky-300">{title}</p>
          <p className="text-[10px] text-stone-500 font-mono truncate">{order.orderId.slice(0, 8)}…</p>
          <p className="text-[10px] text-stone-400">
            {order.packLabel ?? '—'} · {order.faceCount} pers.
          </p>
        </div>
      </Link>

      {motorCls && (
        <p className={`text-[10px] font-medium px-2 py-0.5 rounded border ${motorCls}`}>
          {order.canRetry ? 'Erreur — relancer' : order.needsQueue ? 'À lancer' : 'En cours FAL…'}
        </p>
      )}

      {order.studioJob?.error && (
        <p className="text-[10px] text-red-400 line-clamp-2" title={order.studioJob.error}>
          {order.studioJob.error}
        </p>
      )}

      {order.canRetry && (
        <button
          type="button"
          onClick={() => onRetry?.(order)}
          className="text-[10px] text-red-300 hover:text-red-200 underline"
        >
          Relancer
        </button>
      )}
    </article>
  )
}

export function ServerKanbanColumn({ col, orders, busyOrderId, onRetry }) {
  return (
    <div className="flex flex-col min-w-[200px] max-w-[220px] flex-1 rounded-xl border border-stone-800 bg-stone-900/40">
      <div className="px-3 py-2 border-b border-stone-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-stone-200 leading-tight">{col.label}</p>
          <span className="text-xs font-bold text-stone-500 tabular-nums">{orders.length}</span>
        </div>
        <p className="text-[10px] text-stone-600 mt-0.5 leading-snug">{col.hint}</p>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-340px)] min-h-[100px]">
        {orders.length === 0
          ? <p className="text-[10px] text-stone-600 text-center py-4">—</p>
          : orders.map(o => (
            <ServerOrderCard
              key={o.orderId}
              order={o}
              busy={busyOrderId === o.orderId}
              onRetry={onRetry}
            />
          ))}
      </div>
    </div>
  )
}
