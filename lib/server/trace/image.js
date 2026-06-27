async function loadSharp() {
  const mod = await import('sharp')
  return mod.default
}

/** @returns {{ data: Uint8ClampedArray, width: number, height: number }} */
export async function loadRgbaFromUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Impossible de charger l'image (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const sharp = await loadSharp()
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  }
}

export async function rgbaToPngBuffer({ data, width, height }) {
  const sharp = await loadSharp()
  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }).png().toBuffer()
}

export function maskToRgba(mask, W, H, { fg = 0, bg = 255 } = {}) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const v = mask[i] ? fg : bg
    const j = i * 4
    data[j] = data[j + 1] = data[j + 2] = v
    data[j + 3] = 255
  }
  return { data, width: W, height: H }
}

export async function rgbaToDataUrl(image) {
  const buf = await rgbaToPngBuffer(image)
  return `data:image/png;base64,${buf.toString('base64')}`
}

export async function svgToDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}
