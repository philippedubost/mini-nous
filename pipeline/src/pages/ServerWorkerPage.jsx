import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchWorkerBoard,
  loadWorkerSecret,
  pickNextJob,
  queueStudioJob,
  runMotorPass,
  runWorkerBulkAction,
  saveWorkerSecret,
} from '../lib/studioWorker'
import {
  ServerKanbanBoard,
  ServerContextMenu,
  buildContextMenu,
  bulkActionsForSelection,
} from '../components/ServerKanban'
import { useBoxSelect } from '../hooks/useBoxSelect'
import { mergeBoardOptimistic, optimisticFromMotorResult } from '../lib/serverBoardMerge'
import AppBuildFooter from '../components/AppBuildFooter'
import { ServerBtn, ServerConfirmModal } from '../components/ServerUi'

function formatTime(d = new Date()) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatWeekLabel(w) {
  if (!w?.shipDate) return w?.weekKey ?? '—'
  const d = new Date(`${w.shipDate}T12:00:00`)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function ServerWorkerPage() {
  const [secret, setSecret] = useState(loadWorkerSecret)
  const [secretDraft, setSecretDraft] = useState(secret)
  const [running, setRunning] = useState(true)
  const [weekKey, setWeekKey] = useState('')
  const [weeks, setWeeks] = useState([])
  const [columns, setColumns] = useState([])
  const [byColumn, setByColumn] = useState({})
  const [columnTotals, setColumnTotals] = useState({})
  const [allCards, setAllCards] = useState([])
  const [motorJobs, setMotorJobs] = useState([])
  const [boardTotals, setBoardTotals] = useState({ orders: 0, faces: 0 })
  const [stats, setStats] = useState({ pending: 0, errors: 0, blocked24h: 0, falErrors: 0 })
  const [logs, setLogs] = useState([])
  const [passCount, setPassCount] = useState(0)
  const [busyOrderId, setBusyOrderId] = useState(null)
  const [lastPollAt, setLastPollAt] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [contextMenu, setContextMenu] = useState(null)
  const [optimistic, setOptimistic] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const boardRef = useRef(null)
  const runningRef = useRef(running)
  const secretRef = useRef(secret)
  const weekKeyRef = useRef(weekKey)
  const busyRef = useRef(false)

  runningRef.current = running
  secretRef.current = secret
  weekKeyRef.current = weekKey

  const pushLog = useCallback((message, detail = null, level = 'info') => {
    setLogs(prev => [
      { id: `${Date.now()}-${Math.random()}`, at: formatTime(), message, detail, level },
      ...prev,
    ].slice(0, 200))
  }, [])

  const applyBoard = useCallback((data) => {
    setColumns(data.columns ?? [])
    setByColumn(data.byColumn ?? {})
    setColumnTotals(data.columnTotals ?? {})
    setAllCards(data.cards ?? Object.values(data.byColumn ?? {}).flat())
    setMotorJobs(data.jobs ?? [])
    setWeeks(data.weeks ?? [])
    setBoardTotals({ orders: data.totalOrders ?? 0, faces: data.totalFaces ?? 0 })
    setStats({
      pending: data.pending ?? 0,
      errors: data.errors ?? 0,
      blocked24h: data.blocked24h ?? 0,
      falErrors: data.falErrors ?? 0,
    })
    setLastPollAt(formatTime())
  }, [])

  const refreshBoard = useCallback(async () => {
    if (!secretRef.current) return null
    const data = await fetchWorkerBoard(secretRef.current, {
      weekKey: weekKeyRef.current || null,
    })
    applyBoard(data)
    return data.jobs ?? []
  }, [applyBoard])

  const displayBoard = useMemo(
    () => mergeBoardOptimistic({ columns, byColumn, columnTotals, allCards }, optimistic),
    [columns, byColumn, columnTotals, allCards, optimistic],
  )

  const handleBoxSelect = useCallback((hit, additive) => {
    setSelectedIds(prev => {
      if (!additive) return new Set(hit)
      const next = new Set(prev)
      hit.forEach(id => next.add(id))
      return next
    })
  }, [])

  const { rect: selectRect, onBoardMouseDown } = useBoxSelect(boardRef, { onChange: handleBoxSelect })

  const handleCardSelect = useCallback((orderId, shiftKey) => {
    setSelectedIds(prev => {
      if (shiftKey) {
        const next = new Set(prev)
        if (next.has(orderId)) next.delete(orderId)
        else next.add(orderId)
        return next
      }
      return new Set([orderId])
    })
  }, [])

  const runPassForOrder = useCallback(async (orderId, { queue = false, mode = 'initial' } = {}) => {
    if (!secretRef.current) throw new Error('Secret worker manquant')
    setBusyOrderId(orderId)
    try {
      if (queue) {
        const q = await queueStudioJob(secretRef.current, orderId, { mode })
        if (q.skipped) {
          const msg = q.reason === 'not_paid'
            ? 'Paiement requis avant de lancer le tracé'
            : `Mise en file ignorée (${q.reason})`
          throw new Error(msg)
        }
        pushLog(`Mise en file ${orderId.slice(0, 8)}…`, q)
      }
      const result = await runMotorPass(secretRef.current, orderId)
      setPassCount(n => n + 1)
      const label = result.phase === 'step1' ? 'Step 1' : result.phase === 'step2' ? 'Step 2' : result.phase ?? 'fait'
      pushLog(`Passage moteur → ${label}`, result, result.error ? 'error' : 'info')
      return result
    } finally {
      setBusyOrderId(null)
    }
  }, [pushLog])

  const launchTraceV1Flow = useCallback(async (orderIds) => {
    if (!secretRef.current || !orderIds.length) return

    setOptimistic(prev => {
      const next = { ...prev }
      for (const id of orderIds) next[id] = { column: 'order_step1', processing: true }
      return next
    })
    setSelectedIds(new Set())
    busyRef.current = true

    try {
      for (const id of orderIds) {
        setBusyOrderId(id)
        const q = await queueStudioJob(secretRef.current, id, { mode: 'initial' })
        if (q.skipped) {
          throw new Error(
            q.reason === 'not_paid'
              ? 'Paiement requis avant de lancer le tracé'
              : `Mise en file ignorée (${q.reason})`,
          )
        }
        pushLog(`Tracé v1 lancé · ${id.slice(0, 8)}…`, q)

        let result = await runMotorPass(secretRef.current, id)
        setPassCount(n => n + 1)

        const applyOptimistic = (r) => {
          const ov = optimisticFromMotorResult(r)
          if (!ov) {
            setOptimistic(prev => {
              const next = { ...prev }
              delete next[id]
              return next
            })
            return
          }
          setOptimistic(prev => ({ ...prev, [id]: ov }))
        }

        applyOptimistic(result)
        const label = result.phase === 'step1' ? 'Step 1' : result.phase === 'step2' ? 'Step 2' : result.phase ?? 'fait'
        pushLog(`Passage moteur → ${label}`, result, result.error ? 'error' : 'info')

        while (result?.needsContinue && !result?.error && result?.phase !== 'error') {
          await new Promise(r => setTimeout(r, 800))
          result = await runMotorPass(secretRef.current, id)
          setPassCount(n => n + 1)
          applyOptimistic(result)
        }

        if (result?.error || result?.phase === 'error') {
          pushLog(result.error || 'Erreur FAL', result, 'error')
        }
      }
    } catch (err) {
      pushLog(err.message, null, 'error')
      setOptimistic({})
    } finally {
      setBusyOrderId(null)
      busyRef.current = false
      await refreshBoard()
      setOptimistic({})
    }
  }, [pushLog, refreshBoard])

  const runAction = useCallback(async (action, orderIds) => {
    if (!secretRef.current || !orderIds.length) return
    if (action === 'open_admin' || action === 'open_client') return

    if (action === 'launch_trace_v1') {
      await launchTraceV1Flow(orderIds)
      return
    }

    busyRef.current = true
    try {
      const res = await runWorkerBulkAction(secretRef.current, action, orderIds)
      pushLog(
        `Action ${action} · ${orderIds.length} carte(s)`,
        res,
        res.failed ? 'error' : 'info',
      )
      setSelectedIds(new Set())
      await refreshBoard()
    } catch (err) {
      pushLog(err.message, null, 'error')
    } finally {
      busyRef.current = false
    }
  }, [pushLog, refreshBoard, launchTraceV1Flow])

  const requestAction = useCallback((action, orderIds) => {
    if (action === 'delete') {
      setDeleteConfirm({ orderIds: [...orderIds], count: orderIds.length })
      return
    }
    runAction(action, orderIds)
  }, [runAction])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm?.orderIds?.length) return
    setDeleteBusy(true)
    try {
      await runAction('delete', deleteConfirm.orderIds)
      setDeleteConfirm(null)
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteConfirm, runAction])

  useEffect(() => {
    if (!secret) return undefined
    let cancelled = false

    async function loop() {
      while (!cancelled && runningRef.current) {
        if (!secretRef.current) {
          await new Promise(r => setTimeout(r, 1000))
          continue
        }
        if (busyRef.current) {
          await new Promise(r => setTimeout(r, 300))
          continue
        }

        busyRef.current = true
        try {
          const list = await refreshBoard()
          const next = pickNextJob(list)
          if (!next) {
            busyRef.current = false
            await new Promise(r => setTimeout(r, 3000))
            continue
          }

          let result = await runPassForOrder(next.orderId, {
            queue: next.needsQueue,
            mode: next.mode ?? next.studioJob?.mode ?? 'initial',
          })

          while (!cancelled && runningRef.current && result?.needsContinue) {
            await new Promise(r => setTimeout(r, 800))
            result = await runPassForOrder(next.orderId)
          }

          await refreshBoard()
          busyRef.current = false
          await new Promise(r => setTimeout(r, 500))
        } catch (err) {
          pushLog(err.message, null, 'error')
          busyRef.current = false
          await new Promise(r => setTimeout(r, 5000))
        }
      }
    }

    loop()
    return () => { cancelled = true }
  }, [secret, running, weekKey, refreshBoard, runPassForOrder, pushLog])

  useEffect(() => {
    if (!secret) return
    refreshBoard().catch(err => pushLog(err.message, null, 'error'))
  }, [secret, weekKey, refreshBoard, pushLog])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (deleteConfirm) setDeleteConfirm(null)
        else setSelectedIds(new Set())
      }
      if (e.key === 'Delete' && selectedIds.size && secret && !deleteConfirm) {
        setDeleteConfirm({ orderIds: [...selectedIds], count: selectedIds.size })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, secret, deleteConfirm])

  const handleSaveSecret = (e) => {
    e.preventDefault()
    saveWorkerSecret(secretDraft.trim())
    setSecret(secretDraft.trim())
    pushLog('Secret enregistré localement')
  }

  const bulkActions = bulkActionsForSelection(allCards, selectedIds)

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-['Montserrat',sans-serif] flex flex-col">
      <div className="flex-1 max-w-[100vw] mx-auto px-4 py-6 space-y-5 w-full">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-800 pb-5">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">Moteur Studio</h1>
            <p className="text-sm text-stone-400">
              Kanban atelier — sélection (clic, Maj+clic, rectangle Maj+glisser), clic droit pour les actions.
              Double-clic pour ouvrir le détail.
            </p>
          </div>
          <ServerBtn
            variant={running ? 'success' : 'muted'}
            className="px-4 py-2 text-sm"
            onClick={() => setRunning(r => !r)}
          >
            {running ? '● Moteur actif' : '○ Moteur en pause'}
          </ServerBtn>
        </header>

        {!secret && (
          <form onSubmit={handleSaveSecret} className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 space-y-3 max-w-lg">
            <p className="text-sm text-amber-100">
              Secret <code className="text-amber-200">STUDIO_GENERATE_SECRET</code>
            </p>
            <input
              type="password"
              value={secretDraft}
              onChange={e => setSecretDraft(e.target.value)}
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm font-mono"
              autoComplete="off"
            />
            <ServerBtn type="submit" variant="primary" className="px-4 py-2 text-sm w-full sm:w-auto">
              Enregistrer
            </ServerBtn>
          </form>
        )}

        {secret && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-stone-500">
                Semaine prod
                <select
                  value={weekKey}
                  onChange={e => setWeekKey(e.target.value)}
                  className="ml-2 rounded-lg border border-stone-700 bg-stone-900 px-2 py-1.5 text-sm text-stone-200"
                >
                  <option value="">Toutes les semaines</option>
                  {weeks.map(w => (
                    <option key={w.weekKey} value={w.weekKey}>
                      {formatWeekLabel(w)} · {w.soldCount}/{w.capacity} pers.
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-stone-500">
                {boardTotals.orders} commandes · {boardTotals.faces} personnages
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-4xl">
              {[
                ['À traiter', stats.pending, 'text-amber-300'],
                ['Erreurs FAL', stats.falErrors, 'text-red-300'],
                ['Bloquées >24h', stats.blocked24h, 'text-amber-300'],
                ['Passages moteur', passCount, 'text-sky-300'],
                ['Refresh', lastPollAt ?? '—', 'text-stone-400 text-base'],
              ].map(([label, value, cls]) => (
                <div key={label} className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
                  <p className="text-[10px] text-stone-500 uppercase tracking-wide">{label}</p>
                  <p className={`text-xl font-semibold mt-1 font-mono ${cls}`}>{value}</p>
                </div>
              ))}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-800/60 bg-sky-950/30 px-4 py-3">
                <span className="text-sm text-sky-200 font-medium">{selectedIds.size} sélectionnée(s)</span>
                {bulkActions.map(a => (
                  <ServerBtn
                    key={a.id}
                    variant={a.danger ? 'danger' : 'default'}
                    onClick={() => requestAction(a.id, [...selectedIds])}
                  >
                    {a.label}
                  </ServerBtn>
                ))}
                <ServerBtn
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Effacer
                </ServerBtn>
              </div>
            )}

            {columns.length > 0 && (
              <ServerKanbanBoard
                boardRef={boardRef}
                columns={columns}
                byColumn={displayBoard.byColumn}
                columnTotals={displayBoard.columnTotals}
                busyOrderId={busyOrderId}
                selectedIds={selectedIds}
                onSelect={handleCardSelect}
                onContextMenu={(e, order) => {
                  e.preventDefault()
                  if (!selectedIds.has(order.orderId)) {
                    setSelectedIds(new Set([order.orderId]))
                  }
                  setContextMenu(buildContextMenu(e, order, selectedIds.has(order.orderId) ? selectedIds : new Set([order.orderId])))
                }}
                onBoardMouseDown={onBoardMouseDown}
                selectRect={selectRect}
              />
            )}
          </>
        )}

        <ServerContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAction={requestAction}
        />

        <ServerConfirmModal
          open={!!deleteConfirm}
          title="Supprimer ?"
          confirmLabel="Supprimer"
          busy={deleteBusy}
          onCancel={() => !deleteBusy && setDeleteConfirm(null)}
          onConfirm={confirmDelete}
        >
          {deleteConfirm?.count === 1
            ? 'Cette commande sera annulée (statut cancelled).'
            : `${deleteConfirm?.count ?? 0} commandes seront annulées (statut cancelled).`}
        </ServerConfirmModal>

        <section className="rounded-xl border border-stone-800 overflow-hidden max-w-4xl">
          <div className="px-4 py-3 border-b border-stone-800 bg-stone-900/80 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-stone-300">Journal moteur</h2>
            <ServerBtn variant="ghost" onClick={() => setLogs([])}>
              effacer
            </ServerBtn>
          </div>
          <div className="max-h-64 overflow-y-auto p-3 space-y-1 font-['JetBrains_Mono',monospace] text-xs">
            {logs.length === 0 && <p className="text-stone-600 px-1 py-2">Les actions apparaîtront ici…</p>}
            {logs.map(entry => (
              <div
                key={entry.id}
                className={`rounded px-2 py-1 ${entry.level === 'error' ? 'bg-red-950/40 text-red-300' : 'text-stone-400'}`}
              >
                <span className="text-stone-600">{entry.at}</span> {entry.message}
              </div>
            ))}
          </div>
        </section>
      </div>
      <AppBuildFooter variant="dark" />
    </div>
  )
}
