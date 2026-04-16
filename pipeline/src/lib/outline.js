/**
 * outline.js — client-side silhouette extraction, no API call.
 *
 * processLineArt(source, opts)
 *   → BFS flood fill from edges → silhouette mask
 *   → dilate mask (smooths jagged details)
 *   → thin contour = 1px border of dilated mask
 *   → thick contour = dilate thin contour (découpe line)
 *   → gravure = line art clipped to dilated mask, minus thick contour zone
 *   → overlay = red contour + blue gravure composite
 *
 * Default opts: { thresh:240, dm:2, sw:4, swr:1 }
 */

// ── helpers ───────────────────────────────────────────────────────────────

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
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

// BFS flood fill from all 4 edges — marks exterior white pixels.
// Returns mask where 1 = subject (non-exterior).
function buildMask(data, W, H, thresh) {
  const exterior = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  let qHead = 0, qTail = 0
  const luma = (i) => 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]
  const seed = (i) => {
    if (luma(i) >= thresh && !exterior[i]) { exterior[i] = 1; queue[qTail++] = i }
  }
  for (let x = 0; x < W; x++) { seed(x); seed((H-1)*W+x) }
  for (let y = 1; y < H-1; y++) { seed(y*W); seed(y*W+W-1) }
  while (qHead < qTail) {
    const idx = queue[qHead++]
    const x = idx % W, y = (idx / W) | 0
    if (x > 0)   seed(idx - 1)
    if (x < W-1) seed(idx + 1)
    if (y > 0)   seed(idx - W)
    if (y < H-1) seed(idx + W)
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
      c[i] = (x === 0 || !mask[i-1] ||
               x === W-1 || !mask[i+1] ||
               y === 0 || !mask[i-W] ||
               y === H-1 || !mask[i+W]) ? 1 : 0
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
        if (nx >= 0 && nx < W) v = mask[y*W+nx]
      }
      tmp[y*W+x] = v
    }
  }
  const out = new Uint8Array(W * H)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let v = 0
      for (let dy = -r; dy <= r && !v; dy++) {
        const ny = y + dy
        if (ny >= 0 && ny < H) v = tmp[ny*W+x]
      }
      out[y*W+x] = v
    }
  }
  return out
}

function makeCanvas(W, H) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  return c
}

// ── main export ───────────────────────────────────────────────────────────

/**
 * Process a line art image into three layers.
 * @param {HTMLImageElement|string} source
 * @param {object} opts
 *   thresh {number} 240  — luminance threshold to detect white background
 *   dm     {number} 2    — mask dilation before contouring (smooths details)
 *   sw     {number} 4    — découpe contour thickness (px)
 *   swr    {number} 1    — red contour thickness in overlay (px)
 * @returns {Promise<{ outline: HTMLCanvasElement, gravure: HTMLCanvasElement, overlay: HTMLCanvasElement }>}
 */
export async function processLineArt(source, {
  thresh = 240,
  dm     = 2,
  sw     = 4,
  swr    = 1,
} = {}) {
  const img = typeof source === 'string' ? await loadImageFromUrl(source) : source
  const { data, W, H } = imgToPixels(img)

  // silhouette mask → smooth → contour
  const mask     = buildMask(data, W, H, thresh)
  const maskDil  = dilate(mask, W, H, dm)
  const thin     = thinContour(maskDil, W, H)
  const thick    = dilate(thin, W, H, sw)
  const thickRed = dilate(thin, W, H, swr)

  // ── outline: black thick contour on white ─────────────────────────────
  const outlineC = makeCanvas(W, H)
  {
    const ctx = outlineC.getContext('2d')
    const id = ctx.createImageData(W, H)
    for (let i = 0; i < W * H; i++) {
      const v = thick[i] ? 0 : 255
      id.data[i*4] = id.data[i*4+1] = id.data[i*4+2] = v
      id.data[i*4+3] = 255
    }
    ctx.putImageData(id, 0, 0)
  }

  // ── gravure: line art inside dilated mask, outside thick contour ──────
  const gravureC = makeCanvas(W, H)
  {
    const ctx = gravureC.getContext('2d')
    const id = ctx.createImageData(W, H)
    for (let i = 0; i < W * H; i++) {
      const laL = 0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]
      const v = (maskDil[i] && !thick[i]) ? Math.round(laL) : 255
      id.data[i*4] = id.data[i*4+1] = id.data[i*4+2] = v
      id.data[i*4+3] = 255
    }
    ctx.putImageData(id, 0, 0)
  }

  // ── overlay: red découpe + blue gravure ───────────────────────────────
  const overlayC = makeCanvas(W, H)
  {
    const ctx = overlayC.getContext('2d')
    const id = ctx.createImageData(W, H)
    for (let i = 0; i < W * H; i++) {
      const laL = 0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]
      const isRed  = thickRed[i]
      const isBlue = maskDil[i] && !thick[i] && laL < 200
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
      id.data[i*4] = r; id.data[i*4+1] = g; id.data[i*4+2] = b; id.data[i*4+3] = 255
    }
    ctx.putImageData(id, 0, 0)
  }

  return { outline: outlineC, gravure: gravureC, overlay: overlayC }
}
