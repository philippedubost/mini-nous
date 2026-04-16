// Person detection via COCO-SSD (TensorFlow.js)
// Much more robust than face detection: works with hats, profiles, children, any angle.

const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'

let model = null

async function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) {
    // already loading or loaded — wait for it
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`)
      if (existing.dataset.loaded) return resolve()
      existing.addEventListener('load', () => { existing.dataset.loaded = '1'; resolve() })
      existing.addEventListener('error', reject)
    })
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => { s.dataset.loaded = '1'; resolve() }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

async function loadModel() {
  if (model) return model
  await loadScript(TF_URL)
  await loadScript(COCO_URL)
  model = await window.cocoSsd.load()
  return model
}

/**
 * Detect persons in an image File using COCO-SSD.
 * Returns { count, boxes } where boxes is array of { x, y, w, h } as 0..1 fractions of natural image dims.
 */
export async function detectFaces(imageFile) {
  const net = await loadModel()

  const url = URL.createObjectURL(imageFile)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        const predictions = await net.detect(img)
        URL.revokeObjectURL(url)
        const { naturalWidth: nw, naturalHeight: nh } = img

        const persons = predictions.filter(p => p.class === 'person' && p.score > 0.4)

        const boxes = persons.map(p => ({
          x: p.bbox[0] / nw,
          y: p.bbox[1] / nh,
          w: p.bbox[2] / nw,
          h: p.bbox[3] / nh,
        }))

        resolve({ count: persons.length, boxes, naturalWidth: nw, naturalHeight: nh })
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

/**
 * Draw bounding boxes on a canvas, accounting for object-contain letterboxing.
 * boxes: { x, y, w, h } as 0..1 fractions of natural image dims.
 */
export function drawBoxes(canvas, boxes, naturalWidth, naturalHeight, containerWidth, containerHeight) {
  canvas.width = containerWidth
  canvas.height = containerHeight

  // Compute actual rendered image bounds (object-contain)
  const imgAspect = naturalWidth / naturalHeight
  const boxAspect = containerWidth / containerHeight
  let renderedW, renderedH, offsetX, offsetY
  if (imgAspect > boxAspect) {
    renderedW = containerWidth
    renderedH = containerWidth / imgAspect
    offsetX = 0
    offsetY = (containerHeight - renderedH) / 2
  } else {
    renderedH = containerHeight
    renderedW = containerHeight * imgAspect
    offsetX = (containerWidth - renderedW) / 2
    offsetY = 0
  }

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, containerWidth, containerHeight)
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = Math.max(2, renderedW * 0.004)

  for (const b of boxes) {
    ctx.strokeRect(
      offsetX + b.x * renderedW,
      offsetY + b.y * renderedH,
      b.w * renderedW,
      b.h * renderedH,
    )
  }
}
