/**
 * outline.js — client-side silhouette extraction, no API call.
 *
 * processLineArt(source, opts)
 *   → BFS flood fill → masque silhouette dilaté
 *   → contour masque (bulky) = bord du masque, épaisseur sw
 *   → découpe serrée = même contour, épaisseur sw/3
 *   → gravure = line art dans le masque dilaté, hors zone bulky
 *   → overlay = rouge découpe serrée + bleu gravure
 *
 * Default opts: { thresh:240, dm:2, sw:8, swTight:0, swr:1 }
 */

export const DEFAULT_OUTLINE_OPTS = {
  thresh: 240,
  dm: 2,
  sw: 8,
  swTight: 0,
  swr: 1,
}

// ── helpers ───────────────────────────────────────────────────────────────

function loadImageFromUrl(url) {
  const src = typeof url === 'string' && url.startsWith('http')
    ? `/api/proxy-image?url=${encodeURIComponent(url)}`
    : url

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Impossible de charger l\'image (CORS ou URL invalide)'))
    img.src = src
  })
}

function imgToPixels(img) {
  const W = img.naturalWidth || img.width
  const H = img.naturalHeight || img.height
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  c.getContext('2d').drawImage(img, 0, 0)
  return { data: c.getContext('2d').getImageData(0, 0, W, H).data, W, H }
}

function lumaAt(data, i) {
  return 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
}

// BFS flood fill from all 4 edges — marks exterior white pixels.
// Returns mask where 1 = subject (non-exterior).
function buildMask(data, W, H, thresh) {
  const exterior = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  let qHead = 0, qTail = 0
  const luma = (i) => lumaAt(data, i)
  const seed = (i) => {
    if (luma(i) >= thresh && !exterior[i]) { exterior[i] = 1; queue[qTail++] = i }
  }
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x) }
  for (let y = 1; y < H - 1; y++) { seed(y * W); seed(y * W + W - 1) }
  while (qHead < qTail) {
    const idx = queue[qHead++]
    const x = idx % W, y = (idx / W) | 0
    if (x > 0)   seed(idx - 1)
    if (x < W - 1) seed(idx + 1)
    if (y > 0)   seed(idx - W)
    if (y < H - 1) seed(idx + W)
  }
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) mask[i] = exterior[i] ? 0 : 1
  return mask
}

// 1px border: mask pixels that have at least one non-mask 4-neighbour.
function thinContour(mask, W, H) {
  const c = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!mask[i]) continue
      c[i] = (x === 0 || !mask[i - 1] ||
               x === W - 1 || !mask[i + 1] ||
               y === 0 || !mask[i - W] ||
               y === H - 1 || !mask[i + W]) ? 1 : 0
    }
  }
  return c
}

// Separable box dilation — fast O(W*H*r) instead of O(W*H*r²).
function dilate(mask, W, H, r) {
  if (r <= 0) return mask
  const tmp = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0
      for (let dx = -r; dx <= r && !v; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < W) v = mask[y * W + nx]
      }
      tmp[y * W + x] = v
    }
  }
  const out = new Uint8Array(W * H)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let v = 0
      for (let dy = -r; dy <= r && !v; dy++) {
        const ny = y + dy
        if (ny >= 0 && ny < H) v = tmp[ny * W + x]
      }
      out[y * W + x] = v
    }
  }
  return out
}

function maskToCanvas(mask, W, H, { fg = 0, bg = 255 } = {}) {
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  const id = ctx.createImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const v = mask[i] ? fg : bg
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
    id.data[i * 4 + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return c
}

function makeCanvas(W, H) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  return c
}

// ── main export ───────────────────────────────────────────────────────────

/**
 * Process a line art image into extraction layers.
 * @param {HTMLImageElement|string} source
 * @param {object} opts
 *   thresh    {number} 240  — luminance threshold for white background
 *   dm        {number} 2    — dilation masque (gravure / clip)
 *   sw        {number} 4    — contour bulky (masquage gravure)
 *   swTight   {number} 0    — épaississement découpe (0 = bord masque brut)
 *   swr       {number} 1    — épaisseur contour rouge overlay (px)
 * @returns {Promise<{
 *   outline: HTMLCanvasElement,  — tight découpe (à tracer)
 *   outlineBulky: HTMLCanvasElement,
 *   gravure: HTMLCanvasElement,
 *   overlay: HTMLCanvasElement,
 * }>}
 */
export async function processLineArt(source, {
  thresh  = 240,
  dm      = 2,
  sw      = 4,
  swTight = 0,
  swr     = 1,
} = {}) {
  const tightSw = Math.max(0, swTight ?? 0)
  const tightSwr = Math.max(1, Math.round(swr / 3))

  const img = typeof source === 'string' ? await loadImageFromUrl(source) : source
  const { data, W, H } = imgToPixels(img)

  const mask       = buildMask(data, W, H, thresh)
  const maskDil    = dilate(mask, W, H, dm)
  const thinBulky  = thinContour(maskDil, W, H)
  const thinTight  = thinContour(mask, W, H)
  const thickBulky = dilate(thinBulky, W, H, sw)
  const thickTight = tightSw > 0 ? dilate(thinTight, W, H, tightSw) : thinTight
  const thickTightRed = dilate(thinTight, W, H, tightSwr)

  const outlineC      = maskToCanvas(thickTight, W, H)
  const outlineBulkyC = maskToCanvas(thickBulky, W, H)

  // ── gravure: line art inside dilated mask, outside bulky contour ──────
  const gravureC = makeCanvas(W, H)
  {
    const ctx = gravureC.getContext('2d')
    const id = ctx.createImageData(W, H)
    for (let i = 0; i < W * H; i++) {
      const laL = lumaAt(data, i)
      const v = (maskDil[i] && !thickBulky[i]) ? Math.round(laL) : 255
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
      id.data[i * 4 + 3] = 255
    }
    ctx.putImageData(id, 0, 0)
  }

  // ── overlay: red tight découpe + blue gravure ─────────────────────────
  const overlayC = makeCanvas(W, H)
  {
    const ctx = overlayC.getContext('2d')
    const id = ctx.createImageData(W, H)
    for (let i = 0; i < W * H; i++) {
      const laL = lumaAt(data, i)
      const isRed  = thickTightRed[i]
      const isBlue = maskDil[i] && !thickBulky[i] && laL < 200
      let r = 255, g = 255, b = 255
      if (isRed && isBlue) {
        r = 180; g = 0; b = 180
      } else if (isRed) {
        r = 210; g = 20; b = 20
      } else if (isBlue) {
        const d = 1 - laL / 255
        r = Math.round(255 - d * 225)
        g = Math.round(255 - d * 155)
        b = Math.round(255 - d * 35)
      }
      id.data[i * 4] = r; id.data[i * 4 + 1] = g; id.data[i * 4 + 2] = b; id.data[i * 4 + 3] = 255
    }
    ctx.putImageData(id, 0, 0)
  }

  return { outline: outlineC, outlineBulky: outlineBulkyC, gravure: gravureC, overlay: overlayC }
}

/** Aperçu gravure : zones masquées par le contour bulky en rouge. */
export function buildGravureMaskPreview(gravureData, bulkyData) {
  if (!gravureData || !bulkyData) return null
  const W = gravureData.width
  const H = gravureData.height
  if (bulkyData.width !== W || bulkyData.height !== H) return null
  const out = new ImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const gi = i * 4
    const masked = bulkyData.data[gi] < 200
    if (masked) {
      out.data[gi] = 220
      out.data[gi + 1] = 48
      out.data[gi + 2] = 48
      out.data[gi + 3] = 255
    } else {
      out.data[gi] = gravureData.data[gi]
      out.data[gi + 1] = gravureData.data[gi + 1]
      out.data[gi + 2] = gravureData.data[gi + 2]
      out.data[gi + 3] = 255
    }
  }
  return out
}
