import fs from 'fs'

const path = 'pipeline/src/pages/TraceLabPage.jsx'
const s = fs.readFileSync(path, 'utf8')
const i = s.indexOf('function TraceSlot({')
const j = s.indexOf('export default function TraceLabPage')
if (i < 0 || j < 0) throw new Error('markers not found')

const panels = `function svgPreview(svg) {
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
  const maskPreviewUrl = maskPreviewData ? imageDataToObjectUrl(maskPreviewData) : null

  useEffect(() => {
    if (!imageData) {
      onTraceResult?.(null)
      return undefined
    }
    setBusy(true)
    let cancelled = false
    const t = setTimeout(() => {
      try {
        const input = mappedEyes?.length ? paintEyeMasksOnImageData(imageData, mappedEyes) : imageData
        const result = traceCenterline(input, gravureOpts)
        let svg = optimizeSvgForLaser(result.svg, gravureOpts)
        if (mappedEyes?.length) {
          svg = appendEyeEllipsesToSvg(svg, mappedEyes, { ...gravureOpts, eyeStrokeColor: '#000000' })
        }
        if (!cancelled) onTraceResult?.({ svg, width: result.width, height: result.height })
      } catch {
        if (!cancelled) onTraceResult?.(null)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 320)
    return () => { cancelled = true; clearTimeout(t) }
  }, [imageData, gravureOpts, mappedEyes, onTraceResult])

  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-100">Gravure</h3>
          <p className="text-xs text-stone-500">Contour extérieur masqué avant tracé</p>
        </div>
        {busy && <span className="text-[10px] text-amber-400">Calcul…</span>}
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

`

fs.writeFileSync(path, s.slice(0, i) + panels + s.slice(j), 'utf8')
console.log('patched panels')
