/**
 * Découpe : union booléenne corps + socle par personnage.
 * Fermeture uniquement au socle (pas de corde tête↔fin du tracé).
 */

import polygonClipping from 'polygon-clipping'
import { parsePathPoints, pointsToLinePathD, simplifyBodyPathPoints } from './centerlineTrace'
import { computeSocleRects, roundedRectPath, roundedRectPolygon } from './socle'

const { union: polyUnion } = polygonClipping

export const DECOUPE_BODY_COLOR = '#2563eb'
export const DECOUPE_SOCLE_COLOR = '#dc2626'

function labelAt(labels, W, H, x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return 0
  return labels[iy * W + ix]
}

function assignPathBodyId(pts, labels, W, H, bodies, bodyIds) {
  const counts = new Map()
  for (const [x, y] of pts) {
    const id = labelAt(labels, W, H, x, y)
    if (id && bodyIds.has(id)) counts.set(id, (counts.get(id) || 0) + 1)
  }
  if (counts.size) {
    let best = null
    let bestN = 0
    for (const [id, n] of counts) {
      if (n > bestN) { bestN = n; best = id }
    }
    return best
  }
  if (!pts.length) return null
  let sx = 0
  let sy = 0
  for (const [x, y] of pts) { sx += x; sy += y }
  const nx = sx / pts.length / W
  const ny = sy / pts.length / H
  let best = null
  let bestScore = Infinity
  for (const body of bodies) {
    if (!bodyIds.has(body.id)) continue
    if (nx < body.x || nx > body.x + body.w || ny < body.y || ny > body.y + body.h) continue
    const dx = nx - body.cx
    const dy = ny - (body.y + body.h * 0.5)
    const score = dx * dx + dy * dy
    if (score < bestScore) { bestScore = score; best = body.id }
  }
  return best
}

function isClosedPath(pts) {
  if (pts.length < 3) return false
  const [x0, y0] = pts[0]
  const [xn, yn] = pts[pts.length - 1]
  return Math.hypot(x0 - xn, y0 - yn) < 0.5
}

function twoLowestIndices(pts) {
  const sorted = pts
    .map((p, i) => ({ i, y: p[1], x: p[0] }))
    .sort((a, b) => b.y - a.y || a.x - b.x)
  let iA = sorted[0].i
  let iB = sorted[1].i
  if (iA === iB && sorted.length > 2) iB = sorted[2].i
  return [iA, iB]
}

function topY(seg) {
  return Math.min(...seg.map(p => p[1]))
}

/** Arc extérieur entre chevilles — ordre original des points conservé. */
function outerArcBetween(pts, iA, iB) {
  if (iA === iB) return pts
  let a = iA
  let b = iB
  if (a > b) [a, b] = [b, a]

  const forward = pts.slice(a, b + 1)
  const wrap = [...pts.slice(b), ...pts.slice(0, a + 1)]
  return topY(forward) <= topY(wrap) ? forward : wrap
}

/**
 * Anneau pour union booléenne : fermeture au bas du socle seulement.
 * Ne relie jamais le 1er et le dernier point du tracé ouvert directement.
 */
function bodyRingForUnion(pts, rect) {
  if (!pts || pts.length < 3) return null

  if (isClosedPath(pts)) {
    const [x0, y0] = pts[0]
    if (pts[pts.length - 1][0] === x0 && pts[pts.length - 1][1] === y0) return pts
    return [...pts, [x0, y0]]
  }

  const [iA, iB] = twoLowestIndices(pts)
  const outer = outerArcBetween(pts, iA, iB)
  if (outer.length < 2) return null

  const start = outer[0]
  const end = outer[outer.length - 1]
  const bottomY = rect.y + rect.h

  return [...outer, [end[0], bottomY], [start[0], bottomY], start]
}

function bodyRingsFromItems(items, rect) {
  return items.map(({ pts }) => bodyRingForUnion(pts, rect)).filter(Boolean)
}

function ringToPathD(ring) {
  return `M ${ring.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')} Z`
}

function unionRings(rings) {
  let result = null
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue
    const poly = [[ring]]
    result = result ? polyUnion(result, poly) : poly
  }
  return result
}

function multiPolygonToPathItems(multi) {
  const items = []
  for (const poly of multi || []) {
    if (!poly?.length) continue
    items.push({ ring: poly[0], hole: false })
    for (let i = 1; i < poly.length; i++) {
      items.push({ ring: poly[i], hole: true })
    }
  }
  return items
}

function appendPathEl(doc, root, d, stroke, sw, attrs = {}) {
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', stroke)
  path.setAttribute('stroke-width', String(sw))
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  for (const [k, v] of Object.entries(attrs)) path.setAttribute(k, v)
  root.appendChild(path)
}

function groupPathsByBody(outlineSvg, maskData, opts = {}) {
  const smoothness = opts.pathSmoothness ?? 0
  const { bodies, labels, width: W, height: H } = maskData
  const bodyIds = new Set(bodies.map(b => b.id))
  const rects = computeSocleRects(bodies, W, H)
  const rectById = new Map(bodies.map((b, i) => [b.id, rects[i]]))

  const doc = new DOMParser().parseFromString(outlineSvg, 'image/svg+xml')
  const root = doc.documentElement
  const pathEls = [...root.querySelectorAll('path')].filter(
    el => !el.hasAttribute('data-socle') && !el.hasAttribute('data-union') && !el.hasAttribute('data-corps'),
  )

  const byBody = new Map()
  const unassigned = []

  for (const el of pathEls) {
    const rawPts = parsePathPoints(el.getAttribute('d') || '')
    const bodyId = assignPathBodyId(rawPts, labels, W, H, bodies, bodyIds)
    let pts = rawPts
    let d = el.getAttribute('d') || ''
    if (bodyId) {
      const rect = rectById.get(bodyId)
      pts = simplifyBodyPathPoints(rawPts, smoothness, rect)
      d = pointsToLinePathD(pts)
    }
    const item = { el, d, pts }
    if (bodyId) {
      if (!byBody.has(bodyId)) byBody.set(bodyId, [])
      byBody.get(bodyId).push(item)
    } else {
      unassigned.push(item)
    }
  }

  return { doc, root, byBody, unassigned, bodies, rectById, W, H }
}

function gravureFootZone(body, rect, W) {
  const socleH = rect.h
  const pad = Math.max(2, socleH * 0.08)
  return {
    x0: Math.min(rect.x - 8, body.x * W),
    x1: Math.max(rect.x + rect.w + 8, (body.x + body.w) * W),
    y0: rect.y - pad,
    y1: rect.y + socleH + pad,
  }
}

function pointInZone([x, y], zone) {
  return x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1
}

function extractSegmentsInZone(pts, zone) {
  const segments = []
  let run = []
  for (const pt of pts) {
    if (pointInZone(pt, zone)) {
      run.push(pt)
    } else if (run.length) {
      if (run.length >= 2) segments.push([...run])
      run = []
    }
  }
  if (run.length >= 2) segments.push(run)
  return segments
}

function segmentToD(pts) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`
  }
  return d
}

function appendOpenBodyAndSocle(doc, root, items, rect, bodyStroke, socleStroke, sw, bodyAttrs = {}, socleAttrs = {}) {
  for (const { d } of items) {
    appendPathEl(doc, root, d, bodyStroke, sw, { 'data-corps': '1', ...bodyAttrs })
  }
  if (rect) {
    appendPathEl(
      doc,
      root,
      roundedRectPath(rect.x, rect.y, rect.w, rect.h, rect.r),
      socleStroke,
      sw,
      { 'data-socle': '1', ...socleAttrs },
    )
  }
}

/**
 * Segments outline dans la zone pieds / socle — gravure noire.
 */
export function extractFootDecoupePathDs(outlineSvg, maskData) {
  if (!outlineSvg || !maskData?.bodies?.length || !maskData.labels) return []

  const { bodies, labels, width: W, height: H } = maskData
  const bodyIds = new Set(bodies.map(b => b.id))
  const rects = computeSocleRects(bodies, W, H)
  const rectById = new Map(bodies.map((b, i) => [b.id, rects[i]]))
  const bodyById = new Map(bodies.map(b => [b.id, b]))

  const doc = new DOMParser().parseFromString(outlineSvg, 'image/svg+xml')
  const pathEls = [...doc.documentElement.querySelectorAll('path')]
  const ds = []

  for (const el of pathEls) {
    const d = el.getAttribute('d') || ''
    const pts = parsePathPoints(d)
    const bodyId = assignPathBodyId(pts, labels, W, H, bodies, bodyIds)
    if (!bodyId) continue
    const body = bodyById.get(bodyId)
    const rect = rectById.get(bodyId)
    if (!body || !rect) continue

    const zone = gravureFootZone(body, rect, W)
    for (const seg of extractSegmentsInZone(pts, zone)) {
      const segD = segmentToD(seg)
      if (segD) ds.push(segD)
    }
  }

  return ds
}

/** Aperçu : paths corps ouverts (bleu) + socle (rouge) — tracé inchangé. */
export function buildDecoupePreUnionSvg(outlineSvg, maskData, opts = {}) {
  if (!outlineSvg || !maskData?.bodies?.length || !maskData.labels) return outlineSvg

  const bodyColor = opts.bodyColor ?? DECOUPE_BODY_COLOR
  const socleColor = opts.socleColor ?? DECOUPE_SOCLE_COLOR
  const sw = opts.strokeWidth ?? 1

  const { doc, root, byBody, unassigned, bodies, rectById } = groupPathsByBody(outlineSvg, maskData, opts)

  for (const el of [...root.querySelectorAll('path')]) el.remove()
  for (const { el } of unassigned) root.appendChild(el)

  for (const body of [...bodies].sort((a, b) => a.cx - b.cx || a.cy - b.cy)) {
    const items = byBody.get(body.id) || []
    const rect = rectById.get(body.id)
    appendOpenBodyAndSocle(doc, root, items, rect, bodyColor, socleColor, sw, {
      'data-body-id': String(body.id),
    }, {
      'data-body-id': String(body.id),
    })
  }

  return new XMLSerializer().serializeToString(root)
}

/**
 * Union corps + socle (Path ▸ Union) : anneau fermé au socle uniquement, puis union booléenne.
 */
export function mergeDecoupeSocleUnion(outlineSvg, maskData, opts = {}) {
  if (!outlineSvg || !maskData?.bodies?.length || !maskData.labels) return outlineSvg

  const stroke = opts.decoupeColor ?? DECOUPE_SOCLE_COLOR
  const sw = opts.strokeWidth ?? 1

  const { doc, root, byBody, unassigned, bodies, rectById } = groupPathsByBody(outlineSvg, maskData, opts)

  for (const el of [...root.querySelectorAll('path')]) el.remove()
  for (const { el } of unassigned) root.appendChild(el)

  for (const body of [...bodies].sort((a, b) => a.cx - b.cx || a.cy - b.cy)) {
    const items = byBody.get(body.id) || []
    const rect = rectById.get(body.id)
    if (!rect) {
      for (const { d } of items) appendPathEl(doc, root, d, stroke, sw)
      continue
    }

    const bodyRings = bodyRingsFromItems(items, rect)
    const socleRing = roundedRectPolygon(rect.x, rect.y, rect.w, rect.h, rect.r)
    const merged = unionRings([...bodyRings, socleRing])
    const pathItems = multiPolygonToPathItems(merged)

    if (!pathItems.length) {
      appendOpenBodyAndSocle(doc, root, items, rect, stroke, stroke, sw, { 'data-union-fallback': '1' })
      continue
    }

    for (const { ring, hole } of pathItems) {
      appendPathEl(doc, root, ringToPathD(ring), stroke, sw, {
        'data-union': '1',
        ...(hole ? { 'data-hole': '1' } : {}),
      })
    }
  }

  return new XMLSerializer().serializeToString(root)
}
