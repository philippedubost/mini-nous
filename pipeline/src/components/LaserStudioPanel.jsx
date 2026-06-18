import { useCallback, useEffect, useMemo, useState } from 'react'
import ZoomableStage from './ZoomableStage'
import TraceSlider from './TraceSlider'
import { loadImageDataFromUrl } from '../lib/centerlineTrace'
import { buildGenerationLaserSvg, imageDataToCanvas, svgToDataUrl } from '../lib/laserPipeline'
import { processLineArt } from '../lib/outline'
import {
  buildTraceSettingsPayload,
  DEFAULT_MASK_CONTOUR_SW,
  DEFAULT_TRACE_SETTINGS,
  outlineOptsForExtraction,
  saveTraceSettings,
} from '../lib/traceSettings'
import { GRAVURE_TRACE_PARAMS, MASK_CONTOUR_PARAM, DECOUPE_PARAMS } from '../lib/traceParamDefs'
import {
  canRegenerateLaserSvg,
  stepUrl,
  traceSettingsFromGeneration,
} from '../lib/regenerateLaser'
import { uploadAsset } from '../lib/storage'

function svgPreview(svg) {
  if (!svg) return null
  return (
    <div
      className="relative w-full [&_svg]:max-w-none [&_svg]:w-full [&_svg]:h-auto bg-white rounded"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export default function LaserStudioPanel({
  generationId,
  steps,
  faceCount,
  generationData,
  disabled = false,
  embedded = false,
  expanded: expandedProp,
  onExpandedChange,
  onSaved,
}) {
  const [internalExpanded, setInternalExpanded] = useState(!embedded)
  const expanded = embedded ? (expandedProp ?? false) : (expandedProp ?? internalExpanded)
  const setExpanded = useCallback((value) => {
    onExpandedChange?.(value)
    if (!embedded || expandedProp === undefined) setInternalExpanded(value)
  }, [embedded, expandedProp, onExpandedChange])
  const initial = useMemo(
    () => traceSettingsFromGeneration(generationData ?? { steps }),
    [generationData, steps],
  )

  const [gravureOpts, setGravureOpts] = useState(initial.gravure)
  const [decoupeOpts, setDecoupeOpts] = useState(initial.decoupe)
  const [previewSvg, setPreviewSvg] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveLog, setSaveLog] = useState(null)
  const [layers, setLayers] = useState(null)
  const [lineDesignData, setLineDesignData] = useState(null)
  const [assetsError, setAssetsError] = useState(null)

  const hasPngLayers = canRegenerateLaserSvg(steps)
  const step2Url = stepUrl(steps, 'step2')

  const traceSettings = useMemo(
    () => buildTraceSettingsPayload({ gravure: gravureOpts, decoupe: decoupeOpts }),
    [gravureOpts, decoupeOpts],
  )

  const extractionOpts = useMemo(
    () => outlineOptsForExtraction({ gravure: gravureOpts }),
    [gravureOpts.maskContourSw],
  )

  const setGravureOpt = (key, value) => setGravureOpts(o => ({ ...o, [key]: value }))
  const setDecoupeOpt = (key, value) => setDecoupeOpts(o => ({ ...o, [key]: value }))

  useEffect(() => {
    const next = traceSettingsFromGeneration(generationData ?? { steps })
    setGravureOpts(next.gravure)
    setDecoupeOpts(next.decoupe)
  }, [generationId, generationData, steps])

  useEffect(() => {
    if (embedded && !expanded) {
      setLayers(null)
      setPreviewSvg(null)
      return undefined
    }
    if (!hasPngLayers) {
      setLayers(null)
      return undefined
    }
    let cancelled = false
    setAssetsError(null)
    ;(async () => {
      try {
        const [outline, bulky, gravure] = await Promise.all([
          loadImageDataFromUrl(stepUrl(steps, 'outline')),
          loadImageDataFromUrl(stepUrl(steps, 'outline_bulk')),
          loadImageDataFromUrl(stepUrl(steps, 'gravure')),
        ])
        if (cancelled) return
        setLayers({
          outline: imageDataToCanvas(outline),
          outlineBulky: imageDataToCanvas(bulky),
          gravure: imageDataToCanvas(gravure),
        })
      } catch (err) {
        if (!cancelled) {
          setAssetsError(err.message)
          setLayers(null)
        }
      }
    })()
    return () => { cancelled = true }
  }, [steps, hasPngLayers, embedded, expanded])

  useEffect(() => {
    if (embedded && !expanded) return undefined
    if (!step2Url) {
      setLineDesignData(null)
      return undefined
    }
    let cancelled = false
    loadImageDataFromUrl(step2Url)
      .then(data => { if (!cancelled) setLineDesignData(data) })
      .catch(() => { if (!cancelled) setLineDesignData(null) })
    return () => { cancelled = true }
  }, [step2Url])

  useEffect(() => {
    if (!lineDesignData) return undefined
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const result = await processLineArt(imageDataToCanvas(lineDesignData), extractionOpts)
        if (cancelled) return
        setLayers({
          outline: result.outline,
          outlineBulky: result.outlineBulky,
          gravure: result.gravure,
        })
      } catch (err) {
        if (!cancelled) setPreviewError(err.message)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [lineDesignData, extractionOpts, embedded, expanded])

  useEffect(() => {
    if (embedded && !expanded) {
      setPreviewSvg(null)
      setPreviewBusy(false)
      return undefined
    }
    if (!layers || !hasPngLayers) {
      setPreviewSvg(null)
      return undefined
    }
    let cancelled = false
    setPreviewBusy(true)
    setPreviewError(null)
    const t = setTimeout(async () => {
      try {
        const merged = await buildGenerationLaserSvg({
          layers,
          photoUrl: stepUrl(steps, 'step1'),
          faceCount,
          traceSettings,
          onProgress: () => {},
        })
        if (!cancelled) setPreviewSvg(merged)
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err.message)
          setPreviewSvg(null)
        }
      } finally {
        if (!cancelled) setPreviewBusy(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [layers, hasPngLayers, steps, faceCount, traceSettings, embedded, expanded])

  const handleSave = useCallback(async () => {
    if (!hasPngLayers || !layers) return
    setSaveBusy(true)
    setSaveLog('Génération SVG…')
    setPreviewError(null)
    try {
      const merged = await buildGenerationLaserSvg({
        layers,
        photoUrl: stepUrl(steps, 'step1'),
        faceCount,
        traceSettings,
        onProgress: setSaveLog,
      })
      const uploads = []
      if (lineDesignData) {
        setSaveLog('Upload calques PNG…')
        uploads.push(
          uploadAsset(generationId, 'outline', {
            base64: layers.outline.toDataURL('image/png'),
            status: 'done',
            source: 'admin_laser_studio',
          }),
          uploadAsset(generationId, 'outline_bulk', {
            base64: layers.outlineBulky.toDataURL('image/png'),
            status: 'done',
            source: 'admin_laser_studio',
          }),
          uploadAsset(generationId, 'gravure', {
            base64: layers.gravure.toDataURL('image/png'),
            status: 'done',
            source: 'admin_laser_studio',
          }),
        )
      }
      uploads.push(uploadAsset(generationId, 'laser_merged', {
        base64: svgToDataUrl(merged),
        status: 'done',
        source: 'admin_laser_studio',
        metadata: { traceSettings },
      }))
      await Promise.all(uploads)
      saveTraceSettings(traceSettings)
      setSaveLog('Enregistré ✓')
      onSaved?.()
    } catch (err) {
      setPreviewError(err.message)
      setSaveLog(null)
    } finally {
      setSaveBusy(false)
      setTimeout(() => setSaveLog(null), 2500)
    }
  }, [generationId, steps, faceCount, traceSettings, hasPngLayers, layers, lineDesignData, onSaved])

  const handleReset = () => {
    setGravureOpts({ ...DEFAULT_TRACE_SETTINGS.gravure })
    setDecoupeOpts({ ...DEFAULT_TRACE_SETTINGS.decoupe })
  }

  const shellClass = embedded
    ? 'rounded-xl border border-amber-800/40 bg-stone-950/40 overflow-hidden'
    : 'rounded-2xl border border-amber-800/40 bg-stone-900/40 overflow-hidden'

  if (!hasPngLayers) {
    const empty = (
      <>
        {!embedded && <h3 className="font-semibold text-stone-200">Studio SVG laser</h3>}
        <p className={`text-sm text-stone-500 ${embedded ? '' : 'mt-2'}`}>
          Lancez d&apos;abord l&apos;extraction PNG (étape 3) pour affiner les paramètres et prévisualiser le SVG.
        </p>
      </>
    )
    return embedded
      ? <div className={shellClass + ' p-4'}>{empty}</div>
      : <section className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">{empty}</section>
  }

  return (
    <section className={shellClass}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-stone-900/40 transition-colors"
      >
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 text-stone-500 shrink-0">
            <ChevronIcon open={expanded} />
          </span>
          <div>
            <p className={`font-semibold text-stone-100 ${embedded ? 'text-sm' : ''}`}>
              {embedded ? 'Studio SVG laser' : 'Studio SVG laser'}
            </p>
            <p className={`text-xs text-stone-500 ${embedded ? '' : 'mt-0.5'}`}>
              {expanded
                ? (embedded
                  ? 'Ajustez les paramètres — aperçu live, puis enregistrez une nouvelle version.'
                  : 'Ajustez les paramètres — l\'aperçu se met à jour en direct avant enregistrement.')
                : 'Replié — ouvrir pour prévisualiser et ajuster les paramètres studio.'}
            </p>
          </div>
        </div>
        {expanded && (
          <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
            {previewBusy && <span className="text-[10px] text-amber-400">Aperçu…</span>}
            <button
              type="button"
              onClick={handleReset}
              disabled={disabled || saveBusy}
              className="text-xs px-3 py-1.5 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-200 disabled:opacity-50"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || saveBusy || !previewSvg}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-sm font-semibold"
            >
              {saveBusy
                ? 'Enregistrement…'
                : embedded
                  ? 'Générer SVG avec paramètres Studio'
                  : 'Générer et enregistrer SVG'}
            </button>
          </div>
        )}
      </button>

      {expanded && (
        <>
      {(previewError || assetsError) && (
        <p className="px-4 py-2 text-sm text-red-400 border-b border-stone-800">{previewError || assetsError}</p>
      )}
      {saveLog && (
        <p className="px-4 py-2 text-xs text-amber-200 font-mono border-b border-stone-800">{saveLog}</p>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] divide-y lg:divide-y-0 lg:divide-x divide-stone-800">
        <div className="p-3 min-h-[280px]">
          <ZoomableStage
            label="Aperçu SVG fusionné (découpe + gravure)"
            empty={!previewSvg && !previewBusy && (
              <p className="text-xs text-stone-500">Aperçu indisponible</p>
            )}
          >
            {svgPreview(previewSvg)}
          </ZoomableStage>
        </div>

        <aside className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Gravure</p>
            <TraceSlider
              id="studio-mask-sw"
              label={MASK_CONTOUR_PARAM.label}
              hint={MASK_CONTOUR_PARAM.hint}
              min={MASK_CONTOUR_PARAM.min}
              max={MASK_CONTOUR_PARAM.max}
              step={MASK_CONTOUR_PARAM.step}
              value={gravureOpts.maskContourSw ?? DEFAULT_MASK_CONTOUR_SW}
              onChange={v => setGravureOpt('maskContourSw', v)}
            />
            {GRAVURE_TRACE_PARAMS.map(p => (
              <TraceSlider
                key={p.key}
                id={`studio-gravure-${p.key}`}
                label={p.label}
                hint={p.hint}
                min={p.min}
                max={p.max}
                step={p.step}
                value={gravureOpts[p.key]}
                onChange={v => setGravureOpt(p.key, v)}
              />
            ))}
            <p className="text-[10px] text-stone-600 leading-snug">
              Paths triés par centroïde X (gauche → droite), dégradé vert → bleu.
            </p>
            <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!gravureOpts.laserRoundTrip}
                onChange={e => setGravureOpt('laserRoundTrip', e.target.checked)}
                className="accent-amber-500"
              />
              Aller-retour petits segments
            </label>
          </div>

          <div className="space-y-3 pt-2 border-t border-stone-800">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Découpe</p>
            {DECOUPE_PARAMS.map(p => (
              <TraceSlider
                key={p.key}
                id={`studio-decoupe-${p.key}`}
                label={p.label}
                hint={p.hint}
                min={p.min}
                max={p.max}
                step={p.step}
                value={decoupeOpts[p.key] ?? 0}
                onChange={v => setDecoupeOpt(p.key, v)}
              />
            ))}
          </div>

          {!step2Url && gravureOpts.maskContourSw !== (initial.gravure?.maskContourSw ?? DEFAULT_MASK_CONTOUR_SW) && (
            <p className="text-[10px] text-amber-500/90 leading-snug">
              Step2 manquant — le masque contour ne peut pas être ré-appliqué à l&apos;aperçu.
            </p>
          )}
        </aside>
      </div>
        </>
      )}
    </section>
  )
}
