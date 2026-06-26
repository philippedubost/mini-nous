import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchWorkerBoard,
  loadWorkerSecret,
  pickNextJob,
  queueStudioJob,
  runMotorPass,
  saveWorkerSecret,
} from '../lib/studioWorker'
import { ServerKanbanColumn } from '../components/ServerKanban'

function formatTime(d = new Date()) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function ServerWorkerPage() {
  const [secret, setSecret] = useState(loadWorkerSecret)
  const [secretDraft, setSecretDraft] = useState(secret)
  const [running, setRunning] = useState(true)
  const [columns, setColumns] = useState([])
  const [byColumn, setByColumn] = useState({})
  const [motorJobs, setMotorJobs] = useState([])
  const [stats, setStats] = useState({ pending: 0, errors: 0 })
  const [logs, setLogs] = useState([])
  const [passCount, setPassCount] = useState(0)
  const [busyOrderId, setBusyOrderId] = useState(null)
  const [lastPollAt, setLastPollAt] = useState(null)
  const runningRef = useRef(running)
  const secretRef = useRef(secret)
  const busyRef = useRef(false)

  runningRef.current = running
  secretRef.current = secret

  const pushLog = useCallback((message, detail = null, level = 'info') => {
    setLogs(prev => [
      { id: `${Date.now()}-${Math.random()}`, at: formatTime(), message, detail, level },
      ...prev,
    ].slice(0, 200))
  }, [])

  const refreshBoard = useCallback(async () => {
    if (!secretRef.current) return null
    const data = await fetchWorkerBoard(secretRef.current)
    setColumns(data.columns ?? [])
    setByColumn(data.byColumn ?? {})
    setMotorJobs(data.jobs ?? [])
    setStats({ pending: data.pending ?? 0, errors: data.errors ?? 0 })
    setLastPollAt(formatTime())
    return data.jobs ?? []
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
      const label = result.phase === 'step1'
        ? 'Step 1'
        : result.phase === 'step2'
          ? 'Step 2'
          : result.phase ?? 'fait'
      pushLog(
        `Passage moteur ${orderId.slice(0, 8)}… → ${label}`,
        result,
        result.error ? 'error' : 'info',
      )
      return result
    } finally {
      setBusyOrderId(null)
    }
  }, [pushLog])

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
  }, [secret, running, refreshBoard, runPassForOrder, pushLog])

  const handleSaveSecret = (e) => {
    e.preventDefault()
    saveWorkerSecret(secretDraft.trim())
    setSecret(secretDraft.trim())
    pushLog('Secret enregistré localement')
  }

  const handleRetry = async (order) => {
    if (!secret || busyRef.current) return
    busyRef.current = true
    try {
      await runPassForOrder(order.orderId, { queue: true, mode: order.studioJob?.mode ?? 'initial' })
      await refreshBoard()
    } catch (err) {
      pushLog(`Relance échouée : ${err.message}`, null, 'error')
    } finally {
      busyRef.current = false
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-['Montserrat',sans-serif]">
      <div className="max-w-[100vw] mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-800 pb-5">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">Moteur Studio</h1>
            <p className="text-sm text-stone-400">
              Cette page pilote les générations FAL. Le site client ne fait que mettre la commande en file —
              tout le traitement (Step 1, Step 2, tracés v1→v3) passe par ici.
            </p>
            <p className="text-xs text-stone-500 rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2">
              <strong className="text-stone-400">Passage moteur</strong> = une action sur FAL
              (lancer Step 1, attendre le résultat, lancer Step 2…). Ce n&apos;est pas le client qui le fait.
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
              Secret <code className="text-amber-200">STUDIO_GENERATE_SECRET</code> (Vercel → Environment Variables).
            </p>
            <input
              type="password"
              value={secretDraft}
              onChange={e => setSecretDraft(e.target.value)}
              placeholder="Collez le secret…"
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm font-mono"
              autoComplete="off"
            />
            <button type="submit" className="rounded-lg bg-amber-700 hover:bg-amber-600 px-4 py-2 text-sm font-medium">
              Enregistrer
            </button>
          </form>
        )}

        {secret && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
            {[
              ['À traiter', stats.pending, 'text-amber-300'],
              ['Erreurs', stats.errors, 'text-red-300'],
              ['Passages moteur', passCount, 'text-sky-300'],
              ['Dernier refresh', lastPollAt ?? '—', 'text-stone-400 text-base'],
            ].map(([label, value, cls]) => (
              <div key={label} className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
                <p className="text-[10px] text-stone-500 uppercase tracking-wide">{label}</p>
                <p className={`text-xl font-semibold mt-1 font-mono ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {secret && columns.length > 0 && (
          <section className="overflow-x-auto pb-2 -mx-4 px-4">
            <div className="flex gap-3 min-w-max">
              {columns.map(col => (
                <ServerKanbanColumn
                  key={col.key}
                  col={col}
                  orders={byColumn[col.key] ?? []}
                  busyOrderId={busyOrderId}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-stone-800 overflow-hidden max-w-4xl">
          <div className="px-4 py-3 border-b border-stone-800 bg-stone-900/80 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-stone-300">Journal moteur</h2>
            <button type="button" onClick={() => setLogs([])} className="text-xs text-stone-500 hover:text-stone-300">
              effacer
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-3 space-y-1 font-['JetBrains_Mono',monospace] text-xs">
            {logs.length === 0 && (
              <p className="text-stone-600 px-1 py-2">Les passages moteur apparaîtront ici…</p>
            )}
            {logs.map(entry => (
              <div
                key={entry.id}
                className={`rounded px-2 py-1 ${
                  entry.level === 'error' ? 'bg-red-950/40 text-red-300' : 'text-stone-400'
                }`}
              >
                <span className="text-stone-600">{entry.at}</span>
                {' '}
                {entry.message}
                {entry.detail && (
                  <pre className="mt-1 text-stone-500 whitespace-pre-wrap break-all text-[10px]">
                    {JSON.stringify(entry.detail, null, 0)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>

        {secret && (
          <p className="text-xs text-stone-600 text-center">
            Secret enregistré ·{' '}
            <button
              type="button"
              className="underline hover:text-stone-400"
              onClick={() => { saveWorkerSecret(''); setSecret(''); setSecretDraft('') }}
            >
              effacer
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
