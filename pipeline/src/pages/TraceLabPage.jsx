import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ZoomableStage from '../components/ZoomableStage'
import { fetchGeneration, fetchGenerations, uploadAsset } from '../lib/storage'
import {
  OUTLINE_TRACE_OPTS,
  finalizeGravureSvgAsync,
  imageDataToObjectUrl,
  loadImageDataFromUrl,
  optimizeSvgForLaser,
  traceCenterline,
} from '../lib/centerlineTrace'
import {
  loadTraceSettings,
  saveTraceSettings,
  resetTraceSettings,
  DEFAULT_TRACE_SETTINGS,
  buildTraceSettingsPayload,
  outlineOptsForExtraction,
  gravureTraceOpts,
  DEFAULT_MASK_CONTOUR_SW,
} from '../lib/traceSettings'
import { detectFacesGuided, mapFacesToTarget, paintEyeMasksOnImageData } from '../lib/faceLandmarks'
import { buildMergedLaserSvgAsync } from '../lib/laserSvg'
import { buildDecoupeWithSoclesSvg } from '../lib/decoupeUnion'
import { extractBodyRegionsDetailed } from '../lib/bodyRegions'
import { processLineArt, buildGravureMaskPreview } from '../lib/outline'
import { imageDataToCanvas, svgToDataUrl } from '../lib/laserPipeline'

const PARAMS = [
  { key: 'threshold', label: 'Seuil', hint: 'Niveau de gris → noir/blanc (≈ 200–240 pour line art)', min: 1, max: 254, step: 1 },
  { key: 'despeckleLevel', label: 'Désépoussiérage', hint: 'Supprime les petits îlots parasites', min: 0, max: 12, step: 1 },
  { key: 'filterIterations', label: 'Lissage (filtre)', hint: 'Passes de flou avant le tracé', min: 0, max: 8, step: 1 },
  { key: 'smoothness', label: 'Lissage du tracé', hint: 'Adoucit les crénelures (0 = brut, 100 = très lisse)', min: 0, max: 100, step: 1 },
  { key: 'errorThreshold', label: 'Seuil d\'erreur', hint: '0 = max de détails', min: 0, max: 10, step: 0.1 },
  { key: 'mergeDistance', label: 'Fusion segments', hint: 'Polylignes coupées (px)', min: 0, max: 12, step: 1 },
  { key: 'lineThreshold', label: 'Longueur min. ligne', hint: 'Ignore les polylignes trop courtes', min: 1, max: 20, step: 1 },
  { key: 'strokeWidth', label: 'Épaisseur SVG', hint: 'Épaisseur du trait exporté', min: 0.25, max: 8, step: 0.25 },
  { key: 'chunkSize', label: 'Taille des blocs', hint: 'Plus petit = plus de détails', min: 2, max: 24, step: 1 },
]

const MASK_CONTOUR_PARAM = {
  key: 'maskContourSw',
  label: 'Épaisseur masque contour',
  hint: 'Zone autour du contour extérieur retirée de la gravure (px)',
  min: 0,
  max: 16,
  step: 1,
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function stepUrl(steps, assetType) {
  return steps?.find(s => s.asset_type === assetType)?.image_url ?? null
}

function Slider({ id, label, hint, value, onChange, min, max, step }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-stone-300">{label}</label>
        <span className="text-xs tabular-nums text-stone-500">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
      {hint && <p className="text-[10px] text-stone-600 leading-snug">{hint}</p>}
    </div>
  )
}

function PhotoPanel({ imageData, lineDesignData, faceData, detecting, detectError }) {
  const sourceUrl = imageData ? imageDataToObjectUrl(imageData) : null
  const lineDesignUrl = lineDesignData ? imageDataToObjectUrl(lineDesignData) : null
  const W = imageData?.width ?? 1
  const H = imageData?.height ?? 1
  const faces = faceData?.faces ?? []
  const bodies = faceData?.bodies ?? []

  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-100">Sources</h3>
        </div>
        {detecting && <span className="text-[10px] text-amber-400">Détection visages…</span>}
        {!detecting && faces.length > 0 && (
          <span className="text-[10px] text-stone-500">
            {faces.length} visage{faces.length !== 1 ? 's' : ''} détecté{faces.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {detectError && (
        <p className="px-4 py-2 text-xs text-red-400 border-b border-stone-800">{detectError}</p>
      )}
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-800">
        <div className="p-3">
          <ZoomableStage
            label="Photo source (step1)"
            empty={!sourceUrl && (
              <p className="text-xs text-stone-500">Aucune photo step1 pour cette génération</p>
            )}
          >
            {sourceUrl && (
              <div className="relative inline-block max-w-full leading-none">
                <img
                  src={sourceUrl}
                  alt=""
                  className="max-w-full object-contain block"
                  draggable={false}
                />
                {(bodies.length > 0 || faces.length > 0) && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {bodies.map((b, i) => (
                      <rect
                        key={`b${i}`}
                        x={b.x * W}
                        y={b.y * H}
                        width={b.w * W}
                        height={b.h * H}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={Math.max(1.5, W * 0.002)}
                        strokeDasharray="6 4"
                      />
                    ))}
                    {faces.map((f, i) => (
                      <g key={i}>
                        <rect
                          x={f.box.x * W}
                          y={f.box.y * H}
                          width={f.box.w * W}
                          height={f.box.h * H}
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth={Math.max(2, W * 0.003)}
                        />
                        <ellipse
                          cx={f.leftEye.x * W}
                          cy={f.leftEye.y * H}
                          rx={Math.max(2, f.leftEye.rx * W)}
                          ry={Math.max(2, f.leftEye.ry * H)}
                          fill="rgba(245, 158, 11, 0.15)"
                          stroke="#f59e0b"
                          strokeWidth={Math.max(1.5, W * 0.002)}
                        />
                        <ellipse
                          cx={f.rightEye.x * W}
                          cy={f.rightEye.y * H}
                          rx={Math.max(2, f.rightEye.rx * W)}
                          ry={Math.max(2, f.rightEye.ry * H)}
                          fill="rgba(245, 158, 11, 0.15)"
                          stroke="#f59e0b"
                          strokeWidth={Math.max(1.5, W * 0.002)}
                        />
                      </g>
                    ))}
                  </svg>
                )}
              </div>
            )}
          </ZoomableStage>
        </div>
        <div className="p-3">
          <ZoomableStage
            label="Line design (step2)"
            empty={!lineDesignUrl && (
              <p className="text-xs text-stone-500">Aucun line art step2 pour cette génération</p>
            )}
          >
            {lineDesignUrl && (
              <img
                src={lineDesignUrl}
                alt=""
                className="max-w-full object-contain block"
                draggable={false}
              />
            )}
          </ZoomableStage>
        </div>
      </div>
    </section>
  )
}

function svgPreview(svg) {
  if (!svg) return null
  return (
    <div
      className="relative w-full [&_svg]:max-w-none [&_svg]:w-full [&_svg]:h-auto bg-white rounded"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function DecoupeLabPanel({ imageData, maskData, decoupeOpts, onTraceResult }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [tracedSvg, setTracedSvg] = useState(null)

  useEffect(() => {
    if (!imageData) {
      setTracedSvg(null)
      onTraceResult?.(null)
      return undefined
    }
    setBusy(true)
    let cancelled = false
    const t = setTimeout(() => {
      try {
        const result = traceCenterline(imageData, OUTLINE_TRACE_OPTS)
        if (!cancelled) {
          setTracedSvg(result.svg)
          onTraceResult?.({ svg: result.svg, width: result.width, height: result.height })
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setTracedSvg(null)
          onTraceResult?.(null)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 320)
    return () => { cancelled = true; clearTimeout(t) }
  }, [imageData, onTraceResult])

  const displaySvg = useMemo(() => {
    if (!tracedSvg) return null
    const optimized = optimizeSvgForLaser(tracedSvg, decoupeOpts)
    if (!maskData?.bodies?.length) return optimized
    return buildDecoupeWithSoclesSvg(optimized, maskData, decoupeOpts)
  }, [tracedSvg, maskData, decoupeOpts])

  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-100">Outline / Découpe</h3>
          <p className="text-xs text-stone-500">Corps (bleu) + socles (rouge)</p>
        </div>
        {busy && <span className="text-[10px] text-amber-400">Calcul…</span>}
      </div>
      {error && <p className="px-4 py-2 text-sm text-red-400 border-b border-stone-800">{error}</p>}
      <div className="p-3">
        <ZoomableStage label="Corps + socles" empty={!displaySvg && <p className="text-xs text-stone-500">Outline indisponible</p>}>
          {svgPreview(displaySvg)}
        </ZoomableStage>
      </div>
    </section>
  )
}

function GravureLabPanel({ imageData, gravureOpts, mappedEyes, maskPreviewData, onTraceResult }) {
  const [busy, setBusy] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const maskPreviewUrl = maskPreviewData ? imageDataToObjectUrl(maskPreviewData) : null

  useEffect(() => {
    if (!imageData) {
      onTraceResult?.(null)
      return undefined
    }
    setBusy(true)
    setProgressMsg('Tracé…')
    let cancelled = false
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const input = mappedEyes?.length ? paintEyeMasksOnImageData(imageData, mappedEyes) : imageData
        const result = traceCenterline(input, gravureOpts)
        setProgressMsg('Finalisation…')
        const svg = await finalizeGravureSvgAsync(result.svg, {
          mappedEyes,
          opts: gravureOpts,
          signal: controller.signal,
          onProgress: p => { if (!cancelled) setProgressMsg(p.message ?? 'Finalisation…') },
        })
        if (!cancelled) onTraceResult?.({ svg, width: result.width, height: result.height })
      } catch (err) {
        if (err?.name === 'AbortError') return
        if (!cancelled) onTraceResult?.(null)
      } finally {
        if (!cancelled) {
          setBusy(false)
          setProgressMsg('')
        }
      }
    }, 320)
    return () => { cancelled = true; controller.abort(); clearTimeout(t) }
  }, [imageData, gravureOpts, mappedEyes, onTraceResult])

  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-100">Gravure</h3>
          <p className="text-xs text-stone-500">Contour extérieur masqué avant tracé</p>
        </div>
        {busy && <span className="text-[10px] text-amber-400">{progressMsg || 'Calcul…'}</span>}
      </div>
      <div className="p-3">
        <ZoomableStage
          label="Gravure masquée (contour extérieur retiré)"
          empty={!maskPreviewUrl && <p className="text-xs text-stone-500">Gravure indisponible</p>}
        >
          {maskPreviewUrl && (
            <img src={maskPreviewUrl} alt="" className="max-w-full object-contain bg-white rounded block" draggable={false} />
          )}
        </ZoomableStage>
      </div>
    </section>
  )
}

export default function TraceLabPage() {
  const initialTrace = loadTraceSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const [opts, setOpts] = useState(initialTrace.gravure)
  const [decoupeOpts, setDecoupeOpts] = useState(initialTrace.decoupe)
  const [productionSavedAt, setProductionSavedAt] = useState(null)

  const [generations, setGenerations] = useState([])
  const [gensLoading, setGensLoading] = useState(true)
  const [generationId, setGenerationId] = useState(searchParams.get('gen') ?? '')
  const [genMeta, setGenMeta] = useState(null)
  const [loadBusy, setLoadBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [loadWarnings, setLoadWarnings] = useState([])

  const [outlineData, setOutlineData] = useState(null)
  const [silhouetteData, setSilhouetteData] = useState(null)
  const [gravureData, setGravureData] = useState(null)
  const [photoData, setPhotoData] = useState(null)
  const [lineDesignData, setLineDesignData] = useState(null)

  const [faceData, setFaceData] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState(null)

  const [outlineRaw, setOutlineRaw] = useState(null)
  const [gravureRaw, setGravureRaw] = useState(null)

  const setOpt = (key, value) => setOpts(o => ({ ...o, [key]: value }))
  const setDecoupeOpt = (key, value) => setDecoupeOpts(o => ({ ...o, [key]: value }))

  const extractionOpts = useMemo(
    () => outlineOptsForExtraction({ gravure: opts }),
    [opts.maskContourSw],
  )
  const gravureTraceSettings = useMemo(() => gravureTraceOpts(opts), [opts])

  const gravureMaskPreview = useMemo(
    () => buildGravureMaskPreview(gravureData, silhouetteData),
    [gravureData, silhouetteData],
  )

  const maskData = useMemo(() => {
    const src = silhouetteData || gravureData || outlineData
    if (!src) return null
    return extractBodyRegionsDetailed(src, genMeta?.face_count ?? null)
  }, [silhouetteData, gravureData, outlineData, genMeta?.face_count])

  const mappedEyes = useMemo(() => {
    if (!faceData?.faces?.length || !gravureData) return null
    return mapFacesToTarget(faceData.faces, gravureData.width, gravureData.height)
  }, [faceData, gravureData])

  const [mergedSvg, setMergedSvg] = useState(null)
  const [mergedBusy, setMergedBusy] = useState(false)
  const [mergedProgress, setMergedProgress] = useState('')
  const [saveSvgBusy, setSaveSvgBusy] = useState(false)
  const [saveSvgMsg, setSaveSvgMsg] = useState(null)

  useEffect(() => {
    if (!outlineRaw?.svg || !gravureRaw?.svg) {
      setMergedSvg(null)
      setMergedBusy(false)
      setMergedProgress('')
      return undefined
    }

    const controller = new AbortController()
    setMergedBusy(true)
    setMergedProgress('Fusion SVG…')
    setMergedSvg(null)

    buildMergedLaserSvgAsync({
      decoupeSvg: outlineRaw.svg,
      gravureSvg: gravureRaw.svg,
      maskData,
      mappedEyes,
      opts: gravureTraceOpts(opts),
      decoupeOpts,
      signal: controller.signal,
      onProgress: msg => setMergedProgress(typeof msg === 'string' ? msg : msg?.message ?? 'Fusion…'),
    })
      .then(svg => {
        if (!controller.signal.aborted) setMergedSvg(svg)
      })
      .catch(err => {
        if (err?.name !== 'AbortError') console.warn('[TraceLab] fusion SVG:', err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMergedBusy(false)
          setMergedProgress('')
        }
      })

    return () => controller.abort()
  }, [outlineRaw, gravureRaw, maskData, mappedEyes, opts, decoupeOpts])

  useEffect(() => {
    setSaveSvgMsg(null)
  }, [generationId, mergedSvg])

  const saveMergedSvgToGeneration = useCallback(async () => {
    if (!generationId || !mergedSvg) return
    setSaveSvgBusy(true)
    setSaveSvgMsg(null)
    try {
      const traceSettings = buildTraceSettingsPayload({
        engine: 'browser',
        gravure: opts,
        decoupe: decoupeOpts,
      })
      const { version } = await uploadAsset(generationId, 'laser_merged', {
        base64: svgToDataUrl(mergedSvg),
        status: 'done',
        source: 'lab_trace',
        metadata: { traceSettings },
      })
      setSaveSvgMsg(`Nouvelle version v${version} enregistrée pour cette génération ✓`)
    } catch (err) {
      setSaveSvgMsg(err.message || 'Échec enregistrement du SVG')
    } finally {
      setSaveSvgBusy(false)
      setTimeout(() => setSaveSvgMsg(null), 5000)
    }
  }, [generationId, mergedSvg, opts, decoupeOpts])

  const saveProductionSettings = useCallback(() => {
    saveTraceSettings(buildTraceSettingsPayload({ engine: 'browser', gravure: opts, decoupe: decoupeOpts }))
    setProductionSavedAt(Date.now())
  }, [opts, decoupeOpts])

  useEffect(() => {
    if (!lineDesignData) return undefined
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const layers = await processLineArt(imageDataToCanvas(lineDesignData), extractionOpts)
        if (cancelled) return
        const toData = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
        setOutlineData(toData(layers.outline))
        setSilhouetteData(toData(layers.outlineBulky))
        setGravureData(toData(layers.gravure))
      } catch (err) {
        if (!cancelled) console.warn('[TraceLab] extraction:', err.message)
      }
    }, 320)
    return () => { cancelled = true; clearTimeout(t) }
  }, [lineDesignData, extractionOpts])

  useEffect(() => {
    setGensLoading(true)
    fetchGenerations()
      .then(setGenerations)
      .catch(() => setGenerations([]))
      .finally(() => setGensLoading(false))
  }, [])

  useEffect(() => {
    if (!photoData) {
      setFaceData(null)
      setDetectError(null)
      return undefined
    }
    let cancelled = false
    setDetecting(true)
    setDetectError(null)

    const silhouette = silhouetteData || gravureData || outlineData
    const expectedCount = genMeta?.face_count ?? null

    detectFacesGuided(photoData, silhouette, expectedCount)
      .then(data => {
        if (!cancelled) setFaceData(data)
      })
      .catch(err => {
        if (!cancelled) {
          setFaceData(null)
          setDetectError(err.message)
        }
      })
      .finally(() => {
        if (!cancelled) setDetecting(false)
      })
    return () => { cancelled = true }
  }, [photoData, gravureData, silhouetteData, outlineData, genMeta?.face_count])

  const loadGeneration = useCallback(async (id) => {
    if (!id) {
      setGenMeta(null)
      setOutlineData(null)
      setSilhouetteData(null)
      setGravureData(null)
      setPhotoData(null)
      setLineDesignData(null)
      setFaceData(null)
      setOutlineRaw(null)
      setGravureRaw(null)
      setLoadWarnings([])
      setLoadError(null)
      return
    }

    setLoadBusy(true)
    setLoadError(null)
    setLoadWarnings([])

    try {
      const data = await fetchGeneration(id)
      const steps = data.steps ?? []
      setGenMeta(data.generation)

      const outlineUrl = stepUrl(steps, 'outline') || stepUrl(steps, 'outline_bulk')
      const outlineBulkUrl = stepUrl(steps, 'outline_bulk')
      const gravureUrl = stepUrl(steps, 'gravure')
      const photoUrl = stepUrl(steps, 'step1')
      const lineDesignUrl = stepUrl(steps, 'step2')

      const warnings = []
      if (!outlineUrl) warnings.push('outline')
      if (!gravureUrl) warnings.push('gravure')
      if (!photoUrl) warnings.push('photo step1')
      if (!lineDesignUrl) warnings.push('line art step2')
      setLoadWarnings(warnings)

      const [outline, silhouette, gravure, photo, lineDesign] = await Promise.all([
        outlineUrl ? loadImageDataFromUrl(outlineUrl) : Promise.resolve(null),
        outlineBulkUrl ? loadImageDataFromUrl(outlineBulkUrl) : Promise.resolve(null),
        gravureUrl ? loadImageDataFromUrl(gravureUrl) : Promise.resolve(null),
        photoUrl ? loadImageDataFromUrl(photoUrl) : Promise.resolve(null),
        lineDesignUrl ? loadImageDataFromUrl(lineDesignUrl) : Promise.resolve(null),
      ])

      setPhotoData(photo)
      setLineDesignData(lineDesign)
      if (!lineDesign) {
        setOutlineData(outline)
        setSilhouetteData(silhouette)
        setGravureData(gravure)
      }
      setSearchParams({ gen: id }, { replace: true })
    } catch (err) {
      setLoadError(err.message)
      setOutlineData(null)
      setSilhouetteData(null)
      setGravureData(null)
      setPhotoData(null)
      setLineDesignData(null)
    } finally {
      setLoadBusy(false)
    }
  }, [setSearchParams])

  useEffect(() => {
    const fromUrl = searchParams.get('gen')
    if (fromUrl && fromUrl !== generationId) {
      setGenerationId(fromUrl)
    }
  }, [searchParams, generationId])

  useEffect(() => {
    if (generationId) loadGeneration(generationId)
  }, [generationId, loadGeneration])

  const onSelectGeneration = (id) => {
    setGenerationId(id)
    if (!id) {
      setSearchParams({}, { replace: true })
      loadGeneration('')
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <p className="text-xs text-stone-500 max-w-2xl mb-6">
        Photo source, line design, aperçu découpe et gravure masquée.
      </p>

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-stone-200">Génération</h2>
            <select
              value={generationId}
              onChange={e => onSelectGeneration(e.target.value)}
              disabled={gensLoading || loadBusy}
              className="w-full rounded-lg bg-stone-800 border border-stone-700 text-stone-100 text-sm px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="">— Choisir une génération —</option>
              {generations.map(g => (
                <option key={g.id} value={g.id}>
                  {formatDate(g.created_at)}
                  {g.face_count != null ? ` · ${g.face_count} vis.` : ''}
                </option>
              ))}
            </select>
            {loadBusy && <p className="text-xs text-amber-400">Chargement des images…</p>}
            {loadError && <p className="text-xs text-red-400">{loadError}</p>}
            {genMeta && (
              <p className="text-[10px] text-stone-500 font-mono break-all">{genMeta.id}</p>
            )}
            {loadWarnings.length > 0 && (
              <p className="text-xs text-amber-500/90">
                Manquant : {loadWarnings.join(', ')}
              </p>
            )}
            {generationId && (
              <Link
                to={`/admin/g/${generationId}`}
                className="block text-xs text-stone-500 hover:text-stone-300"
              >
                Ouvrir dans l&apos;admin →
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-stone-200">Paramètres découpe</h2>
            <Slider
              id="decoupe-path-smoothness"
              label="Lissage paths corps"
              hint="Réduit les points des silhouettes (0 = brut)."
              min={0}
              max={100}
              step={1}
              value={decoupeOpts.pathSmoothness ?? 0}
              onChange={v => setDecoupeOpt('pathSmoothness', v)}
            />
            <button
              type="button"
              onClick={() => setDecoupeOpts({ ...DEFAULT_TRACE_SETTINGS.decoupe })}
              className="w-full text-xs py-2 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-200"
            >
              Réinitialiser découpe
            </button>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-stone-200">Paramètres gravure</h2>
            <Slider
              id={`trace-${MASK_CONTOUR_PARAM.key}`}
              label={MASK_CONTOUR_PARAM.label}
              hint={MASK_CONTOUR_PARAM.hint}
              min={MASK_CONTOUR_PARAM.min}
              max={MASK_CONTOUR_PARAM.max}
              step={MASK_CONTOUR_PARAM.step}
              value={opts.maskContourSw ?? DEFAULT_MASK_CONTOUR_SW}
              onChange={v => setOpt('maskContourSw', v)}
            />
            {PARAMS.map(p => (
              <Slider
                key={p.key}
                id={`trace-${p.key}`}
                label={p.label}
                hint={p.hint}
                min={p.min}
                max={p.max}
                step={p.step}
                value={opts[p.key]}
                onChange={v => setOpt(p.key, v)}
              />
            ))}
            <p className="text-[10px] text-stone-600 leading-snug">
              Paths triés par centroïde X (gauche → droite), dégradé vert (gauche) → bleu (droite).
            </p>
            <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
              <input type="checkbox" checked={opts.laserRoundTrip} onChange={e => setOpt('laserRoundTrip', e.target.checked)} className="accent-amber-500" />
              Aller-retour petits segments
            </label>
            <button
              type="button"
              onClick={() => {
                const d = resetTraceSettings()
                setOpts(d.gravure)
                setDecoupeOpts(d.decoupe)
                setProductionSavedAt(null)
              }}
              className="w-full text-xs py-2 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-200"
            >
              Réinitialiser tout (brouillon)
            </button>
          </div>

          <div className="rounded-2xl border border-amber-800/60 bg-amber-950/20 p-4 space-y-3">
            <p className="text-[10px] text-stone-500 leading-snug">
              Enregistre tous les paramètres visibles ci-dessus pour le pipeline automatique.
            </p>
            <button
              type="button"
              onClick={saveProductionSettings}
              className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 text-sm font-semibold py-2.5"
            >
              Enregistrer Paramètres pour Pipeline Automatique
            </button>
            {productionSavedAt && (
              <p className="text-[10px] text-emerald-400 text-center">
                Enregistré {new Date(productionSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </aside>

        <div className="space-y-6">
          {!generationId && !loadBusy && (
            <p className="text-stone-500 text-sm text-center py-16 rounded-2xl border border-dashed border-stone-800">
              Choisissez une génération dans le menu de gauche.
            </p>
          )}

          {generationId && (
            <>
              <PhotoPanel
                imageData={photoData}
                lineDesignData={lineDesignData}
                faceData={faceData}
                detecting={detecting}
                detectError={detectError}
              />
              <DecoupeLabPanel
                imageData={outlineData}
                maskData={maskData}
                decoupeOpts={decoupeOpts}
                onTraceResult={setOutlineRaw}
              />
              <GravureLabPanel
                imageData={gravureData}
                gravureOpts={gravureTraceSettings}
                mappedEyes={mappedEyes}
                maskPreviewData={gravureMaskPreview}
                onTraceResult={setGravureRaw}
              />

              {(mergedSvg || mergedBusy) && (
                <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-stone-100">SVG fusionné laser</h3>
                      <p className="text-xs text-stone-500">
                        {mergedBusy
                          ? (mergedProgress || 'Calcul…')
                          : 'Calque « découpe » (rouge) + « gravure » (tri X, vert → bleu)'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {generationId && mergedSvg && (
                        <button
                          type="button"
                          disabled={saveSvgBusy}
                          onClick={saveMergedSvgToGeneration}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
                        >
                          {saveSvgBusy
                            ? 'Enregistrement…'
                            : 'Ajouter comme nouvelle version du SVG pour cette génération'}
                        </button>
                      )}
                      {mergedSvg && (
                        <a
                          href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(mergedSvg)}`}
                          download="mini-nous-laser.svg"
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950"
                        >
                          Télécharger SVG fusionné
                        </a>
                      )}
                      {mergedBusy && (
                        <span className="inline-block w-4 h-4 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                      )}
                    </div>
                  </div>
                  {saveSvgMsg && (
                    <p className={`px-4 py-2 text-xs border-b border-stone-800 ${
                      saveSvgMsg.includes('✓') ? 'text-emerald-400' : 'text-red-400'
                    }`}
                    >
                      {saveSvgMsg}
                    </p>
                  )}
                  <div className="p-3 space-y-2">
                    <ZoomableStage
                      label="Aperçu export (découpe + gravure)"
                      empty={mergedBusy && !mergedSvg && (
                        <p className="text-xs text-stone-500">{mergedProgress || 'Fusion en cours…'}</p>
                      )}
                    >
                      {mergedSvg && (
                        <div
                          className="relative w-full [&_svg]:max-w-none [&_svg]:w-full [&_svg]:h-auto bg-white rounded"
                          dangerouslySetInnerHTML={{ __html: mergedSvg }}
                        />
                      )}
                    </ZoomableStage>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
