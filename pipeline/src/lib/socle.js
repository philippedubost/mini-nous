/**
 * Socles arrondis sous chaque personnage (découpe laser).
 */

const SOCLE_WIDTH_RATIO = 0.055 * 2.4
const BEZIER_K = 0.5522847498

/**
 * Rectangle arrondi en cubiques uniquement (pas de commande A).
 */
export function roundedRectPath(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  const x2 = x + w
  const y2 = y + h
  const k = rad * BEZIER_K

  return [
    `M ${(x + rad).toFixed(2)} ${y.toFixed(2)}`,
    `L ${(x2 - rad).toFixed(2)} ${y.toFixed(2)}`,
    `C ${(x2 - rad + k).toFixed(2)} ${y.toFixed(2)} ${x2.toFixed(2)} ${(y + rad - k).toFixed(2)} ${x2.toFixed(2)} ${(y + rad).toFixed(2)}`,
    `L ${x2.toFixed(2)} ${(y2 - rad).toFixed(2)}`,
    `C ${x2.toFixed(2)} ${(y2 - rad + k).toFixed(2)} ${(x2 - rad + k).toFixed(2)} ${y2.toFixed(2)} ${(x2 - rad).toFixed(2)} ${y2.toFixed(2)}`,
    `L ${(x + rad).toFixed(2)} ${y2.toFixed(2)}`,
    `C ${(x + rad - k).toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${(y2 - rad + k).toFixed(2)} ${x.toFixed(2)} ${(y2 - rad).toFixed(2)}`,
    `L ${x.toFixed(2)} ${(y + rad).toFixed(2)}`,
    `C ${x.toFixed(2)} ${(y + rad - k).toFixed(2)} ${(x + rad - k).toFixed(2)} ${y.toFixed(2)} ${(x + rad).toFixed(2)} ${y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** Polygone fermé pour union booléenne. */
export function roundedRectPolygon(x, y, w, h, r, arcSteps = 8) {
  const rad = Math.min(r, w / 2, h / 2)
  const pts = []
  const corners = [
    { cx: x + w - rad, cy: y + rad, a0: -Math.PI / 2, a1: 0 },
    { cx: x + w - rad, cy: y + h - rad, a0: 0, a1: Math.PI / 2 },
    { cx: x + rad, cy: y + h - rad, a0: Math.PI / 2, a1: Math.PI },
    { cx: x + rad, cy: y + rad, a0: Math.PI, a1: (3 * Math.PI) / 2 },
  ]
  for (const c of corners) {
    for (let i = 0; i <= arcSteps; i++) {
      const t = i / arcSteps
      const a = c.a0 + (c.a1 - c.a0) * t
      pts.push([c.cx + rad * Math.cos(a), c.cy + rad * Math.sin(a)])
    }
  }
  if (pts.length) pts.push([pts[0][0], pts[0][1]])
  return pts
}

/**
 * Socle standardisé par personnage : pieds au sol, hauteur ≈ bas de mollet.
 */
export function computeSocleRects(bodies, W, H, { kerfMm = 0, pxPerMm = 1 } = {}) {
  if (!bodies?.length) return []

  const kerfPx = kerfMm * pxPerMm
  const heights = bodies.map(b => b.h * H).sort((a, b) => a - b)
  const medianBodyH = heights[Math.floor(heights.length / 2)] ?? H * 0.4

  const socleH = medianBodyH * 0.16 * 0.7
  const socleW = Math.max(W * SOCLE_WIDTH_RATIO - kerfPx * 2, W * SOCLE_WIDTH_RATIO * 0.85)
  const cornerR = Math.min(socleW, socleH) * 0.22

  return bodies.map(body => {
    const footBottom = (body.y + body.h) * H
    const cx = body.cx * W
    return {
      x: cx - socleW / 2,
      y: footBottom - socleH,
      w: socleW,
      h: Math.max(socleH - kerfPx, socleH * 0.9),
      r: cornerR,
      cx,
    }
  })
}
