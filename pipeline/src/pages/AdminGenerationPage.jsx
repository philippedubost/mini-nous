import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import VersionGallery from '../components/VersionGallery'
import { buildPrompt1, resolveImageUrls, STEP_LABELS } from '../lib/settings'
import { loadTraceSettings } from '../lib/traceSettings'
import { extractAndBuildLaserSvg, buildLaserSvgFromStoredLayers, svgToDataUrl } from '../lib/laserPipeline'
import { runFalStep } from '../lib/fal'
import {
  fetchGeneration, selectVersion, deleteVersion, uploadAsset, urlMapFromSteps,
} from '../lib/storage'

const ASSET_SECTIONS = [
  { types: ['source', 'ref'], label: 'Entrées', rerunnable: null },
  { types: ['step1'], label: 'Étape 1 — Mise en scène', rerunnable: 'fal', settingsIndex: 0 },
  { types: ['step2'], label: 'Étape 2 — Line art', rerunnable: 'fal', settingsIndex: 1 },
  { types: ['outline', 'outline_bulk', 'gravure', 'overlay'], label: 'Étape 3 — Extraction PNG', rerunnable: 'extraction' },
  { types: ['laser_merged'], label: 'SVG laser fusionné', rerunnable: 'laser_svg' },
]

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

  const runFalRerun = async (assetType, settingsIndex) => {
    if (!data) return
    const gen = data.generation
    const settings = gen.settings ?? {}
    const stepCfg = settings.steps?.[settingsIndex]
    if (!stepCfg) return

    setBusy(assetType)
    setLog(null)
    setError(null)

    try {
      const urlMap = urlMapFromSteps(data.steps)
      const prompt = assetType === 'step1' ? prompts.step1 : prompts.step2
      const globalFmt = { resolution: gen.resolution, aspectRatio: gen.aspect_ratio }
      const imgs = resolveImageUrls(stepCfg.imageInputs, urlMap)
      if (!imgs.length) throw new Error('Images sources manquantes pour cette étape')

      const falUrl = await runFalStep(
        { ...stepCfg, ...globalFmt, prompt },
        imgs,
        setLog,
      )

      await uploadAsset(id, assetType, {
        url: falUrl,
        falUrl,
        prompt,
        status: 'done',
        source: 'admin_rerun',
      })
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
      setLog(null)
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
    } catch (err) {
      setError(err.message || 'Échec de l\'extraction')
    } finally {
      setBusy(null)
      setLog(null)
    }
  }

  const runLaserSvgRegen = async () => {
    if (!data) return
    const steps = data.steps ?? []
    const outlineUrl = steps.find(s => s.asset_type === 'outline')?.image_url
    const outlineBulkyUrl = steps.find(s => s.asset_type === 'outline_bulk')?.image_url
    const gravureUrl = steps.find(s => s.asset_type === 'gravure')?.image_url
    const photoUrl = steps.find(s => s.asset_type === 'step1')?.image_url

    setBusy('laser_svg')
    setError(null)
    setLog('Génération SVG laser…')
    try {
      const gen = data.generation
      const traceSettingsSnapshot = loadTraceSettings()
      const merged = await buildLaserSvgFromStoredLayers({
        outlineUrl,
        outlineBulkyUrl,
        gravureUrl,
        photoUrl,
        faceCount: gen.face_count,
        traceSettings: traceSettingsSnapshot,
        onProgress: setLog,
      })
      setLog('Upload nouvelle version SVG…')
      await uploadAsset(id, 'laser_merged', {
        base64: svgToDataUrl(merged),
        status: 'done',
        source: 'admin_laser_regen',
        metadata: { traceSettings: traceSettingsSnapshot },
      })
      await load({ silent: true })
    } catch (err) {
      setError(err.message || 'Échec regénération SVG')
    } finally {
      setBusy(null)
      setLog(null)
    }
  }

  if (loading) {
    return <p className="text-stone-500 py-12 text-center">Chargement…</p>
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
  const versionsByType = data.versionsByType ?? {}
  const activeStep = Object.fromEntries((data.steps ?? []).map(s => [s.asset_type, s]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin" className="text-sm text-stone-500 hover:text-stone-300">← Générations</Link>
          <h2 className="text-xl font-bold text-stone-100 mt-1">{formatDate(gen.created_at)}</h2>
          <p className="text-sm text-stone-500 mt-1">
            {gen.face_count != null ? `${gen.face_count} visages · ` : ''}
            {gen.resolution} · {gen.aspect_ratio}
            <span className="ml-2 text-stone-600 font-mono text-xs">{gen.id}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => load({ silent: true })}
          disabled={loading}
          className="text-sm text-amber-500 hover:text-amber-400 disabled:opacity-50"
        >
          Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
      )}

      {log && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200 font-mono">
          {log}
        </div>
      )}

      {ASSET_SECTIONS.map(section => (
        <section
          key={section.label}
          className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-stone-200">{section.label}</h3>
            {section.rerunnable === 'fal' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => runFalRerun(section.types[0], section.settingsIndex)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-sm font-semibold"
              >
                {busy === section.types[0] ? 'Génération…' : 'Relancer fal.ai'}
              </button>
            )}
            {section.rerunnable === 'extraction' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={runExtraction}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-sm font-semibold"
              >
                {busy === 'extraction' ? 'Extraction…' : 'Ré-extraire les contours'}
              </button>
            )}
            {section.rerunnable === 'laser_svg' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={runLaserSvgRegen}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-sm font-semibold"
              >
                {busy === 'laser_svg' ? 'Génération…' : 'Regénérer SVG laser'}
              </button>
            )}
          </div>

          {section.rerunnable === 'laser_svg' && (
            <p className="text-xs text-stone-500">
              Stocké en base (Supabase + R2) avec numérotation v1, v2…
              {' '}
              « Regénérer » utilise les PNG actifs et les paramètres du labo.
              {' '}
              <Link to={`/lab?gen=${id}`} className="text-amber-500/90 hover:text-amber-400">Ouvrir le labo →</Link>
            </p>
          )}

          {section.rerunnable === 'fal' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Prompt</label>
              <textarea
                className="w-full rounded-lg bg-stone-800 border border-stone-700 text-stone-100 text-sm p-3 font-mono min-h-24 focus:outline-none focus:border-amber-500"
                value={prompts[section.types[0]]}
                onChange={e => setPrompts(p => ({ ...p, [section.types[0]]: e.target.value }))}
              />
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
      ))}
    </div>
  )
}
