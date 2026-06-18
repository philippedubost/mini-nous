/** Aplatit un calque SVG en paths (sans groupes), simplifie la gravure si dense. */

export const BATCH_STROKE_SCALE_DEFAULT = 0.3
export const BATCH_LASER_STROKE_WIDTH_DEFAULT = 1

/** Facteur d'épaisseur des traits sur la planche batch (env `BATCH_STROKE_SCALE`). */
export function getBatchStrokeScale() {
  const raw = process.env.BATCH_STROKE_SCALE
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n)) return n
  }
  return BATCH_STROKE_SCALE_DEFAULT
}

function parseStyleStrokeWidth(style) {
  if (!style) return null
  const m = style.match(/(?:^|;)\s*stroke-width\s*:\s*([^;]+)/i)
  return m ? m[1].trim() : null
}

function readStrokeWidth(node) {
  return node.getAttribute('stroke-width')
    || parseStyleStrokeWidth(node.getAttribute('style'))
    || null
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function multiply(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  }
}

function applyMatrix(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
}

function parseTransform(attr) {
  if (!attr?.trim()) return IDENTITY
  let m = IDENTITY
  const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi
  let match
  while ((match = re.exec(attr)) !== null) {
    const nums = match[2].split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n))
    let local = IDENTITY
    if (match[1] === 'matrix' && nums.length >= 6) {
      local = { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] }
    } else if (match[1] === 'translate') {
      local = { ...IDENTITY, e: nums[0] ?? 0, f: nums[1] ?? 0 }
    } else if (match[1] === 'scale') {
      const sx = nums[0] ?? 1
      const sy = nums[1] ?? sx
      local = { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
    } else if (match[1] === 'rotate') {
      const ang = (nums[0] ?? 0) * Math.PI / 180
      const cos = Math.cos(ang)
      const sin = Math.sin(ang)
      local = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
      if (nums.length >= 3) {
        const cx = nums[1]
        const cy = nums[2]
        local = multiply(multiply({ ...IDENTITY, e: cx, f: cy }, local), { ...IDENTITY, e: -cx, f: -cy })
      }
    }
    m = multiply(m, local)
  }
  return m
}

function tokenizePath(d) {
  const tokens = []
  const re = /([MLCQAHVSTZmlcqahvstz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g
  let m
  while ((m = re.exec(d)) !== null) {
    tokens.push(m[1] ?? Number(m[2]))
  }
  return tokens
}

function pathTokensToD(tokens) {
  let out = ''
  for (const t of tokens) {
    if (typeof t === 'string') out += `${t} `
    else out += `${t.toFixed(2)} `
  }
  return out.trim()
}

function transformPathTokens(tokens, matrix) {
  let i = 0
  let cmd = 'M'
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  const out = []

  const read = () => tokens[i++]

  const emitCmd = (c) => {
    cmd = c
    out.push(c)
  }

  const mapPair = (x, y) => {
    const [nx, ny] = applyMatrix(matrix, x, y)
    out.push(nx, ny)
    cx = x
    cy = y
    return [nx, ny]
  }

  const mapCtrl = (x, y) => {
    const [nx, ny] = applyMatrix(matrix, x, y)
    out.push(nx, ny)
    return [nx, ny]
  }

  while (i < tokens.length) {
    const t = tokens[i]
    if (typeof t === 'string') {
      emitCmd(t)
      i++
      continue
    }

    const c = cmd.toUpperCase()
    if (c === 'M') {
      const x = read()
      const y = read()
      mapPair(x, y)
      sx = x
      sy = y
    } else if (c === 'L') {
      const x = read()
      const y = read()
      mapPair(x, y)
    } else if (c === 'C') {
      mapCtrl(read(), read())
      mapCtrl(read(), read())
      mapPair(read(), read())
    } else if (c === 'Q') {
      mapCtrl(read(), read())
      mapPair(read(), read())
    } else if (c === 'Z' || c === 'z') {
      cx = sx
      cy = sy
    } else if (c === 'A') {
      // Arcs hérités : transformer extrémités, conserver paramètres arc (ellipses déjà en cubiques)
      const rx = read()
      const ry = read()
      const rot = read()
      const laf = read()
      const sf = read()
      const x = read()
      const y = read()
      out.push(rx, ry, rot, laf, sf)
      mapPair(x, y)
    } else {
      out.push(read())
    }
  }
  return pathTokensToD(out)
}

const BEZIER_K = 0.5522847498

function ellipseToCubicBezierPathD(cx, cy, rx, ry) {
  const ox = rx * BEZIER_K
  const oy = ry * BEZIER_K
  const x0 = cx - rx
  const x1 = cx + rx
  const y0 = cy - ry
  const y1 = cy + ry
  return [
    `M ${x0.toFixed(2)} ${cy.toFixed(2)}`,
    `C ${x0.toFixed(2)} ${(cy - oy).toFixed(2)} ${(cx - ox).toFixed(2)} ${y0.toFixed(2)} ${cx.toFixed(2)} ${y0.toFixed(2)}`,
    `C ${(cx + ox).toFixed(2)} ${y0.toFixed(2)} ${x1.toFixed(2)} ${(cy - oy).toFixed(2)} ${x1.toFixed(2)} ${cy.toFixed(2)}`,
    `C ${x1.toFixed(2)} ${(cy + oy).toFixed(2)} ${(cx + ox).toFixed(2)} ${y1.toFixed(2)} ${cx.toFixed(2)} ${y1.toFixed(2)}`,
    `C ${(cx - ox).toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(cy + oy).toFixed(2)} ${x0.toFixed(2)} ${cy.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** Ellipse fermée en cubiques ou double-arc — ne pas simplifier. */
function isPreservedEllipsePathD(d) {
  if (!d?.trim()) return false
  const cCount = (d.match(/\bC\b/g) || []).length
  const aCount = (d.match(/\bA\b/gi) || []).length
  return (cCount >= 4 && /\bZ\b/i.test(d)) || aCount >= 2
}

function rectToPathD(x, y, w, h) {
  return `M ${x.toFixed(2)} ${y.toFixed(2)} L ${(x + w).toFixed(2)} ${y.toFixed(2)} L ${(x + w).toFixed(2)} ${(y + h).toFixed(2)} L ${x.toFixed(2)} ${(y + h).toFixed(2)} Z`
}

function elementToPathD(el) {
  const tag = el.nodeName?.toLowerCase()
  if (tag === 'path') return el.getAttribute('d') || ''
  if (tag === 'rect') {
    const x = Number(el.getAttribute('x') || 0)
    const y = Number(el.getAttribute('y') || 0)
    const w = Number(el.getAttribute('width') || 0)
    const h = Number(el.getAttribute('height') || 0)
    return rectToPathD(x, y, w, h)
  }
  if (tag === 'ellipse' || tag === 'circle') {
    const cx = Number(el.getAttribute('cx') || 0)
    const cy = Number(el.getAttribute('cy') || 0)
    const rx = Number(el.getAttribute('rx') || el.getAttribute('r') || 0)
    const ry = Number(el.getAttribute('ry') || el.getAttribute('r') || rx)
    return ellipseToCubicBezierPathD(cx, cy, rx, ry)
  }
  if (tag === 'line') {
    const x1 = Number(el.getAttribute('x1') || 0)
    const y1 = Number(el.getAttribute('y1') || 0)
    const x2 = Number(el.getAttribute('x2') || 0)
    const y2 = Number(el.getAttribute('y2') || 0)
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n))
    if (pts.length < 4) return ''
    let d = `M ${pts[0].toFixed(2)} ${pts[1].toFixed(2)}`
    for (let i = 2; i < pts.length; i += 2) {
      d += ` L ${pts[i].toFixed(2)} ${pts[i + 1].toFixed(2)}`
    }
    if (tag === 'polygon') d += ' Z'
    return d
  }
  return ''
}

function sampleCubic(p0, p1, p2, p3, steps = 6) {
  const pts = []
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    const u = 1 - t
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return pts
}

function sampleQuadratic(p0, p1, p2, steps = 4) {
  const pts = []
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    const u = 1 - t
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ])
  }
  return pts
}

function pathDToPoints(d) {
  const tokens = tokenizePath(d)
  const pts = []
  let i = 0
  let cmd = 'M'
  let pen = null

  while (i < tokens.length) {
    const t = tokens[i]
    if (typeof t === 'string') {
      cmd = t
      i++
      continue
    }
    const c = cmd.toUpperCase()
    if (c === 'M' || c === 'L') {
      const x = tokens[i]
      const y = tokens[i + 1]
      pts.push([x, y])
      pen = [x, y]
      i += 2
    } else if (c === 'C') {
      const p0 = pen || [0, 0]
      const p1 = [tokens[i], tokens[i + 1]]
      const p2 = [tokens[i + 2], tokens[i + 3]]
      const p3 = [tokens[i + 4], tokens[i + 5]]
      pts.push(...sampleCubic(p0, p1, p2, p3, 4))
      pen = p3
      i += 6
    } else if (c === 'Q') {
      const p0 = pen || [0, 0]
      const p1 = [tokens[i], tokens[i + 1]]
      const p2 = [tokens[i + 2], tokens[i + 3]]
      pts.push(...sampleQuadratic(p0, p1, p2, 3))
      pen = p2
      i += 4
    } else if (c === 'Z') {
      i++
    } else if (c === 'A') {
      const rx = tokens[i]
      const ry = tokens[i + 1]
      const rot = tokens[i + 2]
      const laf = tokens[i + 3]
      const sf = tokens[i + 4]
      const x = tokens[i + 5]
      const y = tokens[i + 6]
      const arcPts = sampleSvgArc(pen || [0, 0], rx, ry, rot, laf, sf, [x, y], 12)
      pts.push(...arcPts)
      pen = [x, y]
      i += 7
    } else {
      i++
    }
  }
  return pts
}

function pathDArcsToPolylines(d) {
  if (!d || !/[Aa]/.test(d)) return d
  const pts = pathDToPoints(d)
  if (pts.length < 2) return d
  return pointsToPolylineD(pts)
}

function rad(deg) {
  return (deg * Math.PI) / 180
}

function sampleSvgArc(p0, rx, ry, xRotDeg, largeArc, sweep, p1, segments = 12) {
  if (!rx || !ry) return [p1]
  const phi = rad(xRotDeg)
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const x1 = p0[0]
  const y1 = p0[1]
  const x2 = p1[0]
  const y2 = p1[1]

  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  let rxSq = rx * rx
  let rySq = ry * ry
  const x1pSq = x1p * x1p
  const y1pSq = y1p * y1p
  const lambda = x1pSq / rxSq + y1pSq / rySq
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
    rxSq = rx * rx
    rySq = ry * ry
  }

  const la = Number(largeArc) !== 0
  const sw = Number(sweep) !== 0
  const sign = la === sw ? -1 : 1
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq
  const den = rxSq * y1pSq + rySq * x1pSq
  const coef = sign * Math.sqrt(Math.max(0, num / den))
  const cxp = coef * (rx * y1p) / ry
  const cyp = coef * -(ry * x1p) / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy
    const det = ux * vy - uy * vx
    return Math.atan2(det, dot)
  }

  const v1x = (x1p - cxp) / rx
  const v1y = (y1p - cyp) / ry
  const v2x = (-x1p - cxp) / rx
  const v2y = (-y1p - cyp) / ry
  let theta1 = angle(1, 0, v1x, v1y)
  let delta = angle(v1x, v1y, v2x, v2y)
  if (!sw && delta > 0) delta -= 2 * Math.PI
  if (sw && delta < 0) delta += 2 * Math.PI

  const out = []
  for (let s = 1; s <= segments; s++) {
    const t = theta1 + (delta * s) / segments
    const cosT = Math.cos(t)
    const sinT = Math.sin(t)
    const x = cosPhi * rx * cosT - sinPhi * ry * sinT + cx
    const y = sinPhi * rx * cosT + cosPhi * ry * sinT + cy
    out.push([x, y])
  }
  return out
}

function scaleStrokeWidth(sw, strokeScale) {
  const base = sw == null || sw === '' ? BATCH_LASER_STROKE_WIDTH_DEFAULT : sw
  const n = Number(base)
  if (Number.isNaN(n)) return String(base)
  const scaled = n * strokeScale
  return String(scaled > 0 ? scaled : BATCH_LASER_STROKE_WIDTH_DEFAULT * strokeScale)
}

/** Garde ~50 % des points, répartis uniformément (1er et dernier conservés). */
function decimateHalf(pts) {
  const n = pts.length
  if (n <= 2) return pts
  const target = Math.max(2, Math.round(n * 0.5))
  if (target >= n) return pts
  const out = []
  for (let i = 0; i < target; i++) {
    out.push(pts[Math.round(i * (n - 1) / (target - 1))])
  }
  return out
}

function pointsToPolylineD(pts) {
  if (!pts.length) return ''
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`
  }
  return d
}

/** Réduit le nombre de points de moitié (×0,5). */
export function simplifyGravurePathD(d) {
  if (!d?.trim()) return d
  const parts = d.split(/(?=[Mm])/).map(s => s.trim()).filter(Boolean)
  const out = []
  for (const part of parts) {
    if (isPreservedEllipsePathD(part)) {
      out.push(part)
      continue
    }
    const pts = pathDToPoints(part)
    if (pts.length <= 2) {
      out.push(part)
      continue
    }
    out.push(pointsToPolylineD(decimateHalf(pts)))
  }
  return out.join(' ')
}

function collectPaths(node, parentMatrix, out) {
  if (!node || node.nodeType !== 1) return
  const tag = node.nodeName.toLowerCase()
  const local = parseTransform(node.getAttribute('transform'))
  const matrix = multiply(parentMatrix, local)

  if (tag === 'g' || tag === 'svg') {
    for (const child of [...node.childNodes]) collectPaths(child, matrix, out)
    return
  }

  const d = elementToPathD(node)
  if (!d) return

  const elId = node.getAttribute('id') || ''
  const dataSocle = node.getAttribute('data-socle')
  const dataCorps = node.getAttribute('data-corps')
  const skipSimplify = tag === 'ellipse' || tag === 'circle' || isPreservedEllipsePathD(d)
    || dataSocle === '1' || elId.startsWith('socle')
  const flatD = pathDArcsToPolylines(d)
  const transformed = transformPathTokens(tokenizePath(flatD), matrix)
  out.push({
    d: transformed,
    skipSimplify,
    id: elId || null,
    dataSocle,
    dataCorps,
    stroke: node.getAttribute('stroke'),
    strokeWidth: readStrokeWidth(node),
    fill: node.getAttribute('fill'),
    strokeLinecap: node.getAttribute('stroke-linecap'),
    strokeLinejoin: node.getAttribute('stroke-linejoin'),
    vectorEffect: node.getAttribute('vector-effect'),
    dataUnion: node.getAttribute('data-union'),
    dataHole: node.getAttribute('data-hole'),
  })
}

export function flattenLayerToPaths(layerEl, {
  placementMatrix, layerId, orderId, simplifyGravure, strokeScale = BATCH_STROKE_SCALE_DEFAULT,
}) {
  if (!layerEl) return []
  const raw = []
  collectPaths(layerEl, IDENTITY, raw)
  const placement = parseTransform(placementMatrix)

  return raw.map((item, idx) => {
    let d = pathDArcsToPolylines(item.d)
    d = transformPathTokens(tokenizePath(d), placement)
    if (simplifyGravure && layerId === 'gravure' && !item.skipSimplify) {
      d = simplifyGravurePathD(d)
    }
    return {
      ...item,
      d,
      orderId,
      index: idx,
      strokeWidth: scaleStrokeWidth(item.strokeWidth, strokeScale),
      vectorEffect: item.vectorEffect === 'non-scaling-stroke' ? null : item.vectorEffect,
    }
  })
}

export function appendFlatPath(doc, layerG, item, layerId) {
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const path = doc.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', item.d)
  path.setAttribute('fill', item.fill || 'none')
  if (item.stroke) path.setAttribute('stroke', item.stroke)
  if (item.strokeWidth != null) path.setAttribute('stroke-width', item.strokeWidth)
  if (item.strokeLinecap) path.setAttribute('stroke-linecap', item.strokeLinecap)
  if (item.strokeLinejoin) path.setAttribute('stroke-linejoin', item.strokeLinejoin)
  if (item.vectorEffect) path.setAttribute('vector-effect', item.vectorEffect)
  if (item.dataUnion) path.setAttribute('data-union', item.dataUnion)
  if (item.dataHole) path.setAttribute('data-hole', item.dataHole)
  if (item.dataSocle) path.setAttribute('data-socle', item.dataSocle)
  if (item.dataCorps) path.setAttribute('data-corps', item.dataCorps)
  const pathId = item.id || (item.dataSocle === '1' ? `socle-${item.orderId}-${item.index}` : null)
  if (pathId) path.setAttribute('id', pathId)
  if (item.orderId) path.setAttribute('data-order-id', String(item.orderId))
  path.setAttribute('data-layer', layerId)
  path.setAttribute('data-path-index', String(item.index))
  layerG.appendChild(path)
}
