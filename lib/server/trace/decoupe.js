/**
 * Découpe : corps ouverts + socle par personnage (sans union booléenne).
 */

import { parsePathPoints, pointsToLinePathD, simplifyBodyPathPoints } from './centerline.js'
import { computeSocleRects, roundedRectPath } from './socle.js'
import { DOMParser, XMLSerializer } from './dom.js'

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

function appendPathEl(doc, root, d, stroke, sw, attrs = {}) {
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', stroke)
  path.setAttribute('stroke-width', String(sw))
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) path.setAttribute(k, String(v))
  }
  root.appendChild(path)
}

function groupPathsByBody(outlineSvg, maskData, opts = {}) {
  const smoothness = opts.pathSmoothness ?? 0
  const kerfMm = opts.kerfMm ?? 0
  const pxPerMm = opts.pxPerMm ?? (maskData.width / (opts.sheetMm ?? maskData.width))
  const { bodies, labels, width: W, height: H } = maskData
  const bodyIds = new Set(bodies.map(b => b.id))
  const rects = computeSocleRects(bodies, W, H, { kerfMm, pxPerMm })
  const rectById = new Map(bodies.map((b, i) => [b.id, rects[i]]))

  const doc = new DOMParser().parseFromString(outlineSvg, 'image/svg+xml')
  const root = doc.documentElement
  const pathEls = [...root.querySelectorAll('path')].filter(
    el => !el.hasAttribute('data-socle') && !el.hasAttribute('data-corps'),
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
      { 'data-socle': '1', id: `socle-${socleAttrs['data-body-id'] ?? 'body'}`, ...socleAttrs },
    )
  }
}

/** Segments outline dans la zone pieds / socle — gravure noire. */
export function extractFootDecoupePathDs(outlineSvg, maskData, opts = {}) {
  if (!outlineSvg || !maskData?.bodies?.length || !maskData.labels) return []

  const kerfMm = opts.kerfMm ?? 0
  const pxPerMm = opts.pxPerMm ?? (maskData.width / (opts.sheetMm ?? maskData.width))
  const { bodies, labels, width: W, height: H } = maskData
  const bodyIds = new Set(bodies.map(b => b.id))
  const rects = computeSocleRects(bodies, W, H, { kerfMm, pxPerMm })
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

/** Paths corps ouverts (bleu) + socle (rouge) par personnage. */
export function buildDecoupeWithSoclesSvg(outlineSvg, maskData, opts = {}) {
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

/** @deprecated utiliser buildDecoupeWithSoclesSvg */
export const buildDecoupePreUnionSvg = buildDecoupeWithSoclesSvg
