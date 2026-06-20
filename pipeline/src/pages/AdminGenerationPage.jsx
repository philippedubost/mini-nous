import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import VersionGallery from '../components/VersionGallery'
import { ImageWithZoom } from '../components/ImageLightbox'
import LaserStudioPanel from '../components/LaserStudioPanel'
import { buildPrompt1, resolveImageUrls, STEP_LABELS, DEFAULT_FAL_STEP_RESOLUTION, normalizeResolution, falStepFormat, loadSettings } from '../lib/settings'
import Spinner, { SpinnerBlock } from '../components/Spinner'
import { loadTraceSettings } from '../lib/traceSettings'
import { extractAndBuildLaserSvg, svgToDataUrl } from '../lib/laserPipeline'
import { regenerateLaserSvg } from '../lib/regenerateLaser'
import { runFalStep } from '../lib/fal'
import {
  fetchGeneration, selectVersion, deleteVersion, uploadAsset, urlMapFromSteps, updateGeneration,
} from '../lib/storage'

const REFERENCE_LINE_URL = `${import.meta.env.BASE_URL}referenceLine2.png`

const STATUS_STYLES = {
  running: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  done: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
}

const STATUS_LABELS = {
  running: 'En cours — modifiable, prêt pour une nouvelle impression',
  done: 'Terminé — pipeline complet',
  error: 'Erreur',
}

const ASSET_SECTIONS = [
  { types: ['step1'], label: 'Étape 1 — Mise en scène', rerunnable: 'fal', settingsIndex: 0 },
  { types: ['step2'], label: 'Étape 2 — Line art', rerunnable: 'fal', settingsIndex: 1 },
  { types: ['outline', 'outline_bulk', 'gravure', 'overlay'], label: 'Étape 3 — Extraction PNG', rerunnable: 'extraction' },
  { types: ['laser_merged'], label: 'SVG laser fusionné', rerunnable: 'laser_svg' },
]

function sectionBusyKey(section) {
  if (section.rerunnable === 'fal') return section.types[0]
  return section.rerunnable
}

function busyLabel(busy) {
  if (busy === 'step1' || busy === 'step2') return 'Génération fal.ai…'
  if (busy === 'extraction') return 'Extraction des contours…'
  if (busy === 'laser_svg') return 'Génération SVG laser…'
  if (busy === 'select') return 'Changement de version…'
  if (busy === 'delete') return 'Suppression…'
  return 'Traitement…'
}

const HERO_PANELS = [
  { type: 'source', label: 'Photo source' },
  { type: 'step1', label: 'Mise en scène' },
  { type: 'step2', label: 'Line art' },
]

function GenerationHero({ steps }) {
  const activeStep = Object.fromEntries((steps ?? []).map(s => [s.asset_type, s]))

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-stone-800">
        {HERO_PANELS.map(({ type, label }) => {
          const url = activeStep[type]?.image_url
          return (
            <div key={type} className="flex flex-col min-h-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 px-4 py-2.5 border-b border-stone-800 bg-stone-950/60">
                {label}
              </p>
              <div className="aspect-[4/3] bg-white flex items-center justify-center p-3 min-h-[180px]">
                {url
                  ? (
                    <ImageWithZoom
                      src={url}
                      label={label}
                      className="w-full h-full"
                      imgClassName="w-full h-full object-contain"
                    />
                  )
                  : <span className="text-stone-400 text-sm">Non disponible</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminGenerationPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [log, setLog] = useState(null)
  const [prompts, setPrompts] = useState({ step1: '', step2: '' })
  const [resolutions, setResolutions] = useState({ step1: DEFAULT_FAL_STEP_RESOLUTION, step2: DEFAULT_FAL_STEP_RESOLUTION })
  const [statusBusy, setStatusBusy] = useState(false)
  const [studioExpanded, setStudioExpanded] = useState(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const result = await fetchGeneration(id)
      setData(result)
      const settings = result.generation.settings
      if (settings?.steps) {
        setPrompts({
          step1: buildPrompt1(result.generation.face_count, settings.steps[0]?.prompt ?? ''),
          step2: settings.steps[1]?.prompt ?? '',
        })
        setResolutions({
          step1: normalizeResolution(settings.steps[0]?.resolution ?? result.generation.resolution),
          step2: normalizeResolution(settings.steps[1]?.resolution ?? result.generation.resolution),
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleSelectVersion = async (versionId) => {
    if (busy) return
    setBusy('select')
    try {
      await selectVersion(id, versionId)
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const handleStatusChange = async (status) => {
    if (statusBusy || !data || data.generation.status === status) return
    setStatusBusy(true)
    setError(null)
    try {
      const generation = await updateGeneration(id, { status })
      setData(prev => ({ ...prev, generation }))
    } catch (err) {
      setError(err.message)
    } finally {
      setStatusBusy(false)
    }
  }

  const handleDeleteVersion = async (versionId, versionNum) => {
    if (busy) return
    const label = versionNum != null ? `v${versionNum}` : 'cette version'
    if (!window.confirm(`Supprimer ${label} ? L'image sera effacée du stockage R2 et ne s'affichera plus.`)) {
      return
    }
    setBusy('delete')
    setError(null)
    try {
      await deleteVersion(id, versionId)
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const buildSettingsPayload = useCallback(() => {
    const defaults = loadSettings()
    const base = structuredClone(data?.generation?.settings ?? defaults)
    if (!Array.isArray(base.steps)) base.steps = structuredClone(defaults.steps)
    while (base.steps.length < 3) base.steps.push(structuredClone(defaults.steps[base.steps.length] ?? {}))

    const step0Prompt = prompts.step1.replace(
      data.generation.face_count > 0 ? `ces ${data.generation.face_count} personnes` : 'ces personnes',
      'ces personnes',
    )
    base.steps[0] = { ...base.steps[0], prompt: step0Prompt, resolution: normalizeResolution(resolutions.step1) }
    base.steps[1] = { ...base.steps[1], prompt: prompts.step2, resolution: normalizeResolution(resolutions.step2) }
    return base
  }, [data, prompts, resolutions])

  const persistGenerationSettings = useCallback(async () => {
    if (!data?.generation) return null
    const settings = buildSettingsPayload()
    const generation = await updateGeneration(id, { settings })
    setData(prev => (prev ? { ...prev, generation } : prev))
    return generation
  }, [buildSettingsPayload, data, id])

  const runFalRerun = async (assetType, settingsIndex) => {
    if (!data) return
    const gen = data.generation
    const defaults = loadSettings()
    const settings = gen.settings ?? defaults
    const stepCfg = settings.steps?.[settingsIndex] ?? defaults.steps?.[settingsIndex]
    if (!stepCfg) return

    setBusy(assetType)
    setLog('Préparation…')
    setError(null)

    try {
      try {
        await persistGenerationSettings()
      } catch (saveErr) {
        console.warn('[admin] settings save:', saveErr.message)
      }

      const urlMap = urlMapFromSteps(data.steps)
      const prompt = assetType === 'step1' ? prompts.step1 : prompts.step2
      const resolution = normalizeResolution(resolutions[assetType])
      const fmt = { ...falStepFormat({ resolution }, gen), resolution }
      const imgs = resolveImageUrls(stepCfg.imageInputs, urlMap)
      if (!imgs.length) throw new Error('Images sources manquantes pour cette étape')

      setLog('Envoi fal.ai…')
      const falUrl = await runFalStep(
        { ...stepCfg, ...fmt, prompt },
        imgs,
        setLog,
      )

      setLog('Enregistrement…')
      await uploadAsset(id, assetType, {
        url: falUrl,
        falUrl,
        prompt,
        status: 'done',
        source: 'admin_rerun',
        metadata: { resolution },
      })
      await load({ silent: true })
      setLog(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const runExtraction = async () => {
    if (!data) return
    const step2Url = data.steps.find(s => s.asset_type === 'step2')?.image_url
    const photoUrl = data.steps.find(s => s.asset_type === 'step1')?.image_url
    if (!step2Url) {
      setError('Aucune image step2 active — sélectionnez ou générez une version step2.')
      return
    }

    setBusy('extraction')
    setError(null)
    setLog('Chargement line art…')
    try {
      const gen = data.generation
      const { layers, merged } = await extractAndBuildLaserSvg({
        step2Url,
        photoUrl,
        faceCount: gen.face_count,
        traceSettings: loadTraceSettings(),
        onProgress: setLog,
      })
      setLog('Upload découpe, masque, gravure, overlay, SVG laser…')
      const traceSettingsSnapshot = loadTraceSettings()
      const laserMergedUrl = svgToDataUrl(merged)
      await Promise.all([
        uploadAsset(id, 'outline', {
          base64: layers.outline.toDataURL('image/png'),
          status: 'done',
          source: 'admin_extraction',
        }),
        uploadAsset(id, 'outline_bulk', {
          base64: layers.outlineBulky.toDataURL('image/png'),
          status: 'done',
          source: 'admin_extraction',
        }),
        uploadAsset(id, 'gravure', {
          base64: layers.gravure.toDataURL('image/png'),
          status: 'done',
          source: 'admin_extraction',
        }),
        uploadAsset(id, 'overlay', {
          base64: layers.overlay.toDataURL('image/png'),
          status: 'done',
          source: 'admin_extraction',
        }),
        uploadAsset(id, 'laser_merged', {
          base64: laserMergedUrl,
          status: 'done',
          source: 'admin_extraction',
          metadata: { traceSettings: traceSettingsSnapshot },
        }),
      ])
      await load({ silent: true })
      setLog(null)
    } catch (err) {
      setError(err.message || 'Échec de l\'extraction')
    } finally {
      setBusy(null)
    }
  }

  const runLaserSvgRegen = async () => {
    if (!data) return
    setBusy('laser_svg')
    setError(null)
    setLog('Génération SVG laser…')
    try {
      const traceSettingsSnapshot = loadTraceSettings()
      await regenerateLaserSvg({
        generationId: id,
        steps: data.steps ?? [],
        faceCount: data.generation.face_count,
        traceSettings: traceSettingsSnapshot,
        onProgress: setLog,
      })
      await load({ silent: true })
      setLog(null)
    } catch (err) {
      setError(err.message || 'Échec regénération SVG')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <SpinnerBlock label="Chargement de la génération…" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Link to="/admin" className="text-sm text-stone-500 hover:text-stone-300">← Générations</Link>
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  const gen = data.generation
  const fabrication = data.fabrication ?? gen.fabrication ?? null
  const versionsByType = data.versionsByType ?? {}
  const activeStep = Object.fromEntries((data.steps ?? []).map(s => [s.asset_type, s]))
  const refImageUrl = activeStep.ref?.image_url ?? REFERENCE_LINE_URL

  return (
    <div className="space-y-6 relative">
      {(busy === 'select' || busy === 'delete') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-[1px]">
          <SpinnerBlock label={busyLabel(busy)} />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin" className="text-sm text-stone-500 hover:text-stone-300">← Générations</Link>
          <h2 className="text-xl font-bold text-stone-100 mt-1">{formatDate(gen.created_at)}</h2>
          <p className="text-sm text-stone-500 mt-1">
            {gen.face_count != null ? `${gen.face_count} visages · ` : ''}
            {gen.resolution} · {gen.aspect_ratio}
            <span className="ml-2 text-stone-600 font-mono text-xs">{gen.id}</span>
          </p>
          {fabrication && (
            <p className="text-sm text-sky-300 mt-2">
              {fabrication.label}
              {fabrication.at && (
                <span className="text-stone-500 text-xs ml-2">
                  ({new Date(fabrication.at).toLocaleString('fr-FR')})
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <label htmlFor="gen-status" className="text-[10px] uppercase tracking-wide text-stone-500">
              Statut
            </label>
            <select
              id="gen-status"
              value={gen.status}
              disabled={statusBusy || !!busy}
              onChange={e => handleStatusChange(e.target.value)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${STATUS_STYLES[gen.status] ?? 'border-stone-700 text-stone-300'}`}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value} className="bg-stone-900 text-stone-200">
                  {label.split(' — ')[0]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-stone-500 max-w-xs">
              {STATUS_LABELS[gen.status] ?? gen.status}
            </p>
          </div>
          {gen.status === 'done' && (
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => handleStatusChange('running')}
              className="rounded-lg border border-amber-600/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300 hover:border-amber-500 disabled:opacity-50"
            >
              Réouvrir pour impression
            </button>
          )}
          <button
            type="button"
            onClick={() => load({ silent: true })}
            disabled={loading}
            className="text-sm text-amber-500 hover:text-amber-400 disabled:opacity-50 self-end"
          >
            Actualiser
          </button>
        </div>
      </div>

      <GenerationHero steps={data.steps} />

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
      )}

      {log && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200 font-mono flex items-start gap-3">
          {busy && <Spinner className="mt-0.5" />}
          <span className="flex-1 whitespace-pre-wrap">{log}</span>
        </div>
      )}

      {ASSET_SECTIONS.map(section => {
        const sectionKey = sectionBusyKey(section)
        const sectionBusy = busy === sectionKey
        return (
        <section
          key={section.label}
          className="relative rounded-2xl border border-stone-800 bg-stone-900/40 p-5 space-y-4"
        >
          {sectionBusy && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-stone-950/75 backdrop-blur-[2px]">
              <SpinnerBlock label={busyLabel(busy)} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-stone-200">{section.label}</h3>
            {section.rerunnable === 'fal' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => runFalRerun(section.types[0], section.settingsIndex)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-sm font-semibold"
              >
                {sectionBusy && <Spinner size="sm" className="border-stone-950/30 border-t-stone-950" />}
                {sectionBusy ? 'Génération…' : 'Relancer fal.ai'}
              </button>
            )}
            {section.rerunnable === 'extraction' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={runExtraction}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-sm font-semibold"
              >
                {sectionBusy && <Spinner size="sm" className="border-stone-950/30 border-t-stone-950" />}
                {sectionBusy ? 'Extraction…' : 'Ré-extraire les contours'}
              </button>
            )}
            {section.rerunnable === 'laser_svg' && !studioExpanded && (
              <button
                type="button"
                disabled={!!busy}
                onClick={runLaserSvgRegen}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-sm font-semibold"
              >
                {sectionBusy && <Spinner size="sm" className="border-stone-950/30 border-t-stone-950" />}
                {sectionBusy ? 'Génération…' : 'Régénérer SVG laser avec paramètres du Labo'}
              </button>
            )}
          </div>

          {section.rerunnable === 'laser_svg' && (
            <>
              <LaserStudioPanel
                embedded
                expanded={studioExpanded}
                onExpandedChange={setStudioExpanded}
                generationId={id}
                steps={data.steps}
                faceCount={gen.face_count}
                generationData={data}
                disabled={!!busy}
                onSaved={() => load({ silent: true })}
              />
              <p className="text-xs text-stone-500">
                {studioExpanded
                  ? 'Le bouton « Générer SVG avec paramètres Studio » enregistre une nouvelle version avec les réglages du panneau ci-dessus.'
                  : 'Le bouton « Régénérer SVG laser avec paramètres du Labo » applique les paramètres globaux du pipeline sans ouvrir le studio.'}
                {' '}
                <Link to={`/lab/trace?gen=${id}`} className="text-amber-500/90 hover:text-amber-400">Labo trace →</Link>
              </p>
            </>
          )}

          {section.rerunnable === 'fal' && (
            <div className="space-y-3">
              {section.types[0] === 'step2' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Référence line art (style)
                  </p>
                  <div className="max-w-[220px] rounded-lg border border-stone-700 bg-white p-2">
                    <ImageWithZoom
                      src={refImageUrl}
                      label="Référence line art"
                      className="w-full"
                      imgClassName="w-full h-auto object-contain"
                    />
                  </div>
                  <p className="text-[10px] text-stone-600 leading-snug">
                    2e image envoyée à fal.ai avec la mise en scène (étape 1).
                  </p>
                </div>
              )}
              <div className="space-y-1.5 max-w-xs">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Résolution</label>
                <p className="text-sm text-stone-300 px-1">{DEFAULT_FAL_STEP_RESOLUTION}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Prompt</label>
                <textarea
                  className="w-full rounded-lg bg-stone-800 border border-stone-700 text-stone-100 text-sm p-3 font-mono min-h-24 focus:outline-none focus:border-amber-500"
                  value={prompts[section.types[0]]}
                  onChange={e => setPrompts(p => ({ ...p, [section.types[0]]: e.target.value }))}
                />
              </div>
            </div>
          )}

          {section.types.map(assetType => {
            const versions = versionsByType[assetType] ?? []
            const active = activeStep[assetType]
            const stepIndex = versions[0]?.step_index ?? 0
            return (
              <div key={assetType} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-stone-400">
                    {active?.label ?? assetType}
                  </p>
                  <span className="text-[10px] text-stone-600">
                    {STEP_LABELS[stepIndex] ?? ''} · {versions.length} version{versions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <VersionGallery
                  versions={versions}
                  selectedId={active?.active_version_id}
                  onSelect={handleSelectVersion}
                  onDelete={handleDeleteVersion}
                  disabled={!!busy}
                  assetLabel={active?.label ?? assetType}
                />
              </div>
            )
          })}
        </section>
        )
      })}
    </div>
  )
}
