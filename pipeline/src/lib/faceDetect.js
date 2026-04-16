const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'

let model = null
let modelLoading = null

async function loadScript(src) {
  const existing = document.querySelector(`script[src="${src}"]`)
  if (existing) {
    if (existing.dataset.loaded) return
    return new Promise((res, rej) => {
      existing.addEventListener('load', res)
      existing.addEventListener('error', rej)
    })
  }
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => { s.dataset.loaded = '1'; res() }
    s.onerror = rej
    document.head.appendChild(s)
  })
}

async function loadModel() {
  if (model) return model
  if (modelLoading) return modelLoading
  modelLoading = (async () => {
    await loadScript(TF_URL)
    await loadScript(COCO_URL)
    model = await window.cocoSsd.load()
    return model
  })()
  return modelLoading
}

/**
 * Detect persons with adjustable score threshold (0..1, default 0.4).
 * Returns { count, boxes, naturalWidth, naturalHeight }
 */
export async function detectPersons(imageFile, threshold = 0.4) {
  const net = await loadModel()
  const url = URL.createObjectURL(imageFile)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        const preds = await net.detect(img)
        URL.revokeObjectURL(url)
        const { naturalWidth: nw, naturalHeight: nh } = img
        const persons = preds.filter(p => p.class === 'person' && p.score >= threshold)
        resolve({
          count: persons.length,
          boxes: persons.map(p => ({
            x: p.bbox[0] / nw,
            y: p.bbox[1] / nh,
            w: p.bbox[2] / nw,
            h: p.bbox[3] / nh,
          })),
          naturalWidth: nw,
          naturalHeight: nh,
        })
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')) }
    img.src = url
  })
}

export function drawBoxes(canvas, boxes, naturalWidth, naturalHeight, containerWidth, containerHeight) {
  canvas.width = containerWidth
  canvas.height = containerHeight
  const imgAspect = naturalWidth / naturalHeight
  const boxAspect = containerWidth / containerHeight
  let rW, rH, oX, oY
  if (imgAspect > boxAspect) {
    rW = containerWidth; rH = containerWidth / imgAspect; oX = 0; oY = (containerHeight - rH) / 2
  } else {
    rH = containerHeight; rW = containerHeight * imgAspect; oX = (containerWidth - rW) / 2; oY = 0
  }
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, containerWidth, containerHeight)
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = Math.max(2, rW * 0.004)
  for (const b of boxes) {
    ctx.strokeRect(oX + b.x * rW, oY + b.y * rH, b.w * rW, b.h * rH)
  }
}
