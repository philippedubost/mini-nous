import { DEFAULT_TRACE_OPTS, DECOUPE_OPTIMIZE_OPTS, OUTLINE_TRACE_OPTS, appendEyeEllipsesToSvg, optimizeSvgForLaser } from './centerlineTrace'
import { extractFootDecoupePathDs, mergeDecoupeSocleUnion } from './decoupeUnion'

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

/** Découpe : outline tracé + union socle par personnage. */
export function buildDecoupeSvg(outlineSvg, maskData, opts = {}) {
  if (!outlineSvg) return null
  const o = { ...OUTLINE_TRACE_OPTS, ...DECOUPE_OPTIMIZE_OPTS, ...opts, pathOrderDebug: false, laserRoundTrip: false }

  let svg = optimizeSvgForLaser(outlineSvg, o)
  if (maskData?.bodies?.length) {
    svg = mergeDecoupeSocleUnion(svg, maskData, {
      decoupeColor: LASER_COLORS.decoupe,
      strokeWidth: o.strokeWidth,
      pathSmoothness: o.pathSmoothness,
    })
  }

  return recolorSvg(svg, LASER_COLORS.decoupe, o.strokeWidth)
}

function appendPathDsToSvg(svg, pathDs, stroke, strokeWidth, attrs = {}) {
  if (!pathDs.length) return svg
  const doc = parseSvgDoc(svg)
  const root = doc.documentElement
  for (const d of pathDs) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', stroke)
    path.setAttribute('stroke-width', String(strokeWidth))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    for (const [k, v] of Object.entries(attrs)) path.setAttribute(k, v)
    root.appendChild(path)
  }
  return new XMLSerializer().serializeToString(root)
}

/** Gravure tracée + yeux noirs. */
export function buildGravureSvg(gravureSvg, mappedEyes, opts = {}) {
  if (!gravureSvg) return null
  const o = {
    ...DEFAULT_TRACE_OPTS,
    ...opts,
    pathOrderDebug: false,
    eyeStrokeColor: LASER_COLORS.gravure,
  }
  let svg = optimizeSvgForLaser(gravureSvg, o)
  if (mappedEyes?.length) svg = appendEyeEllipsesToSvg(svg, mappedEyes, o)
  return recolorSvg(svg, LASER_COLORS.gravure, o.strokeWidth)
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
    ? extractFootDecoupePathDs(outlineOpt, maskData)
    : []

  let decoupeBody = maskData?.bodies?.length
    ? mergeDecoupeSocleUnion(outlineOpt, maskData, {
      decoupeColor: LASER_COLORS.decoupe,
      strokeWidth: decoupeO.strokeWidth,
      pathSmoothness: decoupeO.pathSmoothness,
    })
    : outlineOpt
  const decoupe = recolorSvg(decoupeBody, LASER_COLORS.decoupe, decoupeO.strokeWidth)

  let gravure = buildGravureSvg(gravureSvg, mappedEyes, opts)
  if (footDecoupePaths.length) {
    gravure = appendPathDsToSvg(gravure, footDecoupePaths, LASER_COLORS.gravure, opts.strokeWidth ?? 1, {
      'data-foot-gravure': '1',
    })
  }

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
