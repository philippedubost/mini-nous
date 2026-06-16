/**
 * Socles arrondis sous chaque personnage (découpe laser).
 */

const SOCLE_WIDTH_RATIO = 0.055 * 2.4

/** Path SVG d'un rectangle aux coins arrondis (fermé). */
export function roundedRectPath(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  const x2 = x + w
  const y2 = y + h
  return [
    `M ${x + rad} ${y}`,
    `H ${x2 - rad}`,
    `A ${rad} ${rad} 0 0 1 ${x2} ${y + rad}`,
    `V ${y2 - rad}`,
    `A ${rad} ${rad} 0 0 1 ${x2 - rad} ${y2}`,
    `H ${x + rad}`,
    `A ${rad} ${rad} 0 0 1 ${x} ${y2 - rad}`,
    `V ${y + rad}`,
    `A ${rad} ${rad} 0 0 1 ${x + rad} ${y}`,
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
export function computeSocleRects(bodies, W, H) {
  if (!bodies?.length) return []

  const heights = bodies.map(b => b.h * H).sort((a, b) => a - b)
  const medianBodyH = heights[Math.floor(heights.length / 2)] ?? H * 0.4

  const socleH = medianBodyH * 0.16 * 0.7
  const socleW = W * SOCLE_WIDTH_RATIO
  const cornerR = Math.min(socleW, socleH) * 0.22

  return bodies.map(body => {
    const footBottom = (body.y + body.h) * H
    const cx = body.cx * W
    return {
      x: cx - socleW / 2,
      y: footBottom - socleH,
      w: socleW,
      h: socleH,
      r: cornerR,
      cx,
    }
  })
}
