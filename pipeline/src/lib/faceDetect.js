// Loads face-api.js from CDN (same version as fal-pipeline.html)
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
 * Returns { count, boxes } where boxes is array of { x, y, width, height } in 0..1 fractions.
 */
export async function detectFaces(imageFile) {
  await load()
  const url = URL.createObjectURL(imageFile)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        const options = new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35 })
        const detections = await window.faceapi.detectAllFaces(img, options)
        URL.revokeObjectURL(url)
        const boxes = detections.map(d => ({
          x: d.box.x / img.naturalWidth,
          y: d.box.y / img.naturalHeight,
          width: d.box.width / img.naturalWidth,
          height: d.box.height / img.naturalHeight,
        }))
        resolve({ count: detections.length, boxes })
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
 * Draw bounding boxes on a canvas element.
 * The canvas is sized to match the displayed image dimensions.
 */
export function drawBoxes(canvas, boxes, displayWidth, displayHeight) {
  canvas.width = displayWidth
  canvas.height = displayHeight
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, displayWidth, displayHeight)
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = Math.max(2, displayWidth * 0.003)
  for (const b of boxes) {
    ctx.strokeRect(
      b.x * displayWidth,
      b.y * displayHeight,
      b.width * displayWidth,
      b.height * displayHeight,
    )
  }
}
