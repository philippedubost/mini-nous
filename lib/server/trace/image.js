import { createRequire } from 'node:module'
import jpeg from 'jpeg-js'

const { PNG } = createRequire(import.meta.url)('pngjs')

function decodeRgbaFromBuffer(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNG.sync.read(buffer)
    return {
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
    }
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const decoded = jpeg.decode(buffer, { useTArray: true })
    const { width, height, data } = decoded
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i]
      rgba[j + 1] = data[i + 1]
      rgba[j + 2] = data[i + 2]
      rgba[j + 3] = 255
    }
    return { data: rgba, width, height }
  }

  throw new Error('Format image non supporté pour le laser (PNG ou JPEG uniquement)')
}

/** @returns {{ data: Uint8ClampedArray, width: number, height: number }} */
export async function loadRgbaFromUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Impossible de charger l'image (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return decodeRgbaFromBuffer(buffer)
}

export async function rgbaToPngBuffer({ data, width, height }) {
  const png = new PNG({ width, height })
  png.data = Buffer.from(data)
  return PNG.sync.write(png)
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
