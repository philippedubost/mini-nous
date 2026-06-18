import { DEFAULT_TRACE_OPTS, DECOUPE_OPTIMIZE_OPTS, OUTLINE_TRACE_OPTS, finalizeGravureSvg, finalizeGravureSvgAsync, optimizeSvgForLaser } from './centerlineTrace'
import { extractFootDecoupePathDs, buildDecoupeWithSoclesSvg } from './decoupeUnion'

export const LASER_COLORS = {
  decoupe: '#dc2626',
  gravure: '#000000',
}

function parseSvgDoc(svg) {
  return new DOMParser().parseFromString(svg, 'image/svg+xml')
}

export function getSvgSize(svg) {
  const root = parseSvgDoc(svg).documentElement
  const vb = root.viewBox?.baseVal
  return {
    width: parseFloat(root.getAttribute('width')) || vb?.width || 1000,
    height: parseFloat(root.getAttribute('height')) || vb?.height || 1000,
  }
}

/** Extrait paths / groupes (sans wrapper <svg>). */
export function extractSvgChildren(svg) {
  const root = parseSvgDoc(svg).documentElement
  const ser = new XMLSerializer()
  return [...root.childNodes]
    .filter(n => n.nodeType === 1)
    .map(n => ser.serializeToString(n))
    .join('\n    ')
}

export function recolorSvg(svg, stroke, strokeWidth) {
  const doc = parseSvgDoc(svg)
  const root = doc.documentElement
  root.querySelectorAll('path, ellipse').forEach(el => {
    el.setAttribute('stroke', stroke)
    if (strokeWidth != null) el.setAttribute('stroke-width', String(strokeWidth))
    el.removeAttribute('style')
  })
  return new XMLSerializer().serializeToString(root)
}

/** Découpe : outline tracé + socles par personnage. */
export function buildDecoupeSvg(outlineSvg, maskData, opts = {}) {
  if (!outlineSvg) return null
  const o = { ...OUTLINE_TRACE_OPTS, ...DECOUPE_OPTIMIZE_OPTS, ...opts, pathOrderDebug: false, laserRoundTrip: false }

  let svg = optimizeSvgForLaser(outlineSvg, o)
  if (maskData?.bodies?.length) {
    svg = buildDecoupeWithSoclesSvg(svg, maskData, {
      bodyColor: LASER_COLORS.decoupe,
      socleColor: LASER_COLORS.decoupe,
      strokeWidth: o.strokeWidth,
      pathSmoothness: o.pathSmoothness,
      kerfMm: o.kerfMm,
    })
  }

  return recolorSvg(svg, LASER_COLORS.decoupe, o.strokeWidth)
}

/** Gravure laser : dégradé vert → bleu selon le centroïde X. */
export function buildGravureSvg(gravureSvg, mappedEyes, opts = {}, extraPathDs = []) {
  if (!gravureSvg) return null
  const o = {
    ...DEFAULT_TRACE_OPTS,
    ...opts,
  }
  return finalizeGravureSvg(gravureSvg, { mappedEyes, extraPathDs, opts: o })
}

/** Gravure async — ordre laser sans bloquer l'UI. */
export async function buildGravureSvgAsync(gravureSvg, mappedEyes, opts = {}, extraPathDs = [], { onProgress, signal } = {}) {
  if (!gravureSvg) return null
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  return finalizeGravureSvgAsync(gravureSvg, { mappedEyes, extraPathDs, opts: o, onProgress, signal })
}

/**
 * SVG fusionné async : calque « découpe » (rouge) puis « gravure » (noir) au-dessus.
 */
export async function buildMergedLaserSvgAsync({
  decoupeSvg,
  gravureSvg,
  maskData,
  mappedEyes,
  opts = {},
  decoupeOpts = {},
  onProgress,
  signal,
} = {}) {
  if (!decoupeSvg || !gravureSvg) return null

  onProgress?.('Préparation découpe…')
  const decoupeO = { ...OUTLINE_TRACE_OPTS, ...DECOUPE_OPTIMIZE_OPTS, ...decoupeOpts, strokeWidth: 1 }
  const outlineOpt = optimizeSvgForLaser(decoupeSvg, decoupeO)

  const footDecoupePaths = maskData?.bodies?.length
    ? extractFootDecoupePathDs(outlineOpt, maskData, decoupeO)
    : []

  let decoupeBody = outlineOpt
  if (maskData?.bodies?.length) {
    decoupeBody = buildDecoupeWithSoclesSvg(outlineOpt, maskData, {
      bodyColor: LASER_COLORS.decoupe,
      socleColor: LASER_COLORS.decoupe,
      strokeWidth: decoupeO.strokeWidth,
      pathSmoothness: decoupeO.pathSmoothness,
      kerfMm: decoupeO.kerfMm,
    })
  }
  const decoupe = recolorSvg(decoupeBody, LASER_COLORS.decoupe, decoupeO.strokeWidth)

  onProgress?.('Tri X gravure…')
  const gravure = await buildGravureSvgAsync(
    gravureSvg,
    mappedEyes,
    opts,
    footDecoupePaths,
    {
      onProgress: p => onProgress?.(p.message ?? 'Tri X gravure…'),
      signal,
    },
  )

  const { width, height } = getSvgSize(decoupe)
  const decoupeInner = extractSvgChildren(decoupe)
  const gravureInner = extractSvgChildren(gravure)

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <g id="découpe" inkscape:label="découpe" inkscape:groupmode="layer">
    ${decoupeInner}
  </g>
  <g id="gravure" inkscape:label="gravure" inkscape:groupmode="layer">
    ${gravureInner}
  </g>
</svg>`
}

/**
 * SVG fusionné : calque « découpe » (rouge) puis « gravure » (noir) au-dessus.
 */
export function buildMergedLaserSvg({
  decoupeSvg,
  gravureSvg,
  maskData,
  mappedEyes,
  opts = {},
  decoupeOpts = {},
}) {
  if (!decoupeSvg || !gravureSvg) return null

  const decoupeO = { ...OUTLINE_TRACE_OPTS, ...DECOUPE_OPTIMIZE_OPTS, ...decoupeOpts, strokeWidth: 1 }
  const outlineOpt = optimizeSvgForLaser(decoupeSvg, decoupeO)

  const footDecoupePaths = maskData?.bodies?.length
    ? extractFootDecoupePathDs(outlineOpt, maskData, decoupeO)
    : []

  let decoupeBody = outlineOpt
  if (maskData?.bodies?.length) {
    decoupeBody = buildDecoupeWithSoclesSvg(outlineOpt, maskData, {
      bodyColor: LASER_COLORS.decoupe,
      socleColor: LASER_COLORS.decoupe,
      strokeWidth: decoupeO.strokeWidth,
      pathSmoothness: decoupeO.pathSmoothness,
      kerfMm: decoupeO.kerfMm,
    })
  }
  const decoupe = recolorSvg(decoupeBody, LASER_COLORS.decoupe, decoupeO.strokeWidth)

  let gravure = buildGravureSvg(gravureSvg, mappedEyes, opts, footDecoupePaths)

  const { width, height } = getSvgSize(decoupe)
  const decoupeInner = extractSvgChildren(decoupe)
  const gravureInner = extractSvgChildren(gravure)

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <g id="découpe" inkscape:label="découpe" inkscape:groupmode="layer">
    ${decoupeInner}
  </g>
  <g id="gravure" inkscape:label="gravure" inkscape:groupmode="layer">
    ${gravureInner}
  </g>
</svg>`
}
