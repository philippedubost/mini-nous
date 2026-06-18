import { useEffect, useState, useCallback, useMemo, useRef, startTransition } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchGenerations,
  fetchProductionWeeks,
  fetchProductionWeek,
  fetchGeneration,
  buildSelectionBatch,
  updateGeneration,
  assignGenerationToWeek,
  removeGenerationFromWeek,
} from '../lib/storage'
import { canRegenerateLaserSvg, regenerateLaserSvg } from '../lib/regenerateLaser'
import { loadTraceSettings } from '../lib/traceSettings'
import { ImageWithZoom } from '../components/ImageLightbox'
import BatchBuildIndicator, { SpinnerIcon, yieldToUi } from '../components/BatchBuildIndicator'

const THUMB_SIZE_KEY = 'mn_admin_thumb_v2'

const STATUS_STYLES = {
  running: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  done: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
}

const STATUS_OPTIONS = [
  { value: 'running', label: 'En cours' },
  { value: 'done', label: 'Terminé' },
  { value: 'error', label: 'Erreur' },
]

const WEEK_STATUS_LABELS = {
  open: 'Ouverte',
  in_production: 'En production',
  shipped: 'Expédiée',
  closed: 'Clôturée',
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatFabricationMardiLabel(week) {
  if (week.fabricationLabel) return week.fabricationLabel
  const ymd = week.cutoff_at
    ? new Date(week.cutoff_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
    : (() => {
      const ship = new Date(`${week.ship_date || week.week_key}T12:00:00`)
      const tue = new Date(ship.getTime() - 3 * 86400000)
      return tue.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
    })()
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function hasLaserSvg(gen) {
  return (gen.steps ?? []).some(s => s.asset_type === 'laser_merged' && s.image_url)
}

function thumbFor(gen) {
  const steps = gen.steps ?? []
  return steps.find(s => s.asset_type === 'step2')?.image_url
    || steps.find(s => s.asset_type === 'step1')?.image_url
    || steps.find(s => s.asset_type === 'source')?.image_url
}

function useThumbSize() {
  const [thumbSize, setThumbSize] = useState(() => {
    try {
      return localStorage.getItem(THUMB_SIZE_KEY) || 'small'
    } catch {
      return 'small'
    }
  })

  const setSize = useCallback(size => {
    setThumbSize(size)
    try { localStorage.setItem(THUMB_SIZE_KEY, size) } catch { /* ignore */ }
  }, [])

  return [thumbSize, setSize]
}

function WeekEditionPanel({ weekKey, onWeekChange, onWeekUpdated }) {
  const [weeksMeta, setWeeksMeta] = useState({ weeks: [], currentWeekKey: null })
  const [weekDetail, setWeekDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assignBusyId, setAssignBusyId] = useState(null)
  const [removeBusyId, setRemoveBusyId] = useState(null)

  const loadWeeks = useCallback(async () => {
    try {
      setWeeksMeta(await fetchProductionWeeks())
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const loadDetail = useCallback(async () => {
    if (!weekKey) {
      setWeekDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setWeekDetail(await fetchProductionWeek(weekKey))
    } catch (err) {
      setError(err.message)
      setWeekDetail(null)
    } finally {
      setLoading(false)
    }
  }, [weekKey])

  useEffect(() => { loadWeeks() }, [loadWeeks])
  useEffect(() => { loadDetail() }, [loadDetail])

  const handleAssignGeneration = async (generationId) => {
    if (!weekKey) return
    setAssignBusyId(generationId)
    setError(null)
    try {
      await assignGenerationToWeek(weekKey, generationId)
      await loadDetail()
      onWeekUpdated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setAssignBusyId(null)
    }
  }

  const handleRemoveOrder = async (orderId) => {
    if (!window.confirm('Retirer cette génération de l\'édition ? La commande admin sera annulée.')) return
    setRemoveBusyId(orderId)
    setError(null)
    try {
      await removeGenerationFromWeek(orderId)
      await loadDetail()
      onWeekUpdated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setRemoveBusyId(null)
    }
  }

  const selectedWeek = weeksMeta.weeks.find(w => w.week_key === weekKey)
  const capacity = weekDetail?.capacity ?? selectedWeek?.capacity ?? 100
  const sold = weekDetail?.soldCount ?? selectedWeek?.sold_count ?? 0

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-1 min-w-[200px]">
          <label className="text-xs text-stone-500 uppercase tracking-wide">Édition du Mardi</label>
          <select
            value={weekKey}
            onChange={e => onWeekChange(e.target.value)}
            className="w-full max-w-md rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200"
          >
            <option value="">Toutes les semaines</option>
            {weeksMeta.weeks.map(w => (
              <option key={w.id} value={w.week_key}>
                Fabrication {formatFabricationMardiLabel(w)}
                {w.week_key === weeksMeta.currentWeekKey ? ' · en cours' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {weekKey && (
        <>
          {loading && <p className="text-sm text-stone-500">Chargement édition…</p>}
          {!loading && weekDetail && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-lg bg-stone-950/80 border border-stone-800 p-3">
                <p className="text-stone-500 text-xs mb-1">Commandes payées</p>
                <p className="text-stone-100 font-semibold">{weekDetail.orderCount}</p>
              </div>
              <div className="rounded-lg bg-stone-950/80 border border-stone-800 p-3">
                <p className="text-stone-500 text-xs mb-1">Personnages</p>
                <p className="text-stone-100 font-semibold">{sold} / {capacity}</p>
              </div>
              <div className="rounded-lg bg-stone-950/80 border border-stone-800 p-3">
                <p className="text-stone-500 text-xs mb-1">Statut</p>
                <p className="text-stone-100 font-semibold">
                  {WEEK_STATUS_LABELS[weekDetail.status] ?? weekDetail.status}
                </p>
              </div>
              <div className="rounded-lg bg-stone-950/80 border border-stone-800 p-3">
                <p className="text-stone-500 text-xs mb-1">SVG laser prêts</p>
                <p className="text-stone-100 font-semibold">
                  {weekDetail.orders.filter(o => o.hasLaserSvg).length} / {weekDetail.orderCount}
                </p>
              </div>
            </div>
          )}

          {!loading && weekDetail && (
            <div className="rounded-lg border border-stone-800 bg-stone-950/50 p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-stone-200">Ajouter des générations à cette édition</h4>
                <p className="text-xs text-stone-500 mt-1">
                  La planche batch regroupe les commandes de l&apos;édition.
                  Ajoutez une génération libre — le nombre de personnages réel est conservé.
                </p>
              </div>
              {(weekDetail.availableGenerations ?? []).length === 0 ? (
                <p className="text-xs text-stone-500">Aucune génération libre (non rattachée à une commande).</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {weekDetail.availableGenerations.map(gen => (
                    <div
                      key={gen.id}
                      className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-900/60 p-2"
                    >
                      <div className="w-14 h-14 rounded-md bg-stone-800 overflow-hidden shrink-0">
                        {gen.thumbUrl
                          ? <img src={gen.thumbUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-stone-600 text-xs">—</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-stone-200 truncate">{formatDate(gen.createdAt)}</p>
                        <p className="text-[10px] text-stone-500">
                          {gen.faceCount != null ? `${gen.faceCount} persos` : '—'}
                          {' · '}
                          {gen.status}
                          {' · '}
                          laser {gen.hasLaserSvg ? '✓' : '—'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={assignBusyId === gen.id}
                          onClick={() => handleAssignGeneration(gen.id)}
                          className="rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-2.5 py-1.5 text-xs font-medium text-stone-950"
                        >
                          {assignBusyId === gen.id ? '…' : 'Ajouter'}
                        </button>
                        <Link
                          to={`/admin/g/${gen.id}`}
                          className="text-[10px] text-center text-amber-500/90 hover:text-amber-400"
                        >
                          Ouvrir
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && weekDetail?.orders?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-stone-500 border-b border-stone-800">
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Pack</th>
                    <th className="py-2 pr-3 font-medium">Persos</th>
                    <th className="py-2 pr-3 font-medium">Laser</th>
                    <th className="py-2 pr-3 font-medium">Génération</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {weekDetail.orders.map(o => (
                    <tr key={o.id} className="border-b border-stone-800/60 text-stone-300">
                      <td className="py-2 pr-3">
                        {o.customerName || o.email || o.id.slice(0, 8)}
                        {o.isAdmin && <span className="ml-1 text-[9px] text-stone-500">(admin)</span>}
                      </td>
                      <td className="py-2 pr-3">{o.packType}</td>
                      <td className="py-2 pr-3">{o.faceCount}</td>
                      <td className="py-2 pr-3">{o.hasLaserSvg ? '✓' : '—'}</td>
                      <td className="py-2 pr-3">
                        {o.generationId
                          ? <Link to={`/admin/g/${o.generationId}`} className="text-amber-500 hover:text-amber-400">Ouvrir</Link>
                          : '—'}
                      </td>
                      <td className="py-2">
                        {o.isAdmin && (
                          <button
                            type="button"
                            disabled={removeBusyId === o.id}
                            onClick={() => handleRemoveOrder(o.id)}
                            className="text-red-400/80 hover:text-red-300 disabled:opacity-50"
                          >
                            {removeBusyId === o.id ? '…' : 'Retirer'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
      )}
    </div>
  )
}

export default function AdminGenerationsPage() {
  const [generations, setGenerations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [weekKey, setWeekKey] = useState('')
  const [weekGenerationIds, setWeekGenerationIds] = useState(null)
  const [thumbSize, setThumbSize] = useThumbSize()
  const [statusBusyId, setStatusBusyId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [batchSelectBusy, setBatchSelectBusy] = useState(false)
  const [laserBulkBusy, setLaserBulkBusy] = useState(false)
  const [laserBulkProgress, setLaserBulkProgress] = useState(null)
  const [lastBatchResult, setLastBatchResult] = useState(null)
  const lastSelectedIndexRef = useRef(null)

  const filteredGenerations = useMemo(() => {
    if (!weekKey || !weekGenerationIds) return generations
    return generations.filter(g => weekGenerationIds.has(g.id))
  }, [generations, weekKey, weekGenerationIds])

  const filteredGenerationsRef = useRef(filteredGenerations)
  useEffect(() => {
    filteredGenerationsRef.current = filteredGenerations
  }, [filteredGenerations])

  const findSelectionAnchorIndex = useCallback((selected, list) => {
    if (lastSelectedIndexRef.current != null) return lastSelectedIndexRef.current
    for (let i = list.length - 1; i >= 0; i--) {
      if (selected.has(list[i]?.id)) return i
    }
    return 0
  }, [])

  const toggleSelect = useCallback((id, index, shiftKey) => {
    if (shiftKey) {
      setSelectedIds(prev => {
        const list = filteredGenerationsRef.current
        const anchor = prev.size === 0 ? 0 : findSelectionAnchorIndex(prev, list)
        const start = Math.min(anchor, index)
        const end = Math.max(anchor, index)
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          const rowId = list[i]?.id
          if (rowId) next.add(rowId)
        }
        return next
      })
      return
    }

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastSelectedIndexRef.current = index
  }, [findSelectionAnchorIndex])

  const batchBuildingLabel = batchSelectBusy
    ? `Planche batch (${selectedIds.size})…`
    : laserBulkBusy
      ? (laserBulkProgress ?? 'Regénération SVG…')
      : null

  const anySelectionBusy = batchSelectBusy || laserBulkBusy

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    lastSelectedIndexRef.current = null
  }, [])

  const runSelectionBatch = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBatchSelectBusy(true)
    setError(null)
    setLastBatchResult(null)
    await yieldToUi()
    try {
      const result = await buildSelectionBatch(ids, { weekKey: weekKey || undefined, dryRun: false })
      setLastBatchResult({
        url: result.batchSvgUrl,
        builtAt: result.builtAt ?? new Date().toISOString(),
        placementCount: result.placementCount,
        generationCount: result.generationCount,
      })
      clearSelection()
      startTransition(() => {
        loadGenerations()
        if (weekKey) refreshWeekGenerations()
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setBatchSelectBusy(false)
    }
  }

  const selectedGenerations = useMemo(
    () => generations.filter(g => selectedIds.has(g.id)),
    [generations, selectedIds],
  )
  const selectedWithLaser = selectedGenerations.filter(hasLaserSvg).length
  const selectedCanRegenLaser = selectedGenerations.filter(g => canRegenerateLaserSvg(g.steps)).length

  const runBulkLaserRegen = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setLaserBulkBusy(true)
    setError(null)
    const traceSettings = loadTraceSettings()
    let ok = 0
    let failed = 0
    let skipped = 0
    await yieldToUi()
    try {
      for (let i = 0; i < ids.length; i++) {
        const genId = ids[i]
        setLaserBulkProgress(`SVG ${i + 1}/${ids.length}…`)
        await yieldToUi()
        try {
          const data = await fetchGeneration(genId)
          if (!canRegenerateLaserSvg(data.steps)) {
            skipped++
            continue
          }
          await regenerateLaserSvg({
            generationId: genId,
            steps: data.steps,
            faceCount: data.generation.face_count,
            traceSettings,
            source: 'admin_laser_bulk',
          })
          ok++
        } catch {
          failed++
        }
      }
      if (failed > 0) {
        setError(`${failed} échec(s) sur ${ids.length} — ${ok} SVG regénéré(s)${skipped ? `, ${skipped} sans extraction` : ''}.`)
      } else if (skipped > 0 && ok === 0) {
        setError(`Aucune génération prête — lancez l'extraction PNG d'abord (${skipped} ignorée(s)).`)
      }
      clearSelection()
      startTransition(() => loadGenerations())
    } catch (err) {
      setError(err.message)
    } finally {
      setLaserBulkBusy(false)
      setLaserBulkProgress(null)
    }
  }

  const handleStatusChange = async (genId, status) => {
    setStatusBusyId(genId)
    setError(null)
    try {
      await updateGeneration(genId, { status })
      setGenerations(prev => prev.map(g => (g.id === genId ? { ...g, status } : g)))
    } catch (err) {
      setError(err.message)
    } finally {
      setStatusBusyId(null)
    }
  }

  const loadGenerations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGenerations(await fetchGenerations())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGenerations() }, [loadGenerations])

  useEffect(() => {
    let cancelled = false
    fetchProductionWeeks()
      .then(({ currentWeekKey }) => {
        if (!cancelled && currentWeekKey) setWeekKey(currentWeekKey)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const refreshWeekGenerations = useCallback(() => {
    if (!weekKey) {
      setWeekGenerationIds(null)
      return
    }
    fetchProductionWeek(weekKey)
      .then(data => setWeekGenerationIds(new Set(data.generationIds ?? [])))
      .catch(() => setWeekGenerationIds(new Set()))
  }, [weekKey])

  useEffect(() => {
    refreshWeekGenerations()
  }, [refreshWeekGenerations])

  const gridClass = thumbSize === 'small'
    ? 'grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
    : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'

  const aspectClass = thumbSize === 'small' ? 'aspect-square' : 'aspect-video'
  const showSelectionBar = selectedIds.size > 0 || lastBatchResult

  return (
    <div className={`space-y-5 ${showSelectionBar ? 'pb-28' : ''}`}>
      <WeekEditionPanel
        weekKey={weekKey}
        onWeekChange={setWeekKey}
        onWeekUpdated={() => {
          refreshWeekGenerations()
          loadGenerations()
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-stone-400 text-sm">
          {filteredGenerations.length} génération{filteredGenerations.length !== 1 ? 's' : ''}
          {weekKey ? ' pour cette édition' : ''}
          {selectedIds.size > 0 && (
            <span className="text-amber-400"> · {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
          )}
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="flex rounded-lg border border-stone-700 p-0.5 text-xs">
            {['small', 'large'].map(size => (
              <button
                key={size}
                type="button"
                onClick={() => setThumbSize(size)}
                className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                  thumbSize === size
                    ? 'bg-stone-700 text-stone-100'
                    : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                {size === 'small' ? 'Petites' : 'Grandes'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadGenerations}
            disabled={loading}
            className="text-sm text-amber-500 hover:text-amber-400 disabled:opacity-50"
          >
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && selectedWithLaser < selectedIds.size && (
        <p className="text-sm text-stone-500">
          {selectedIds.size - selectedWithLaser} sans SVG laser — un gabarit placeholder sera utilisé sur la planche.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {!loading && !error && filteredGenerations.length === 0 && (
        <p className="text-stone-500 text-center py-16">
          {weekKey
            ? 'Aucune génération dans cette édition. Utilisez la section « Ajouter des générations » ci-dessus.'
            : 'Aucune génération enregistrée.'}
        </p>
      )}

      <div className={gridClass}>
        {filteredGenerations.map((gen, index) => {
          const selected = selectedIds.has(gen.id)
          const laserReady = hasLaserSvg(gen)
          return (
          <div
            key={gen.id}
            className={`group rounded-xl border bg-stone-900/50 hover:bg-stone-900 transition-colors overflow-hidden ${
              selected ? 'border-amber-500 ring-2 ring-amber-500/40' : 'border-stone-800 hover:border-stone-600'
            }`}
          >
            <div className={`${aspectClass} bg-stone-800 overflow-hidden relative`}>
              <button
                type="button"
                aria-label={selected ? 'Désélectionner' : 'Sélectionner'}
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleSelect(gen.id, index, e.shiftKey)
                }}
                className={`absolute top-2 left-2 z-20 w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${
                  selected
                    ? 'bg-amber-500 border-amber-400 text-stone-950'
                    : 'bg-stone-950/80 border-stone-600 text-stone-400 hover:border-amber-500/60'
                }`}
              >
                {selected ? '✓' : ''}
              </button>
              {!laserReady && (
                <span className="absolute top-2 right-2 z-20 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-950/90 text-stone-500 border border-stone-700">
                  placeholder batch
                </span>
              )}
              <Link to={`/admin/g/${gen.id}`} className="block w-full h-full">
                {thumbFor(gen)
                  ? (
                    <ImageWithZoom
                      src={thumbFor(gen)}
                      label={formatDate(gen.created_at)}
                      className="w-full h-full"
                      imgClassName="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                    />
                  )
                  : <div className="w-full h-full flex items-center justify-center text-stone-600">—</div>
                }
              </Link>
            </div>
            <div className={`space-y-1.5 ${thumbSize === 'small' ? 'p-2' : 'p-3'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to={`/admin/g/${gen.id}`}
                  className={`font-medium text-stone-200 hover:text-stone-100 ${thumbSize === 'small' ? 'text-xs' : 'text-sm'}`}
                >
                  {formatDate(gen.created_at)}
                </Link>
                <select
                  value={gen.status}
                  disabled={statusBusyId === gen.id}
                  onChange={e => handleStatusChange(gen.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className={`rounded-full border px-2 py-0.5 font-semibold disabled:opacity-50 ${STATUS_STYLES[gen.status] ?? 'border-stone-700 text-stone-300'} ${thumbSize === 'small' ? 'text-[9px]' : 'text-[10px]'}`}
                >
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value} className="bg-stone-900 text-stone-200 normal-case">
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {thumbSize === 'large' && (
                <p className="text-xs text-stone-500">
                  {gen.face_count != null ? `${gen.face_count} visage${gen.face_count > 1 ? 's' : ''} · ` : ''}
                  {gen.resolution} · {gen.aspect_ratio}
                </p>
              )}
            </div>
          </div>
          )
        })}
      </div>

      {showSelectionBar && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-stone-800 bg-stone-950/95 backdrop-blur-sm shadow-[0_-8px_30px_rgba(0,0,0,0.35)]">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            {selectedIds.size > 0 ? (
              <>
                <p className="text-sm text-stone-300">
                  <span className="font-semibold text-amber-400">{selectedIds.size}</span>
                  {' '}sélectionnée{selectedIds.size > 1 ? 's' : ''}
                  <span className="text-stone-600 text-xs ml-2">Shift+clic : plage depuis la dernière sélection (ou la 1ʳᵉ)</span>
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={anySelectionBusy}
                    className="text-sm text-stone-500 hover:text-stone-300 disabled:opacity-50 px-2 py-1.5"
                  >
                    Tout désélectionner
                  </button>
                  <button
                    type="button"
                    disabled={anySelectionBusy || selectedCanRegenLaser === 0}
                    onClick={runBulkLaserRegen}
                    className="inline-flex items-center gap-2 rounded-lg border border-stone-600 hover:border-amber-500/60 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-stone-200"
                    title={selectedCanRegenLaser === 0 ? 'Extraction PNG requise' : undefined}
                  >
                    {laserBulkBusy && <SpinnerIcon className="w-4 h-4" />}
                    {laserBulkBusy ? 'Regénération…' : `Regénérer SVG (${selectedCanRegenLaser})`}
                  </button>
                  <button
                    type="button"
                    disabled={anySelectionBusy}
                    onClick={runSelectionBatch}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-stone-950"
                  >
                    {batchSelectBusy && <SpinnerIcon className="w-4 h-4" />}
                    {batchSelectBusy ? 'Génération…' : 'Générer Batch SVG'}
                  </button>
                </div>
              </>
            ) : lastBatchResult ? (
              <div className="flex flex-wrap items-center gap-3 w-full justify-between">
                <p className="text-sm text-emerald-400">
                  Planche créée — {lastBatchResult.placementCount} génération{lastBatchResult.placementCount > 1 ? 's' : ''}
                  <span className="text-stone-500 ml-2">
                    {new Date(lastBatchResult.builtAt).toLocaleString('fr-FR', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={lastBatchResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950"
                  >
                    Voir le SVG
                  </a>
                  <a
                    href={lastBatchResult.url}
                    download
                    className="rounded-lg border border-stone-600 hover:border-stone-400 px-4 py-2 text-sm text-stone-200"
                  >
                    Télécharger
                  </a>
                  <button
                    type="button"
                    onClick={() => setLastBatchResult(null)}
                    className="text-sm text-stone-500 hover:text-stone-300 px-2"
                    aria-label="Fermer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <BatchBuildIndicator label={batchBuildingLabel} />
    </div>
  )
}
