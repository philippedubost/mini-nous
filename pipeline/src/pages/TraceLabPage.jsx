import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ZoomableStage from '../components/ZoomableStage'
import { fetchGeneration, fetchGenerations } from '../lib/storage'
import {
  DEFAULT_TRACE_OPTS,
  OUTLINE_TRACE_OPTS,
  DECOUPE_OPTIMIZE_OPTS,
  appendEyeEllipsesToSvg,
  checkAutotraceAvailable,
  imageDataToObjectUrl,
  loadImageDataFromFile,
  loadImageDataFromUrl,
  optimizeSvgForLaser,
  traceAutotraceServer,
  traceCenterline,
} from '../lib/centerlineTrace'
import {
  loadTraceSettings,
  saveTraceSettings,
  resetTraceSettings,
  DEFAULT_TRACE_SETTINGS,
} from '../lib/traceSettings'
import { detectFacesGuided, mapFacesToTarget, paintEyeMasksOnImageData } from '../lib/faceLandmarks'
import { buildMergedLaserSvg } from '../lib/laserSvg'
import { buildDecoupePreUnionSvg, mergeDecoupeSocleUnion } from '../lib/decoupeUnion'
import { extractBodyRegionsDetailed } from '../lib/bodyRegions'

const PARAMS = [
  { key: 'threshold', label: 'Seuil', hint: 'Niveau de gris → noir/blanc (≈ 200–240 pour line art)', min: 1, max: 254, step: 1, engines: ['browser'] },
  { key: 'despeckleLevel', label: 'Désépoussiérage', hint: 'Supprime les petits îlots parasites', min: 0, max: 12, step: 1, engines: ['browser', 'autotrace'] },
  { key: 'filterIterations', label: 'Lissage (filtre)', hint: 'Passes de flou avant le tracé', min: 0, max: 8, step: 1, engines: ['browser', 'autotrace'] },
  { key: 'smoothness', label: 'Lissage du tracé', hint: 'Adoucit les crénelures (0 = brut, 100 = très lisse)', min: 0, max: 100, step: 1, engines: ['browser', 'autotrace'] },
  { key: 'errorThreshold', label: 'Seuil d\'erreur', hint: '0 = max de détails (navigateur)', min: 0, max: 10, step: 0.1, engines: ['browser', 'autotrace'] },
  { key: 'mergeDistance', label: 'Fusion segments', hint: 'Polylignes coupées (navigateur, px)', min: 0, max: 12, step: 1, engines: ['browser'] },
  { key: 'lineThreshold', label: 'Longueur min. ligne', hint: 'Ignore les polylignes trop courtes', min: 1, max: 20, step: 1, engines: ['browser', 'autotrace'] },
  { key: 'cornerThreshold', label: 'Seuil coins', hint: 'Autotrace uniquement', min: 0, max: 180, step: 1, engines: ['autotrace'] },
  { key: 'strokeWidth', label: 'Épaisseur SVG', hint: 'Épaisseur du trait exporté', min: 0.25, max: 8, step: 0.25, engines: ['browser'] },
  { key: 'chunkSize', label: 'Taille des blocs', hint: 'Plus petit = plus de détails', min: 2, max: 24, step: 1, engines: ['browser'] },
]

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
  const mode = faceData?.mode

  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-100">Photo personnages</h3>
          <p className="text-xs text-stone-500">
            Photo step1 · line art step2 (avant découpe outline/gravure) · MediaPipe
            {mode && mode !== 'none' && (
              <span className="text-stone-600"> · {mode}</span>
            )}
          </p>
        </div>
        {detecting && <span className="text-[10px] text-amber-400">Détection…</span>}
        {!detecting && (
          <span className="text-[10px] text-stone-500">
            {bodies.length} corps · {faces.length} visage{faces.length !== 1 ? 's' : ''}
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

function TraceSlot({
  title, subtitle, imageData, setImageData, traceOpts, optimizeOpts, engine, traceEnabled = true,
  debounceMs = 320, mappedEyes = null, maskEyesBeforeTrace = false, maskData = null,
  applyDecoupeUnion = false, onTraceResult = null,
}) {
  const inputId = useId()
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const onFile = useCallback(async (file) => {
    if (!file?.type?.startsWith('image/')) return
    setError(null)
    try {
      setImageData(await loadImageDataFromFile(file))
    } catch (err) {
      setError(err.message)
    }
  }, [setImageData])

  const traceImageData = useMemo(() => {
    if (!imageData || !maskEyesBeforeTrace || !mappedEyes?.length) return imageData
    return paintEyeMasksOnImageData(imageData, mappedEyes)
  }, [imageData, maskEyesBeforeTrace, mappedEyes])

  useEffect(() => {
    if (!traceImageData || !traceEnabled) {
      setResult(null)
      return undefined
    }
    setBusy(true)
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const out = engine === 'autotrace'
          ? await traceAutotraceServer(traceImageData, traceOpts)
          : traceCenterline(traceImageData, traceOpts)
        if (!cancelled) {
          setResult(out)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setResult(null)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, debounceMs)
    return () => { cancelled = true; clearTimeout(t) }
  }, [traceImageData, traceOpts, engine, debounceMs, traceEnabled])

  useEffect(() => {
    onTraceResult?.(result ? { svg: result.svg, width: result.width, height: result.height } : null)
  }, [result, onTraceResult])

  const sourceUrl = traceImageData ? imageDataToObjectUrl(traceImageData) : null
  const binaryUrl = result?.preview ? imageDataToObjectUrl(result.preview) : null

  const optimizedSvg = useMemo(() => {
    if (!result?.svg) return null
    return optimizeSvgForLaser(result.svg, optimizeOpts)
  }, [result?.svg, optimizeOpts])

  const preUnionSvg = useMemo(() => {
    if (!optimizedSvg || !applyDecoupeUnion || !maskData?.bodies?.length) return null
    return buildDecoupePreUnionSvg(optimizedSvg, maskData, optimizeOpts)
  }, [optimizedSvg, maskData, applyDecoupeUnion, optimizeOpts])

  const finalSvg = useMemo(() => {
    if (!optimizedSvg) return null
    let svg = optimizedSvg
    if (applyDecoupeUnion && maskData?.bodies?.length) {
      svg = mergeDecoupeSocleUnion(svg, maskData, {
        decoupeColor: '#dc2626',
        ...optimizeOpts,
      })
    }
    if (mappedEyes?.length) {
      svg = appendEyeEllipsesToSvg(svg, mappedEyes, {
        ...optimizeOpts,
        eyeStrokeColor: '#000000',
      })
    }
    return svg
  }, [optimizedSvg, maskData, mappedEyes, optimizeOpts, applyDecoupeUnion])

  const svgStage = (svg, { ghost = false } = {}) => svg ? (
    <div className="relative w-full min-w-[200px]">
      {ghost && sourceUrl && (
        <img
          src={sourceUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain opacity-15 pointer-events-none"
        />
      )}
      <div
        className="relative w-full [&_svg]:max-w-none [&_svg]:w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  ) : null

  const outlinePreview = svgStage(optimizedSvg, { ghost: engine === 'browser' })
  const preUnionPreview = svgStage(preUnionSvg)
  const unionPreview = svgStage(finalSvg, { ghost: engine === 'browser' })

  const decoupeSteps = applyDecoupeUnion && maskData?.bodies?.length > 0

  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-100">{title}</h3>
          <p className="text-xs text-stone-500">
            {subtitle}
            {maskData?.bodies?.length ? ` · ${maskData.bodies.length} union découpe+socle` : ''}
            {mappedEyes?.length ? ` · ${mappedEyes.length * 2} ellipses yeux` : ''}
            {maskEyesBeforeTrace && mappedEyes?.length ? ' · masque yeux avant trace' : ''}
          </p>
        </div>
        {traceEnabled && finalSvg && (
          <a
            href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(finalSvg)}`}
            download={`${title.toLowerCase().replace(/\s+/g, '-')}.svg`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950"
          >
            SVG
          </a>
        )}
      </div>

      {error && (
        <p className="px-4 py-2 text-sm text-red-400 border-b border-stone-800">{error}</p>
      )}

      <div
        className={traceEnabled
          ? `grid divide-y md:divide-y-0 md:divide-x divide-stone-800 ${decoupeSteps ? 'md:grid-cols-5' : 'md:grid-cols-3'}`
          : ''}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          onFile(e.dataTransfer.files?.[0])
        }}
        onPaste={e => {
          const file = [...(e.clipboardData?.items ?? [])]
            .find(i => i.type.startsWith('image/'))
            ?.getAsFile()
          if (file) onFile(file)
        }}
        tabIndex={0}
      >
        <div className="p-3">
          <ZoomableStage
            label="Source"
            empty={!sourceUrl && (
              <p className="text-xs text-stone-500">Image absente pour cette génération</p>
            )}
          >
            {sourceUrl && (
              <img src={sourceUrl} alt="" className="max-w-full object-contain" draggable={false} />
            )}
          </ZoomableStage>
          <div className="mt-2">
            <label
              htmlFor={inputId}
              className="cursor-pointer inline-block text-xs font-medium px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700"
            >
              Remplacer par fichier…
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => onFile(e.target.files?.[0])}
            />
          </div>
        </div>

        {traceEnabled && (
          <>
            <div className="p-3">
              <ZoomableStage label="Binaire (pré-traité)" empty={!binaryUrl && null}>
                {binaryUrl && (
                  <img src={binaryUrl} alt="" className="max-w-full object-contain" draggable={false} />
                )}
              </ZoomableStage>
            </div>

            <div className="p-3 relative">
              {busy && (
                <span className="absolute top-3 right-6 z-10 text-[10px] text-amber-400 bg-stone-900/90 px-2 py-0.5 rounded">
                  Calcul…
                </span>
              )}
              <ZoomableStage label={`Outline tracé${result?.engine === 'autotrace' ? ' (autotrace)' : ''} · sans socle`}>
                {decoupeSteps ? outlinePreview : unionPreview}
              </ZoomableStage>
              {result?.polylines && (
                <p className="text-[10px] text-stone-600 mt-1">
                  {result.polylines.length} polyligne{result.polylines.length !== 1 ? 's' : ''}
                  {mappedEyes?.length ? ` · ${mappedEyes.length * 2} ellipses yeux` : ''}
                </p>
              )}
            </div>

            {decoupeSteps && (
              <>
                <div className="p-3">
                  <ZoomableStage label="Avant union · corps bleu + socle rouge">
                    {preUnionPreview}
                  </ZoomableStage>
                </div>
                <div className="p-3">
                  <ZoomableStage label="Après union · découpe rouge">
                    {unionPreview}
                  </ZoomableStage>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default function TraceLabPage() {
  const initialTrace = loadTraceSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const [opts, setOpts] = useState(initialTrace.gravure)
  const [decoupeOpts, setDecoupeOpts] = useState(initialTrace.decoupe)
  const [engine, setEngine] = useState(initialTrace.engine)
  const [autotraceOk, setAutotraceOk] = useState(null)

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
  const visibleParams = PARAMS.filter(p => p.engines.includes(engine))

  const maskData = useMemo(() => {
    const src = silhouetteData || gravureData || outlineData
    if (!src) return null
    return extractBodyRegionsDetailed(src, genMeta?.face_count ?? null)
  }, [silhouetteData, gravureData, outlineData, genMeta?.face_count])

  const mappedEyes = useMemo(() => {
    if (!faceData?.faces?.length || !gravureData) return null
    return mapFacesToTarget(faceData.faces, gravureData.width, gravureData.height)
  }, [faceData, gravureData])

  const mergedSvg = useMemo(() => buildMergedLaserSvg({
    decoupeSvg: outlineRaw?.svg,
    gravureSvg: gravureRaw?.svg,
    maskData,
    mappedEyes,
    opts,
    decoupeOpts,
  }), [outlineRaw, gravureRaw, maskData, mappedEyes, opts, decoupeOpts])

  useEffect(() => {
    checkAutotraceAvailable().then(setAutotraceOk)
  }, [])

  useEffect(() => {
    saveTraceSettings({ engine, gravure: opts, decoupe: decoupeOpts })
  }, [engine, opts, decoupeOpts])

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

      setOutlineData(outline)
      setSilhouetteData(silhouette)
      setGravureData(gravure)
      setPhotoData(photo)
      setLineDesignData(lineDesign)
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
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <a href="/pipeline/" className="text-sm text-stone-500 hover:text-stone-300">← Pipeline</a>
          <h1 className="text-lg font-bold mt-0.5">Labo — Centerline trace</h1>
          <p className="text-xs text-stone-500 max-w-2xl mt-1">
            Sélectionnez une génération : outline, gravure et photo step1 sont chargées automatiquement.
            Les yeux détectés sur la photo sont reportés en ellipses sur la gravure.
          </p>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 py-6 grid lg:grid-cols-[300px_1fr] gap-6">
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
            <h2 className="text-sm font-semibold text-stone-200">Moteur</h2>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2 text-xs text-stone-300 cursor-pointer">
                <input type="radio" name="engine" checked={engine === 'browser'} onChange={() => setEngine('browser')} className="accent-amber-500 mt-0.5" />
                <span>
                  <span className="font-medium text-stone-200">Navigateur</span>
                  <span className="block text-stone-500">Skeleton-tracing</span>
                </span>
              </label>
              <label className={`flex items-start gap-2 text-xs cursor-pointer ${autotraceOk === false ? 'opacity-50' : 'text-stone-300'}`}>
                <input type="radio" name="engine" checked={engine === 'autotrace'} onChange={() => setEngine('autotrace')} disabled={autotraceOk === false} className="accent-amber-500 mt-0.5" />
                <span>
                  <span className="font-medium text-stone-200">Autotrace (local)</span>
                  <span className="block text-stone-500">
                    {autotraceOk === false ? 'Non disponible' : 'Inkscape centerline'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-stone-200">Paramètres découpe</h2>
            <Slider
              id="decoupe-path-smoothness"
              label="Lissage paths corps"
              hint="Réduit les points des silhouettes avant union (0 = brut). Utile si artefact vertical à la fermeture."
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
            {visibleParams.map(p => (
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
            <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
              <input type="checkbox" checked={opts.pathOrderDebug} onChange={e => setOpt('pathOrderDebug', e.target.checked)} className="accent-amber-500" />
              Dégradé ordre laser (vert → bleu, selon X)
            </label>
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
                setEngine(d.engine)
              }}
              className="w-full text-xs py-2 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-200"
            >
              Réinitialiser
            </button>
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
              <TraceSlot
                title="Outline / Découpe"
                subtitle="Outline tracé → aperçu corps+socle → union (fermeture au socle seulement)"
                imageData={outlineData}
                setImageData={setOutlineData}
                traceOpts={OUTLINE_TRACE_OPTS}
                optimizeOpts={decoupeOpts}
                engine={engine}
                maskData={maskData}
                applyDecoupeUnion
                onTraceResult={setOutlineRaw}
              />
              <TraceSlot
                title="Gravure"
                subtitle="Gravure + ellipses yeux (masque blanc avant trace)"
                imageData={gravureData}
                setImageData={setGravureData}
                traceOpts={opts}
                optimizeOpts={opts}
                engine={engine}
                mappedEyes={mappedEyes}
                maskEyesBeforeTrace
                onTraceResult={setGravureRaw}
              />

              {mergedSvg && (
                <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-stone-100">SVG fusionné laser</h3>
                      <p className="text-xs text-stone-500">
                        Calque « découpe » (rouge) + « gravure » (noir, yeux inclus)
                      </p>
                    </div>
                    <a
                      href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(mergedSvg)}`}
                      download="mini-nous-laser.svg"
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950"
                    >
                      Télécharger SVG fusionné
                    </a>
                  </div>
                  <div className="p-3">
                    <ZoomableStage label="Aperçu export (découpe + gravure)">
                      <div
                        className="relative w-full [&_svg]:max-w-none [&_svg]:w-full [&_svg]:h-auto bg-white rounded"
                        dangerouslySetInnerHTML={{ __html: mergedSvg }}
                      />
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
