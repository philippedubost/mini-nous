import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchWorkerJobs,
  loadWorkerSecret,
  pickNextJob,
  queueStudioJob,
  saveWorkerSecret,
  tickStudioJob,
} from '../lib/studioWorker'

const PHASE_LABELS = {
  queued: 'En file',
  step1: 'Step 1 — mise en scène',
  step2: 'Step 2 — tracé',
  error: 'Erreur',
  done: 'Terminé',
}

function formatTime(d = new Date()) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function phaseBadge(phase) {
  const colors = {
    queued: 'bg-amber-900/60 text-amber-200 border-amber-700',
    step1: 'bg-sky-900/60 text-sky-200 border-sky-700',
    step2: 'bg-violet-900/60 text-violet-200 border-violet-700',
    error: 'bg-red-900/60 text-red-200 border-red-700',
  }
  const cls = colors[phase] ?? 'bg-stone-800 text-stone-300 border-stone-700'
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {PHASE_LABELS[phase] ?? phase ?? '—'}
    </span>
  )
}

export default function ServerWorkerPage() {
  const [secret, setSecret] = useState(loadWorkerSecret)
  const [secretDraft, setSecretDraft] = useState(secret)
  const [running, setRunning] = useState(true)
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({ pending: 0, errors: 0 })
  const [logs, setLogs] = useState([])
  const [tickCount, setTickCount] = useState(0)
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

  const refreshJobs = useCallback(async () => {
    if (!secretRef.current) return null
    const data = await fetchWorkerJobs(secretRef.current)
    setJobs(data.jobs ?? [])
    setStats({ pending: data.pending ?? 0, errors: data.errors ?? 0 })
    setLastPollAt(formatTime())
    return data.jobs ?? []
  }, [])

  const runTickForOrder = useCallback(async (orderId, { queue = false, mode = 'initial' } = {}) => {
    if (!secretRef.current) throw new Error('Secret worker manquant')
    setBusyOrderId(orderId)
    try {
      if (queue) {
        const q = await queueStudioJob(secretRef.current, orderId, { mode })
        pushLog(`File ${orderId.slice(0, 8)}…`, q)
      }
      const result = await tickStudioJob(secretRef.current, orderId)
      setTickCount(n => n + 1)
      pushLog(
        `Tick ${orderId.slice(0, 8)}… → ${result.phase ?? '?'}`,
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
          const list = await refreshJobs()
          const next = pickNextJob(list)
          if (!next) {
            busyRef.current = false
            await new Promise(r => setTimeout(r, 3000))
            continue
          }

          let result = await runTickForOrder(next.orderId, {
            queue: next.needsQueue,
            mode: next.mode,
          })

          while (!cancelled && runningRef.current && result?.needsContinue) {
            await new Promise(r => setTimeout(r, 800))
            result = await runTickForOrder(next.orderId)
          }

          await refreshJobs()
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
  }, [secret, running, refreshJobs, runTickForOrder, pushLog])

  const handleSaveSecret = (e) => {
    e.preventDefault()
    saveWorkerSecret(secretDraft.trim())
    setSecret(secretDraft.trim())
    pushLog('Secret enregistré localement')
  }

  const handleRetry = async (job) => {
    if (!secret || busyRef.current) return
    busyRef.current = true
    try {
      await runTickForOrder(job.orderId, { queue: true, mode: job.mode })
      await refreshJobs()
    } catch (err) {
      pushLog(`Retry échoué: ${err.message}`, null, 'error')
    } finally {
      busyRef.current = false
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-['Montserrat',sans-serif]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-800 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Studio Worker</h1>
            <p className="text-sm text-stone-400 mt-1 max-w-xl">
              Moteur de génération tracé — lit la base Supabase et enchaîne les ticks FAL.
              Laissez cette page ouverte sur le pico PC.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRunning(r => !r)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                running
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                  : 'bg-stone-700 hover:bg-stone-600 text-stone-200'
              }`}
            >
              {running ? '● Actif' : '○ En pause'}
            </button>
          </div>
        </header>

        {!secret && (
          <form onSubmit={handleSaveSecret} className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 space-y-3">
            <p className="text-sm text-amber-100">
              Collez le secret <code className="text-amber-200">STUDIO_GENERATE_SECRET</code> (Vercel → Environment Variables).
            </p>
            <input
              type="password"
              value={secretDraft}
              onChange={e => setSecretDraft(e.target.value)}
              placeholder="Bearer secret…"
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm font-mono"
              autoComplete="off"
            />
            <button type="submit" className="rounded-lg bg-amber-700 hover:bg-amber-600 px-4 py-2 text-sm font-medium">
              Enregistrer
            </button>
          </form>
        )}

        {secret && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['En attente', stats.pending, 'text-amber-300'],
              ['Erreurs', stats.errors, 'text-red-300'],
              ['Ticks', tickCount, 'text-sky-300'],
              ['Dernier poll', lastPollAt ?? '—', 'text-stone-400 text-base'],
            ].map(([label, value, cls]) => (
              <div key={label} className="rounded-xl border border-stone-800 bg-stone-900/50 p-4">
                <p className="text-xs text-stone-500 uppercase tracking-wide">{label}</p>
                <p className={`text-2xl font-semibold mt-1 font-mono ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {secret && jobs.length > 0 && (
          <section className="rounded-xl border border-stone-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-800 bg-stone-900/80">
              <h2 className="text-sm font-semibold text-stone-300">Jobs studio ({jobs.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-stone-500 border-b border-stone-800">
                    <th className="px-4 py-2 font-medium">Commande</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Phase</th>
                    <th className="px-4 py-2 font-medium">Workflow</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr
                      key={job.orderId}
                      className={`border-b border-stone-800/60 ${
                        busyOrderId === job.orderId ? 'bg-sky-950/30' : ''
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-stone-400">
                        {job.orderId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-2 text-stone-300 truncate max-w-[160px]">{job.email ?? '—'}</td>
                      <td className="px-4 py-2">{phaseBadge(job.phase)}</td>
                      <td className="px-4 py-2 text-stone-500 text-xs">{job.workflowStatus}</td>
                      <td className="px-4 py-2 text-xs">
                        {job.needsQueue && <span className="text-amber-400">file → </span>}
                        {job.needsTick && <span className="text-sky-400">tick</span>}
                        {job.canRetry && (
                          <button
                            type="button"
                            onClick={() => handleRetry(job)}
                            className="text-red-300 hover:text-red-200 underline"
                          >
                            relancer
                          </button>
                        )}
                        {job.error && (
                          <p className="text-red-400 mt-0.5 truncate max-w-[200px]" title={job.error}>
                            {job.error}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {secret && jobs.length === 0 && (
          <p className="text-center text-stone-500 text-sm py-8">Aucun job studio en cours — en attente de commandes.</p>
        )}

        <section className="rounded-xl border border-stone-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800 bg-stone-900/80 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-stone-300">Journal</h2>
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-xs text-stone-500 hover:text-stone-300"
            >
              effacer
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-3 space-y-1 font-['JetBrains_Mono',monospace] text-xs">
            {logs.length === 0 && (
              <p className="text-stone-600 px-1 py-2">Les ticks apparaîtront ici…</p>
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
                  <pre className="mt-1 text-stone-500 whitespace-pre-wrap break-all">
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
