/**
 * Centerline-style tracing for outline / gravure bitmaps.
 * Browser approximation of Inkscape « Trace bitmap → Centerline » (autotrace).
 * Pipeline: grayscale → autocontrast → blur → threshold → despeckle → skeleton → simplify → SVG
 */

import TraceSkeleton from 'skeleton-tracing-js/dist/trace_skeleton.js'

export const DEFAULT_TRACE_OPTS = {
  threshold: 200,
  autocontrast: false,
  invert: false,
  despeckleLevel: 0,
  filterIterations: 0,
  connectGaps: 0,
  errorThreshold: 0,
  lineThreshold: 2,
  strokeWidth: 1,
  strokeColor: '#000000',
  chunkSize: 2,
  mergeDistance: 1,
  cornerThreshold: 60,
  smoothness: 35,
  pathOrderDebug: true,
  laserRoundTrip: true,
  laserMinPathLength: 20,
}

/** Trace fixe pour la découpe (outline) — non affectée par les paramètres gravure. */
export const OUTLINE_TRACE_OPTS = {
  threshold: 200,
  autocontrast: false,
  invert: false,
  despeckleLevel: 0,
  filterIterations: 0,
  connectGaps: 0,
  errorThreshold: 0,
  lineThreshold: 2,
  strokeWidth: 1,
  strokeColor: '#000000',
  chunkSize: 2,
  mergeDistance: 1,
  cornerThreshold: 60,
  smoothness: 35,
  pathOrderDebug: false,
  laserRoundTrip: false,
  laserMinPathLength: 20,
}

export const DECOUPE_OPTIMIZE_OPTS = {
  pathOrderDebug: false,
  laserRoundTrip: false,
  strokeWidth: 1,
  /** Lissage des paths corps avant union (0 = brut, 100 = fort). */
  pathSmoothness: 14,
  /** Compensation kerf socle en mm (ex. -0.1 resserre les fentes). */
  kerfMm: 0,
}

function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function grayscaleFromImageData({ data, width: W, height: H }) {
  const gray = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const j = i * 4
    gray[i] = Math.round(luma(data[j], data[j + 1], data[j + 2]))
  }
  return gray
}

function autocontrast(gray) {
  let min = 255
  let max = 0
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < min) min = gray[i]
    if (gray[i] > max) max = gray[i]
  }
  const range = max - min || 1
  const out = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.round(((gray[i] - min) / range) * 255)
  }
  return out
}

function boxBlur(gray, W, H, passes) {
  if (passes <= 0) return gray
  let src = gray
  for (let p = 0; p < passes; p++) {
    const horiz = new Uint8Array(src.length)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0
        let n = 0
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx >= 0 && nx < W) { s += src[y * W + nx]; n++ }
        }
        horiz[y * W + x] = Math.round(s / n)
      }
    }
    const vert = new Uint8Array(src.length)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny >= 0 && ny < H) { s += horiz[ny * W + x]; n++ }
        }
        vert[y * W + x] = Math.round(s / n)
      }
    }
    src = vert
  }
  return src
}

function toBinary(gray, threshold, invert) {
  const binary = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    const dark = gray[i] < threshold
    binary[i] = invert ? (dark ? 0 : 1) : (dark ? 1 : 0)
  }
  return binary
}

function despeckle(binary, W, H, level) {
  if (level <= 0) return binary
  const minArea = Math.max(4, level * level * 2)
  const out = new Uint8Array(binary)
  const seen = new Uint8Array(binary.length)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const start = y * W + x
      if (!binary[start] || seen[start]) continue

      const queue = [start]
      const component = []
      seen[start] = 1

      while (queue.length) {
        const idx = queue.pop()
        component.push(idx)
        const cx = idx % W
        const cy = (idx / W) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const ni = ny * W + nx
          if (!binary[ni] || seen[ni]) continue
          seen[ni] = 1
          queue.push(ni)
        }
      }

      if (component.length < minArea) {
        for (const idx of component) out[idx] = 0
      }
    }
  }
  return out
}

function dilateBinary(binary, W, H, r) {
  if (r <= 0) return binary
  const out = new Uint8Array(binary.length)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0
      for (let dy = -r; dy <= r && !v; dy++) {
        for (let dx = -r; dx <= r && !v; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && binary[ny * W + nx]) v = 1
        }
      }
      out[y * W + x] = v
    }
  }
  return out
}

function dist2(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function mergeNearbyPolylines(polylines, maxDist) {
  if (maxDist <= 0 || polylines.length < 2) return polylines
  const maxD2 = maxDist * maxDist
  const merged = polylines.map(p => [...p])
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i]
        const b = merged[j]
        if (!a.length || !b.length) continue
        const pairs = [
          [a[0], b[0], [...b].reverse(), 'start-start'],
          [a[0], b[b.length - 1], b, 'start-end'],
          [a[a.length - 1], b[0], b, 'end-start'],
          [a[a.length - 1], b[b.length - 1], [...b].reverse(), 'end-end'],
        ]
        for (const [p1, p2, attach, mode] of pairs) {
          if (dist2(p1, p2) > maxD2) continue
          if (mode === 'end-start') merged[i] = a.concat(attach)
          else if (mode === 'end-end') merged[i] = a.concat(attach)
          else if (mode === 'start-end') merged[i] = attach.concat(a)
          else merged[i] = attach.concat(a)
          merged.splice(j, 1)
          changed = true
          break
        }
        if (changed) break
      }
      if (changed) break
    }
  }
  return merged
}

function binaryToPreviewImageData(binary, W, H) {
  const id = new ImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const v = binary[i] ? 0 : 255
    const j = i * 4
    id.data[j] = id.data[j + 1] = id.data[j + 2] = v
    id.data[j + 3] = 255
  }
  return id
}

function sqDist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function perpDist(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0]
  const dy = lineEnd[1] - lineStart[1]
  if (dx === 0 && dy === 0) return Math.sqrt(sqDist(point, lineStart))
  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (dx * dx + dy * dy)
  const proj = [
    lineStart[0] + t * dx,
    lineStart[1] + t * dy,
  ]
  return Math.sqrt(sqDist(point, proj))
}

function dedupeNearPoints(pts, minDist) {
  if (pts.length < 2) return pts
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]
    const [px, py] = out[out.length - 1]
    if (Math.hypot(x - px, y - py) >= minDist) out.push(pts[i])
  }
  if (out.length < 2) return pts
  const [x0, y0] = out[0]
  const [xn, yn] = out[out.length - 1]
  if (out.length > 2 && Math.hypot(x0 - xn, y0 - yn) < minDist) out.pop()
  return out
}

function simplifyPathSegment(pts, smoothness) {
  const minDist = smoothness <= 0 ? 0.75 : 0.5 + (smoothness / 100) * 2.5
  let simplified = dedupeNearPoints(pts, minDist)
  if (smoothness > 0 && simplified.length > 2) {
    const epsilon = (smoothness / 100) * 8
    simplified = rdp(simplified, epsilon)
    simplified = dedupeNearPoints(simplified, minDist)
  }
  return simplified.length >= 2 ? simplified : pts
}

/** Réduit les points d'un path corps (dédoublonnage + RDP) avant union découpe. */
export function simplifyBodyPathPoints(pts, smoothness = 0, socleRect = null) {
  if (!pts?.length) return []

  if (socleRect) {
    const socleTop = socleRect.y
    const out = []
    let chunk = []
    const flush = () => {
      if (chunk.length) {
        out.push(...simplifyPathSegment(chunk, smoothness))
        chunk = []
      }
    }
    for (const p of pts) {
      if (p[1] < socleTop) chunk.push(p)
      else {
        flush()
        out.push(p)
      }
    }
    flush()
    return out.length >= 2 ? out : pts
  }

  return simplifyPathSegment(pts, smoothness)
}

export function pointsToLinePathD(pts) {
  if (!pts.length) return ''
  if (pts.length === 1) return `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  return `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')}`
}

function rdp(points, epsilon) {
  if (points.length <= 2 || epsilon <= 0) return points
  let maxDist = 0
  let index = 0
  const end = points.length - 1
  for (let i = 1; i < end; i++) {
    const d = perpDist(points[i], points[0], points[end])
    if (d > maxDist) { maxDist = d; index = i }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon)
    const right = rdp(points.slice(index), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[end]]
}

/** Chaikin corner-cutting — adoucit une polyligne sans la raccourcir trop brutalement */
function chaikinSmooth(points, iterations) {
  if (iterations <= 0 || points.length < 3) return points
  let pts = points
  for (let n = 0; n < iterations; n++) {
    const next = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1])
      next.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1])
    }
    next.push(pts[pts.length - 1])
    pts = next
  }
  return pts
}

/** Courbes quadratiques passant par les points lissés */
function polylineToSmoothPath(points) {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]
    const [xn, yn] = points[i + 1]
    const mx = (x + xn) / 2
    const my = (y + yn) / 2
    d += ` Q ${x} ${y} ${mx} ${my}`
  }
  const last = points[points.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

function smoothPolylines(polylines, smoothness) {
  if (smoothness <= 0) return polylines
  const fullIters = Math.min(5, Math.max(1, Math.round(smoothness / 22)))
  return polylines.map(p => {
    // Courtes polylignes (détails fins) : lissage très léger pour ne pas les effacer
    if (p.length < 20) {
      if (smoothness < 25) return p
      return chaikinSmooth(p, 1)
    }
    if (p.length < 40 && smoothness < 55) {
      return chaikinSmooth(p, Math.min(2, fullIters))
    }
    return chaikinSmooth(p, fullIters)
  })
}

function polylineCentroid(p) {
  let sx = 0
  let sy = 0
  for (const [x, y] of p) { sx += x; sy += y }
  return [sx / p.length, sy / p.length]
}

function lerpRgbColor(t, from, to) {
  const u = Math.max(0, Math.min(1, t))
  const lerp = (a, b) => Math.round(a + (b - a) * u)
  return `rgb(${lerp(from[0], to[0])}, ${lerp(from[1], to[1])}, ${lerp(from[2], to[2])})`
}

/** Dégradé vert → bleu ; t ∈ [0,1] (0 = gauche / vert, 1 = droite / bleu). */
export function orderGravureDebugColor(t) {
  return lerpRgbColor(t, [34, 197, 94], [37, 99, 235])
}

/** Dégradé jaune → rouge ; t ∈ [0,1] (0 = 1er path, 1 = dernier). */
export function orderDecoupeDebugColor(t) {
  return lerpRgbColor(t, [234, 179, 8], [220, 38, 38])
}

/** @deprecated Préférer orderGravureDebugColor ou orderDecoupeDebugColor. */
export function orderDebugColor(t) {
  return orderGravureDebugColor(t)
}

function polylineLength(p) {
  let len = 0
  for (let i = 1; i < p.length; i++) {
    len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  }
  return len
}

/** Aller-retour sur les paths courts pour laisser la tête laser chauffer. */
export function appendRoundTripPolyline(p, minLen) {
  if (p.length < 2) return p
  if (polylineLength(p) >= minLen) return p
  return [...p, ...p.slice(0, -1).reverse()]
}

function parsePathPoints(d) {
  const points = []
  const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return points
  let i = 0
  let cmd = ''
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0

  const readNum = () => parseFloat(tokens[i++])

  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[MLHVCSQTAZmlhvcsqtaz]$/.test(t)) {
      cmd = t
      i++
    }
    switch (cmd) {
      case 'M':
        cx = readNum(); cy = readNum(); sx = cx; sy = cy
        points.push([cx, cy]); cmd = 'L'
        break
      case 'L':
        cx = readNum(); cy = readNum()
        points.push([cx, cy])
        break
      case 'H':
        cx = readNum(); points.push([cx, cy])
        break
      case 'V':
        cy = readNum(); points.push([cx, cy])
        break
      case 'Q':
        readNum(); readNum()
        cx = readNum(); cy = readNum()
        points.push([cx, cy])
        break
      case 'q':
        readNum(); readNum()
        cx += readNum(); cy += readNum()
        points.push([cx, cy])
        break
      case 'Z':
      case 'z':
        cx = sx; cy = sy
        points.push([cx, cy])
        break
      default:
        i++
        break
    }
  }
  return points
}

export { parsePathPoints }

function pathLengthFromPoints(pts) {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  }
  return len
}

export function appendRoundTripPathD(d, minLen) {
  const pts = parsePathPoints(d)
  if (pts.length < 2 || pathLengthFromPoints(pts) >= minLen) return d
  const back = pts.slice(0, -1).reverse()
  const extra = back.map(([x, y]) => `L ${x} ${y}`).join(' ')
  return `${d.trim()} ${extra}`
}

/**
 * Tri X puis Y : parcours gauche → droite (personnages dans l'ordre).
 */
export function orderPolylinesForLaser(polylines) {
  if (polylines.length <= 1) return polylines
  const items = polylines.map(p => {
    const [cx, cy] = polylineCentroid(p)
    return { p, cx, cy }
  })
  items.sort((a, b) => a.cx - b.cx || a.cy - b.cy)
  return items.map(i => i.p)
}

function sortEntriesByX(entries) {
  if (entries.length <= 1) return entries
  const items = entries.map(e => ({
    ...e,
    cx: e.cx ?? e.start[0],
    cy: e.cy ?? e.start[1],
  }))
  items.sort((a, b) => a.cx - b.cx || a.cy - b.cy)
  return items
}

/** Couleur gravure selon le centroïde X (gauche vert → droite bleu). */
export function gravureStrokeColorForCenterX(cx, minX, maxX) {
  const span = maxX - minX
  const t = span > 1e-6 ? (cx - minX) / span : 0
  return orderGravureDebugColor(t)
}

function debugColorForX(cx, minX, maxX) {
  return gravureStrokeColorForCenterX(cx, minX, maxX)
}

function pathStartFromD(d) {
  const m = d.match(/M\s*([-\d.eE+]+)[,\s]+([-\d.eE+]+)/)
  if (m) return [parseFloat(m[1]), parseFloat(m[2])]
  return [0, 0]
}

export function yieldToMain() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

function sortPathEntriesByX(entries) {
  return [...entries].sort((a, b) => {
    const delta = (a.cx ?? 0) - (b.cx ?? 0)
    if (Math.abs(delta) > 1e-6) return delta
    return (a.cy ?? 0) - (b.cy ?? 0)
  })
}

function applyPathOrderMeta(path, index, pathCount) {
  path.setAttribute('data-mn-order', String(index))
  path.setAttribute('data-mn-strategy', 'sortX')
  path.setAttribute('data-mn-path-count', String(pathCount))
}

/** Réordonne les `<path>` d'un SVG par centroïde X + couleurs debug optionnelles. */
export function optimizeSvgForLaser(svg, opts = {}) {
  if (!svg || typeof DOMParser === 'undefined') return svg
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  const pathEls = [...root.querySelectorAll('path')]
  if (!pathEls.length) return svg

  const entries = pathEls.map(el => {
    const start = pathStartFromD(el.getAttribute('d') || '')
    const pts = parsePathPoints(el.getAttribute('d') || '')
    const [cx, cy] = pts.length ? polylineCentroid(pts) : start
    return { el, start, cx, cy }
  })
  pathEls.forEach(el => el.remove())

  const sorted = sortEntriesByX(entries)
  const minX = Math.min(...sorted.map(e => e.cx))
  const maxX = Math.max(...sorted.map(e => e.cx))

  sorted.forEach(entry => {
    const path = entry.el.cloneNode(true)
    const rawD = path.getAttribute('d') || ''
    const d = o.laserRoundTrip
      ? appendRoundTripPathD(rawD, o.laserMinPathLength)
      : rawD
    path.setAttribute('d', d)
    if (o.pathOrderDebug) {
      path.setAttribute('stroke', debugColorForX(entry.cx, minX, maxX))
    } else if (!path.getAttribute('stroke')) {
      path.setAttribute('stroke', o.strokeColor ?? '#000000')
    }
    root.appendChild(path)
  })

  return new XMLSerializer().serializeToString(root)
}

export function polylinesToSvg(polylines, width, height, opts = {}) {
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  const ordered = orderPolylinesForLaser(polylines)
  const items = ordered.map(p => {
    const trip = o.laserRoundTrip ? appendRoundTripPolyline(p, o.laserMinPathLength) : p
    const [cx, cy] = polylineCentroid(trip)
    return { p: trip, cx, cy }
  })
  const minX = items.length ? Math.min(...items.map(i => i.cx)) : 0
  const maxX = items.length ? Math.max(...items.map(i => i.cx)) : 0

  const smoothed = smoothPolylines(items.map(i => i.p), o.smoothness)
  const useCurves = o.smoothness >= 12
  const pairs = items
    .map((item, i) => ({ p: smoothed[i], cx: item.cx }))
    .filter(({ p }) => p.length >= 2)

  const paths = pairs
    .map(({ p, cx }) => {
      const d = useCurves
        ? polylineToSmoothPath(p)
        : `M ${p.map(([x, y]) => `${x} ${y}`).join(' L ')}`
      const stroke = o.pathOrderDebug
        ? debugColorForX(cx, minX, maxX)
        : o.strokeColor
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${o.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
    })
    .join('\n  ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${paths}\n</svg>`
}

function transformEyePoint(x, y, cx, cy) {
  const dx = x - cx
  const dy = y - cy
  const rdx = -dy
  const rdy = dx
  return [rdx * 0.35 + cx, rdy * 0.25 + cy]
}

/** Ellipse yeux → path fermé (même transform qu'avant, sans élément <ellipse>). */
export function eyeToPathD(eye, segments = 28) {
  const { x: cx, y: cy, rx, ry } = eye
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const ex = cx + rx * Math.cos(t)
    const ey = cy + ry * Math.sin(t)
    pts.push(transformEyePoint(ex, ey, cx, cy))
  }
  return `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')} Z`
}

function collectPathEntry(d, o) {
  const rawD = d || ''
  const processedD = o.laserRoundTrip
    ? appendRoundTripPathD(rawD, o.laserMinPathLength)
    : rawD
  const start = pathStartFromD(processedD)
  const pts = parsePathPoints(processedD)
  const [cx, cy] = pts.length ? polylineCentroid(pts) : start
  return { d: processedD, cx, cy }
}

/**
 * Calque gravure final : tri X (gauche → droite), ordre DOM = ordre de gravure.
 * Dégradé vert (gauche) → bleu (droite) selon le centroïde X de chaque path.
 */
export function finalizeGravureSvg(svg, { mappedEyes, extraPathDs = [], opts = {} } = {}) {
  if (!svg || typeof DOMParser === 'undefined') return svg
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  const entries = []

  for (const el of [...root.querySelectorAll('path')]) {
    entries.push(collectPathEntry(el.getAttribute('d') || '', o))
    el.remove()
  }
  root.querySelectorAll('ellipse, g').forEach(el => el.remove())

  for (const face of mappedEyes ?? []) {
    for (const eye of [face.leftEye, face.rightEye]) {
      if (!eye) continue
      entries.push(collectPathEntry(eyeToPathD(eye), o))
    }
  }

  for (const d of extraPathDs) {
    if (d) entries.push(collectPathEntry(d, o))
  }

  if (!entries.length) return svg

  const ordered = sortPathEntriesByX(entries)
  const sw = o.strokeWidth ?? 1
  const minX = Math.min(...ordered.map(e => e.cx ?? 0))
  const maxX = Math.max(...ordered.map(e => e.cx ?? 0))

  ordered.forEach((entry, i) => {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', entry.d)
    path.setAttribute('fill', 'none')
    applyPathOrderMeta(path, i, ordered.length)
    const stroke = o.pathOrderDebug !== false
      ? gravureStrokeColorForCenterX(entry.cx ?? 0, minX, maxX)
      : (o.strokeColor ?? '#000000')
    path.setAttribute('stroke', stroke)
    path.setAttribute('stroke-width', String(sw))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    root.appendChild(path)
  })

  return new XMLSerializer().serializeToString(root)
}

/** Calque gravure final async — tri X sans bloquer l'UI. */
export async function finalizeGravureSvgAsync(
  svg,
  { mappedEyes, extraPathDs = [], opts = {}, onProgress, signal } = {},
) {
  onProgress?.({ phase: 'order', message: 'Tri X…', percent: 50 })
  await yieldToMain()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const result = finalizeGravureSvg(svg, { mappedEyes, extraPathDs, opts })
  onProgress?.({ phase: 'done', message: 'Gravure finalisée', percent: 100 })
  return result
}

/** @deprecated Utiliser finalizeGravureSvg — conserve le nom pour compatibilité. */
export function appendEyeEllipsesToSvg(svg, mappedFaces, opts = {}) {
  return finalizeGravureSvg(svg, { mappedEyes: mappedFaces, opts })
}

export function traceCenterline(imageData, opts = {}) {
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  const { binary, preview, width: W, height: H } = preprocessToBinary(imageData, o)

  const boolArr = new Array(W * H)
  for (let i = 0; i < W * H; i++) boolArr[i] = binary[i] ? 1 : 0

  const result = TraceSkeleton.trace(boolArr, W, H, o.chunkSize)
  let polylines = (result.polylines ?? []).filter(p => p.length >= o.lineThreshold)
  polylines = mergeNearbyPolylines(polylines, o.mergeDistance)
  if (o.errorThreshold > 0) {
    polylines = polylines.map(p => rdp(p, o.errorThreshold))
  }

  const svg = polylinesToSvg(polylines, W, H, o)
  return { svg, polylines, preview, width: W, height: H }
}

export function preprocessToBinary(imageData, opts = {}) {
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  const W = imageData.width
  const H = imageData.height
  let gray = grayscaleFromImageData(imageData)
  if (o.autocontrast) gray = autocontrast(gray)
  gray = boxBlur(gray, W, H, o.filterIterations)
  let binary = toBinary(gray, o.threshold, o.invert)
  binary = dilateBinary(binary, W, H, o.connectGaps)
  binary = despeckle(binary, W, H, o.despeckleLevel)
  return {
    binary,
    preview: binaryToPreviewImageData(binary, W, H),
    width: W,
    height: H,
  }
}

export async function loadImageDataFromFile(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
}

export async function loadImageDataFromUrl(url) {
  const src = typeof url === 'string' && url.startsWith('http')
    ? `/api/proxy-image?url=${encodeURIComponent(url)}`
    : url
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('Impossible de charger l\'image'))
    img.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d').drawImage(img, 0, 0)
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
}

export function imageDataToObjectUrl(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

export async function traceAutotraceServer(imageData, opts = {}) {
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  const base64 = imageDataToObjectUrl(imageData)
  const res = await fetch('/api/trace-autotrace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64,
      opts: {
        despeckleLevel: o.despeckleLevel,
        filterIterations: o.filterIterations,
        errorThreshold: (o.errorThreshold || 2) + o.smoothness / 35,
        lineThreshold: o.lineThreshold,
        cornerThreshold: o.cornerThreshold,
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  const { preview, width, height } = preprocessToBinary(imageData, o)
  return {
    svg: optimizeSvgForLaser(data.svg, o),
    polylines: null,
    preview,
    width,
    height,
    engine: 'autotrace',
  }
}

export async function checkAutotraceAvailable() {
  try {
    const res = await fetch('/api/trace-autotrace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: '' }),
    })
    if (res.status === 400) return true
    if (res.status === 501) return false
    return res.ok
  } catch {
    return false
  }
}
