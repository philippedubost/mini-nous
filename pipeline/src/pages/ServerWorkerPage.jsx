import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [stats, setStats] = useState({ pending: 0, errors: 0 })
  const [logs, setLogs] = useState([])
  const [passCount, setPassCount] = useState(0)
  const [busyOrderId, setBusyOrderId] = useState(null)
  const [lastPollAt, setLastPollAt] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [contextMenu, setContextMenu] = useState(null)
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
    setStats({ pending: data.pending ?? 0, errors: data.errors ?? 0 })
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

  const runAction = useCallback(async (action, orderIds) => {
    if (!secretRef.current || !orderIds.length) return
    busyRef.current = true
    try {
      if (action === 'launch_trace_v1') {
        for (const id of orderIds) {
          await runPassForOrder(id, { queue: true, mode: 'initial' })
        }
      } else {
        const res = await runWorkerBulkAction(secretRef.current, action, orderIds)
        pushLog(
          `Action ${action} · ${orderIds.length} carte(s)`,
          res,
          res.failed ? 'error' : 'info',
        )
      }
      setSelectedIds(new Set())
      await refreshBoard()
    } catch (err) {
      pushLog(err.message, null, 'error')
    } finally {
      busyRef.current = false
    }
  }, [pushLog, refreshBoard, runPassForOrder])

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
      if (e.key === 'Escape') setSelectedIds(new Set())
      if (e.key === 'Delete' && selectedIds.size && secret) {
        if (window.confirm(`Supprimer ${selectedIds.size} commande(s) ?`)) {
          runAction('delete', [...selectedIds])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, secret, runAction])

  const handleSaveSecret = (e) => {
    e.preventDefault()
    saveWorkerSecret(secretDraft.trim())
    setSecret(secretDraft.trim())
    pushLog('Secret enregistré localement')
  }

  const bulkActions = bulkActionsForSelection(allCards, selectedIds)

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-['Montserrat',sans-serif]">
      <div className="max-w-[100vw] mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-800 pb-5">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">Moteur Studio</h1>
            <p className="text-sm text-stone-400">
              Kanban atelier — sélection (clic, Maj+clic, rectangle Maj+glisser), clic droit pour les actions.
              Double-clic pour ouvrir le détail.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRunning(r => !r)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              running
                ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                : 'bg-stone-700 hover:bg-stone-600 text-stone-200'
            }`}
          >
            {running ? '● Moteur actif' : '○ Moteur en pause'}
          </button>
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
            <button type="submit" className="rounded-lg bg-amber-700 hover:bg-amber-600 px-4 py-2 text-sm font-medium">
              Enregistrer
            </button>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
              {[
                ['À traiter', stats.pending, 'text-amber-300'],
                ['Erreurs', stats.errors, 'text-red-300'],
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
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => runAction(a.id, [...selectedIds])}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      a.danger
                        ? 'bg-red-900/60 text-red-200 hover:bg-red-800/60'
                        : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-stone-500 hover:text-stone-300 ml-auto"
                >
                  Effacer
                </button>
              </div>
            )}

            {columns.length > 0 && (
              <ServerKanbanBoard
                boardRef={boardRef}
                columns={columns}
                byColumn={byColumn}
                columnTotals={columnTotals}
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
          onAction={runAction}
        />

        <section className="rounded-xl border border-stone-800 overflow-hidden max-w-4xl">
          <div className="px-4 py-3 border-b border-stone-800 bg-stone-900/80 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-stone-300">Journal moteur</h2>
            <button type="button" onClick={() => setLogs([])} className="text-xs text-stone-500 hover:text-stone-300">
              effacer
            </button>
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
    </div>
  )
}
