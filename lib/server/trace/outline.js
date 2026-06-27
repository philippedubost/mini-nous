import { loadRgbaFromUrl, maskToRgba } from './image.js'

export const DEFAULT_OUTLINE_OPTS = {
  thresh: 240,
  dm: 2,
  sw: 8,
  swTight: 0,
  swr: 1,
}

function lumaAt(data, i) {
  return 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
}

function buildMask(data, W, H, thresh) {
  const exterior = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  let qHead = 0
  let qTail = 0
  const luma = (i) => lumaAt(data, i)
  const seed = (i) => {
    if (luma(i) >= thresh && !exterior[i]) { exterior[i] = 1; queue[qTail++] = i }
  }
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x) }
  for (let y = 1; y < H - 1; y++) { seed(y * W); seed(y * W + W - 1) }
  while (qHead < qTail) {
    const idx = queue[qHead++]
    const x = idx % W
    const y = (idx / W) | 0
    if (x > 0) seed(idx - 1)
    if (x < W - 1) seed(idx + 1)
    if (y > 0) seed(idx - W)
    if (y < H - 1) seed(idx + W)
  }
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) mask[i] = exterior[i] ? 0 : 1
  return mask
}

function thinContour(mask, W, H) {
  const c = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!mask[i]) continue
      c[i] = (x === 0 || !mask[i - 1]
        || x === W - 1 || !mask[i + 1]
        || y === 0 || !mask[i - W]
        || y === H - 1 || !mask[i + W]) ? 1 : 0
    }
  }
  return c
}

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

/**
 * @param {string} sourceUrl
 * @returns {Promise<{ outline, outlineBulky, gravure, overlay }>}
 */
export async function processLineArtFromUrl(sourceUrl, {
  thresh = 240,
  dm = 2,
  sw = 4,
  swTight = 0,
  swr = 1,
} = {}) {
  const tightSw = Math.max(0, swTight ?? 0)
  const tightSwr = Math.max(1, Math.round(swr / 3))

  const { data, width: W, height: H } = await loadRgbaFromUrl(sourceUrl)

  const mask = buildMask(data, W, H, thresh)
  const maskDil = dilate(mask, W, H, dm)
  const thinBulky = thinContour(maskDil, W, H)
  const thinTight = thinContour(mask, W, H)
  const thickBulky = dilate(thinBulky, W, H, sw)
  const thickTight = tightSw > 0 ? dilate(thinTight, W, H, tightSw) : thinTight
  const thickTightRed = dilate(thinTight, W, H, tightSwr)

  const outline = maskToRgba(thickTight, W, H)
  const outlineBulky = maskToRgba(thickBulky, W, H)

  const gravureData = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const laL = lumaAt(data, i)
    const v = (maskDil[i] && !thickBulky[i]) ? Math.round(laL) : 255
    const j = i * 4
    gravureData[j] = gravureData[j + 1] = gravureData[j + 2] = v
    gravureData[j + 3] = 255
  }
  const gravure = { data: gravureData, width: W, height: H }

  const overlayData = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const laL = lumaAt(data, i)
    const isRed = thickTightRed[i]
    const isBlue = maskDil[i] && !thickBulky[i] && laL < 200
    let r = 255
    let g = 255
    let b = 255
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
    const j = i * 4
    overlayData[j] = r
    overlayData[j + 1] = g
    overlayData[j + 2] = b
    overlayData[j + 3] = 255
  }
  const overlay = { data: overlayData, width: W, height: H }

  return { outline, outlineBulky, gravure, overlay }
}
