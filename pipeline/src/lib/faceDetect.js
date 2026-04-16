const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights'

let ready = false

async function load() {
  if (ready) return
  if (!window.faceapi) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_URL
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
  ready = true
}

/**
 * Detect faces in an image File.
 * Returns { count, boxes } where boxes is array of { x, y, w, h } in 0..1 fractions of natural image dims.
 */
export async function detectFaces(imageFile) {
  await load()
  const url = URL.createObjectURL(imageFile)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        // inputSize 608 catches smaller/tilted faces better; low threshold for children
        const options = new window.faceapi.TinyFaceDetectorOptions({
          inputSize: 608,
          scoreThreshold: 0.28,
        })
        const detections = await window.faceapi.detectAllFaces(img, options)
        URL.revokeObjectURL(url)
        const { naturalWidth: nw, naturalHeight: nh } = img
        const boxes = detections.map(d => ({
          x: d.box.x / nw,
          y: d.box.y / nh,
          w: d.box.width / nw,
          h: d.box.height / nh,
        }))
        resolve({ count: detections.length, boxes, naturalWidth: nw, naturalHeight: nh })
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
 * Draw bounding boxes on a canvas element, correctly handling object-contain letterboxing.
 * boxes: array of { x, y, w, h } as 0..1 fractions of the natural image dims.
 * naturalWidth/Height: original image dimensions (to compute letterbox offset).
 * containerWidth/Height: the rendered element's bounding rect dimensions.
 */
export function drawBoxes(canvas, boxes, naturalWidth, naturalHeight, containerWidth, containerHeight) {
  canvas.width = containerWidth
  canvas.height = containerHeight

  // Compute actual rendered image area inside the container (object-contain)
  const imgAspect = naturalWidth / naturalHeight
  const boxAspect = containerWidth / containerHeight
  let renderedW, renderedH, offsetX, offsetY
  if (imgAspect > boxAspect) {
    // wider image — letterbox top & bottom
    renderedW = containerWidth
    renderedH = containerWidth / imgAspect
    offsetX = 0
    offsetY = (containerHeight - renderedH) / 2
  } else {
    // taller image — letterbox left & right
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
