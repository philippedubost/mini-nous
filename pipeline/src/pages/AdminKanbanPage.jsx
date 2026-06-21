import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAdminBoard, updateAdminWorkflow } from '../lib/storage'

const ALL_COLUMNS = [
  { key: 'awaiting_photo', label: 'Photo', hint: 'En attente photo', accent: 'border-stone-600', adminDrop: false },
  { key: 'in_studio', label: 'Design', hint: 'Traitement', accent: 'border-amber-600/60', adminDrop: false },
  { key: 'pending_validation', label: 'À valider', hint: 'Client', accent: 'border-sky-600/60', adminDrop: false },
  { key: 'revision_requested', label: 'Révision', hint: 'Équipe 24 h', accent: 'border-orange-600/60', adminDrop: false },
  { key: 'approved', label: 'Prêt à fabriquer', hint: 'Glisser ici · e-mail client', accent: 'border-emerald-600/60', adminDrop: true },
  { key: 'in_production', label: 'Fin fabrication', hint: 'Glisser ici · e-mail client', accent: 'border-violet-600/60', adminDrop: true },
  { key: 'shipped', label: 'Colis expédié', hint: 'Glisser ici · e-mail client', accent: 'border-stone-400', adminDrop: true },
]

const ADMIN_KEYS = new Set(['approved', 'in_production', 'shipped'])

const WEEK_STATUS_BADGE = {
  open: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  in_production: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  shipped: 'bg-stone-500/15 text-stone-300 border-stone-500/30',
  closed: 'bg-stone-600/15 text-stone-400 border-stone-600/30',
}

function formatShip(ymd) {
  if (!ymd) return '—'
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function OrderCard({ order, dragging, onDragStart, onDragEnd }) {
  const title = order.customerName?.trim() || order.email?.split('@')[0] || 'Commande'
  const studioUrl = order.accessToken
    ? `/studio?order=${encodeURIComponent(order.accessToken)}`
    : null

  return (
    <article
      draggable
      onDragStart={e => onDragStart(e, order)}
      onDragEnd={onDragEnd}
      className={`rounded-xl border bg-stone-900/80 p-3 space-y-2 shadow-sm transition-colors cursor-grab active:cursor-grabbing ${
        dragging ? 'opacity-40 border-amber-500/50' : 'border-stone-700/80 hover:border-stone-600'
      }`}
    >
      <div className="flex gap-2">
        <div className="w-14 h-14 rounded-lg bg-white shrink-0 overflow-hidden flex items-center justify-center">
          {order.previewUrl
            ? <img src={order.previewUrl} alt="" className="w-full h-full object-contain" draggable={false}/>
            : order.sourcePhotoUrl
              ? <img src={order.sourcePhotoUrl} alt="" className="w-full h-full object-cover" draggable={false}/>
              : <span className="text-[10px] text-stone-400 text-center px-1">—</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-100 truncate">{title}</p>
          {order.email && <p className="text-[11px] text-stone-500 truncate">{order.email}</p>}
          <p className="text-[11px] text-stone-400 mt-0.5">
            {order.packLabel} · {order.faceCount} pers.
            {order.lineartVersion > 1 && ` · v${order.lineartVersion}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {order.hasLaserSvg && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
            SVG ✓
          </span>
        )}
        {order.isTestOrder && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-stone-700 text-stone-400">test</span>
        )}
        {order.revisionDueAt && order.workflowStatus === 'revision_requested' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300">
            avant {new Date(order.revisionDueAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {order.generationId && (
          <Link to={`/admin/g/${order.generationId}`} className="text-[11px] font-semibold text-amber-400 hover:text-amber-300" onClick={e => e.stopPropagation()}>
            Pipeline →
          </Link>
        )}
        {studioUrl && (
          <Link to={studioUrl} className="text-[11px] text-stone-500 hover:text-stone-300" onClick={e => e.stopPropagation()}>
            Studio
          </Link>
        )}
      </div>
    </article>
  )
}

function KanbanColumn({
  col, orders, dragOver, onDragOver, onDragLeave, onDrop, draggingId,
  onDragStart, onDragEnd,
}) {
  return (
    <div
      className={`flex flex-col min-w-[220px] max-w-[260px] flex-1 rounded-xl border bg-stone-900/40 transition-colors ${col.accent} ${
        dragOver && col.adminDrop ? 'ring-2 ring-amber-500/60 bg-amber-950/20' : ''
      }`}
      onDragOver={col.adminDrop ? onDragOver : undefined}
      onDragLeave={col.adminDrop ? onDragLeave : undefined}
      onDrop={col.adminDrop ? e => onDrop(e, col.key) : undefined}
    >
      <div className="px-3 py-2.5 border-b border-stone-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-stone-200">{col.label}</p>
          <span className="text-xs font-bold text-stone-500 tabular-nums">{orders.length}</span>
        </div>
        <p className="text-[10px] text-stone-600 mt-0.5">{col.hint}</p>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[120px]">
        {orders.length === 0
          ? <p className="text-[11px] text-stone-600 text-center py-6">{col.adminDrop ? 'Déposer ici' : '—'}</p>
          : orders.map(o => (
            <OrderCard
              key={o.id}
              order={o}
              dragging={draggingId === o.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
      </div>
    </div>
  )
}

export default function AdminKanbanPage() {
  const [data, setData] = useState(null)
  const [weekKey, setWeekKey] = useState(null)
  const [onlyCurrentWeek, setOnlyCurrentWeek] = useState(true)
  const [productionOnly, setProductionOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [moveBusy, setMoveBusy] = useState(null)
  const [moveError, setMoveError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const board = await fetchAdminBoard()
      setData(board)
      setWeekKey(prev => {
        if (prev) return prev
        return board.currentWeekKey ?? board.weeks[0]?.weekKey ?? null
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (onlyCurrentWeek && data?.currentWeekKey) {
      setWeekKey(data.currentWeekKey)
    }
  }, [onlyCurrentWeek, data?.currentWeekKey])

  const effectiveWeekKey = onlyCurrentWeek ? (data?.currentWeekKey ?? weekKey) : weekKey

  const selectedWeek = useMemo(
    () => data?.weeks?.find(w => w.weekKey === effectiveWeekKey) ?? null,
    [data, effectiveWeekKey],
  )

  const filteredOrders = useMemo(() => {
    if (!data?.orders) return []
    let list = data.orders
    if (effectiveWeekKey) {
      list = list.filter(o => o.weekKey === effectiveWeekKey)
    }
    if (productionOnly) {
      list = list.filter(o => ADMIN_KEYS.has(o.workflowStatus))
    }
    return list
  }, [data, effectiveWeekKey, productionOnly])

  const byColumn = useMemo(() => {
    const map = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, []]))
    for (const o of filteredOrders) {
      const key = ALL_COLUMNS.some(c => c.key === o.workflowStatus) ? o.workflowStatus : 'in_studio'
      map[key].push(o)
    }
    return map
  }, [filteredOrders])

  const visibleColumns = productionOnly
    ? ALL_COLUMNS.filter(c => c.adminDrop)
    : ALL_COLUMNS

  const totalFaces = filteredOrders.reduce((s, o) => s + (o.faceCount || 0), 0)

  const handleDragStart = (e, order) => {
    setDraggingId(order.id)
    e.dataTransfer.setData('application/json', JSON.stringify({ orderId: order.id }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverCol(null)
  }

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    setDraggingId(null)

    let orderId
    try {
      orderId = JSON.parse(e.dataTransfer.getData('application/json')).orderId
    } catch {
      return
    }

    const order = data?.orders?.find(o => o.id === orderId)
    if (!order || order.workflowStatus === targetStatus) return

    setMoveBusy(orderId)
    setMoveError(null)

    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        orders: prev.orders.map(o => o.id === orderId ? { ...o, workflowStatus: targetStatus } : o),
      }
    })

    try {
      await updateAdminWorkflow(orderId, targetStatus)
      await load()
    } catch (err) {
      setMoveError(err.message)
      await load()
    } finally {
      setMoveBusy(null)
    }
  }

  if (loading) {
    return <p className="text-stone-500 text-sm py-12 text-center">Chargement du tableau…</p>
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
        {error}
        <button type="button" onClick={load} className="block mt-2 text-amber-400 hover:underline">Réessayer</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-100">Commandes par édition</h2>
          <p className="text-sm text-stone-500 mt-1">
            Glissez une carte vers <strong className="text-stone-400">Prêt à fabriquer</strong>,{' '}
            <strong className="text-stone-400">Fin fabrication</strong> ou{' '}
            <strong className="text-stone-400">Colis expédié</strong> — un e-mail part automatiquement.
          </p>
        </div>
        <button type="button" onClick={load} className="text-sm text-amber-500 hover:text-amber-400">
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-stone-700 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setOnlyCurrentWeek(true)}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              onlyCurrentWeek ? 'bg-stone-700 text-stone-100' : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            Édition courante
          </button>
          <button
            type="button"
            onClick={() => setOnlyCurrentWeek(false)}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              !onlyCurrentWeek ? 'bg-stone-700 text-stone-100' : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            Choisir l&apos;édition
          </button>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-stone-400 cursor-pointer">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={productionOnly}
            onChange={e => setProductionOnly(e.target.checked)}
          />
          Pipeline fabrication uniquement
        </label>
      </div>

      {moveError && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/20 px-3 py-2 text-xs text-red-300">
          {moveError}
        </div>
      )}

      {moveBusy && (
        <p className="text-xs text-amber-400/80">Mise à jour en cours…</p>
      )}

      {/* Sélecteur d'édition (si pas courante seulement) */}
      {!onlyCurrentWeek && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {(data?.weeks ?? []).map(w => {
            const active = w.weekKey === weekKey
            const count = (data?.orders ?? []).filter(o => o.weekKey === w.weekKey).length
            return (
              <button
                key={w.weekKey}
                type="button"
                onClick={() => setWeekKey(w.weekKey)}
                className={`shrink-0 rounded-xl border px-4 py-3 text-left transition-colors min-w-[200px] ${
                  active ? 'border-amber-500/50 bg-amber-950/30' : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'
                }`}
              >
                <p className={`text-xs font-bold ${active ? 'text-amber-300' : 'text-stone-400'}`}>Fabrication mardi</p>
                <p className={`text-sm font-semibold mt-0.5 ${active ? 'text-stone-100' : 'text-stone-300'}`}>
                  {w.fabricationLabel?.replace(/^Fabrication\s+/i, '') ?? w.weekKey}
                </p>
                <p className="text-[11px] text-stone-500 mt-1">
                  Livraison {formatShip(w.shipDate)} · {count} cmd · {w.soldCount}/{w.capacity} pers.
                </p>
              </button>
            )
          })}
        </div>
      )}

      {onlyCurrentWeek && selectedWeek && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
          <p className="text-sm font-semibold text-amber-200">
            Édition courante — {selectedWeek.fabricationLabel ?? selectedWeek.weekKey}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            Livraison {formatShip(selectedWeek.shipDate)} · {filteredOrders.length} commande{filteredOrders.length > 1 ? 's' : ''} · {totalFaces} personnages
          </p>
        </div>
      )}

      {selectedWeek && !onlyCurrentWeek && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-400">
          <span><strong className="text-stone-200">{filteredOrders.length}</strong> commande{filteredOrders.length > 1 ? 's' : ''}</span>
          <span>·</span>
          <span><strong className="text-stone-200">{totalFaces}</strong> personnages</span>
          {selectedWeek.batchSvgUrl && (
            <>
              <span>·</span>
              <a href={selectedWeek.batchSvgUrl} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Planche batch SVG</a>
            </>
          )}
          <span>·</span>
          <Link to="/admin/generations" className="text-amber-400 hover:underline">Générations & batch →</Link>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {visibleColumns.map(col => (
          <KanbanColumn
            key={col.key}
            col={col}
            orders={byColumn[col.key] ?? []}
            dragOver={dragOverCol === col.key}
            draggingId={draggingId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  )
}
