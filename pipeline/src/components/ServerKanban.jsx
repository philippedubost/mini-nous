import { useNavigate } from 'react-router-dom'
import { ServerBtn } from './ServerUi'
import {
  contextActionsForColumn,
  truncateDisplayName,
  faceLabel,
  adminOrderDetailUrl,
  clientOrderUrl,
  formatErrorLogAt,
} from '../lib/serverKanbanActions'

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
      <path d="M10 4.5c-3.2 0-5.9 2.1-7 5 1.1 2.9 3.8 5 7 5s5.9-2.1 7-5c-1.1-2.9-3.8-5-7-5zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm0-1.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" />
    </svg>
  )
}

function ErrorLogPanel({ order }) {
  const log = order.errorLog?.length ? order.errorLog : (
    order.studioJob?.error
      ? [{ at: order.studioJob.updatedAt, step: order.studioJob.phase, message: order.studioJob.error }]
      : order.generationError
        ? [{ at: order.updatedAt, message: order.generationError, source: 'generation' }]
        : []
  )
  if (!log.length) return null

  const latest = log[log.length - 1]

  return (
    <details
      className="rounded border border-red-900/50 bg-red-950/20"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <summary className="text-[10px] text-red-300 cursor-pointer px-2 py-1 list-none flex items-center justify-between gap-1">
        <span className="line-clamp-1 min-w-0" title={latest.message}>{latest.message}</span>
        {log.length > 1 && (
          <span className="shrink-0 text-red-400/80 tabular-nums">{log.length} entrées</span>
        )}
      </summary>
      <ul className="px-2 pb-2 space-y-1.5 max-h-28 overflow-y-auto border-t border-red-900/40">
        {[...log].reverse().map((entry, i) => (
          <li key={`${entry.at}-${i}`} className="text-[9px] text-red-200/90 border-l border-red-800 pl-2">
            <p className="text-stone-500">
              {formatErrorLogAt(entry.at)}
              {entry.step ? ` · ${entry.step}` : ''}
              {entry.source ? ` · ${entry.source}` : ''}
            </p>
            <p className="break-words leading-snug">{entry.message}</p>
          </li>
        ))}
      </ul>
    </details>
  )
}

const MOTOR_BADGE = {
  needsQueue: 'bg-amber-900/50 text-amber-200 border-amber-700',
  needsTick: 'bg-sky-900/50 text-sky-200 border-sky-700',
  error: 'bg-red-900/50 text-red-200 border-red-700',
}

export function ServerContextMenu({ menu, onAction, onClose }) {
  if (!menu) return null

  const handleAction = (a) => {
    if (a.id === 'open_admin') {
      const url = adminOrderDetailUrl(menu.order)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      onClose()
      return
    }
    if (a.id === 'open_client') {
      const url = clientOrderUrl(menu.order)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      onClose()
      return
    }
    onAction(a.id, menu.orderIds)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-50 min-w-[180px] rounded-lg border border-stone-700 bg-stone-900 shadow-xl py-1 text-sm"
        style={{ left: menu.x, top: menu.y }}
      >
        {menu.actions.map(a => (
          <ServerBtn
            key={a.id}
            variant="ghost"
            className={`w-full text-left px-3 py-2 rounded-none !font-normal text-sm justify-start ${
              a.danger ? '!text-red-300 hover:!bg-red-950/40' : '!text-stone-200'
            }`}
            onClick={() => handleAction(a)}
          >
            {a.label}
          </ServerBtn>
        ))}
      </div>
    </>
  )
}

function ServerOrderCard({
  order,
  busy,
  selected,
  onSelect,
  onContextMenu,
  onOpen,
}) {
  const title = truncateDisplayName(order.email, 22)
  const adminUrl = adminOrderDetailUrl(order)
  const clientUrl = clientOrderUrl(order)
  const isLaserMotor = order.column === 'validated_fabrication' && !order.hasLaserSvg
  const motorCls = order.hasFalError || order.canRetry
    ? MOTOR_BADGE.error
    : order.needsTick
      ? MOTOR_BADGE.needsTick
      : order.needsQueue
        ? MOTOR_BADGE.needsQueue
        : null
  const motorLabel = order.hasFalError || order.canRetry
    ? (isLaserMotor ? 'Erreur laser' : 'Erreur FAL')
    : order.needsQueue
      ? (isLaserMotor ? 'SVG à générer' : 'À lancer')
      : (isLaserMotor ? 'Laser…' : 'FAL…')

  return (
    <article
      data-order-card={order.orderId}
      onContextMenu={e => onContextMenu(e, order)}
      onClick={e => {
        e.preventDefault()
        onSelect(order.orderId, e.shiftKey)
      }}
      onDoubleClick={e => { e.preventDefault(); onOpen(order.orderId) }}
      className={`relative overflow-hidden rounded-xl border bg-stone-900/80 p-2.5 space-y-1.5 transition-colors cursor-pointer select-none ${
        order._processing ? 'server-card-processing border-sky-600/70'
          : selected ? 'border-sky-500 ring-1 ring-sky-500/40 bg-sky-950/20'
            : busy ? 'border-sky-500/60 ring-1 ring-sky-500/30'
              : order.hasFalError ? 'border-red-700/80 hover:border-red-600'
                : order.isBlocked24h ? 'border-amber-800/70 hover:border-amber-700'
                  : 'border-stone-700/80 hover:border-stone-600'
      }`}
    >
      <div className="flex gap-2">
        <div className="w-10 h-10 rounded-md bg-white shrink-0 overflow-hidden flex items-center justify-center border border-stone-700">
          {order.thumbUrl
            ? <img src={order.thumbUrl} alt="" className="w-full h-full object-cover" draggable={false} loading="lazy" decoding="async" fetchPriority="low" />
            : <span className="text-[9px] text-stone-400 text-center leading-tight px-0.5">photo</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <p className="text-xs font-semibold text-stone-100 truncate flex-1" title={order.email || undefined}>
              {title}
            </p>
            <div className="flex shrink-0 items-center gap-0.5">
              {clientUrl && (
                <a
                  href={clientUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Voir page commande client"
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  className="p-0.5 rounded text-stone-500 hover:text-sky-400 hover:bg-stone-800/80 transition-colors"
                >
                  <EyeIcon />
                </a>
              )}
              {adminUrl && (
                <a
                  href={adminUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Voir page commande admin"
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  className="p-0.5 rounded text-stone-500 hover:text-amber-400 hover:bg-stone-800/80 transition-colors"
                >
                  <EyeIcon />
                </a>
              )}
            </div>
          </div>
          <p className="text-[10px] text-stone-400">{faceLabel(order.faceCount)}</p>
        </div>
      </div>

      {motorCls && !order._processing && (
        <p className={`text-[10px] font-medium px-2 py-0.5 rounded border ${motorCls}`}>
          {motorLabel}
        </p>
      )}

      {order.hasLaserSvg && (
        <p className="text-[10px] font-medium px-2 py-0.5 rounded border bg-violet-500/15 text-violet-300 border-violet-500/30 w-fit">
          SVG ✓
        </p>
      )}

      {order.studioLaser?.log && order.studioLaser?.phase === 'running' && (
        <p className="text-[10px] text-stone-400 truncate" title={order.studioLaser.log}>
          {order.studioLaser.log}
        </p>
      )}

      {order._processing && (
        <p className="text-[10px] font-medium px-2 py-0.5 rounded border bg-sky-900/50 text-sky-200 border-sky-700">
          Génération…
        </p>
      )}

      {order.isBlocked24h && !order.hasFalError && (
        <p className="text-[10px] font-medium px-2 py-0.5 rounded border bg-amber-950/50 text-amber-200 border-amber-800">
          Bloqué {order.stuckHours}h+
        </p>
      )}

      {(order.hasFalError || order.errorLog?.length > 0) && (
        <ErrorLogPanel order={order} />
      )}
    </article>
  )
}

export function ServerKanbanColumn({
  col,
  orders,
  totals,
  busyOrderId,
  selectedIds,
  onSelect,
  onContextMenu,
  onOpen,
}) {
  const faceSum = totals?.faces ?? orders.reduce((n, o) => n + (Number(o.faceCount) || 0), 0)
  const count = totals?.orders ?? orders.length
  const errorCount = totals?.errors ?? orders.filter(o => o.hasFalError).length
  const blockedCount = totals?.blocked24h ?? orders.filter(o => o.isBlocked24h).length
  const hasAlerts = errorCount > 0 || blockedCount > 0

  return (
    <div className={`flex flex-col min-w-[200px] max-w-[220px] flex-1 rounded-xl border bg-stone-900/40 ${
      errorCount > 0 ? 'border-red-800/80' : blockedCount > 0 ? 'border-amber-800/60' : 'border-stone-800'
    }`}>
      <div className="px-3 py-2 border-b border-stone-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-stone-200 leading-tight">{col.label}</p>
          <span className="text-[10px] font-bold text-stone-500 tabular-nums whitespace-nowrap">
            {count} · {faceSum} pers.
          </span>
        </div>
        {hasAlerts && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {errorCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-red-900/70 text-red-100 border border-red-700 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {errorCount} err. FAL
              </span>
            )}
            {blockedCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-amber-950/70 text-amber-200 border border-amber-800 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {blockedCount} &gt;24h
              </span>
            )}
          </div>
        )}
        <p className="text-[10px] text-stone-600 mt-0.5 leading-snug">{col.hint}</p>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-380px)] min-h-[100px]">
        {orders.length === 0
          ? <p className="text-[10px] text-stone-600 text-center py-4">—</p>
          : orders.map(o => (
            <ServerOrderCard
              key={o.orderId}
              order={o}
              busy={busyOrderId === o.orderId}
              selected={selectedIds.has(o.orderId)}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onOpen={onOpen}
            />
          ))}
      </div>
    </div>
  )
}

export function ServerKanbanBoard({
  boardRef,
  columns,
  byColumn,
  columnTotals,
  busyOrderId,
  selectedIds,
  onSelect,
  onContextMenu,
  onBoardMouseDown,
  selectRect,
}) {
  const navigate = useNavigate()
  const openOrder = id => navigate(`/c/${id}`)

  return (
    <div
      ref={boardRef}
      data-kanban-board
      className="relative overflow-x-auto pb-2 -mx-4 px-4 select-none"
      onMouseDown={onBoardMouseDown}
    >
      {selectRect && (
        <div
          className="fixed z-30 border border-sky-400/80 bg-sky-500/10 pointer-events-none"
          style={{
            left: selectRect.left,
            top: selectRect.top,
            width: selectRect.width,
            height: selectRect.height,
          }}
        />
      )}
      <div className="flex gap-3 min-w-max">
        {columns.map(col => (
          <ServerKanbanColumn
            key={col.key}
            col={col}
            orders={byColumn[col.key] ?? []}
            totals={columnTotals?.[col.key]}
            busyOrderId={busyOrderId}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onOpen={openOrder}
          />
        ))}
      </div>
    </div>
  )
}

export function buildContextMenu(e, order, selectedIds) {
  const orderIds = selectedIds.has(order.orderId) && selectedIds.size > 1
    ? [...selectedIds]
    : [order.orderId]
  const actions = contextActionsForColumn(order.column, order)
  return { x: e.clientX, y: e.clientY, orderIds, order, actions, column: order.column }
}

export function bulkActionsForSelection(cards, selectedIds) {
  if (!selectedIds.size) return []
  const selected = cards.filter(c => selectedIds.has(c.orderId))
  const columns = new Set(selected.map(c => c.column))
  const actions = [{ id: 'delete', label: 'Supprimer la sélection', danger: true }]
  if (columns.size === 1) {
    const col = [...columns][0]
    const specific = (contextActionsForColumn(col) ?? []).filter(a => a.id !== 'delete')
    actions.unshift(...specific.map(a => ({ ...a, label: `${a.label} (${selected.length})` })))
  }
  return actions
}
