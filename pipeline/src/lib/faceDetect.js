import * as faceapi from '@vladmandic/face-api'

let modelsLoaded = false

export async function loadModels() {
  if (modelsLoaded) return
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
  modelsLoaded = true
}

/**
 * Detect faces in an image file.
 * Returns { count, boxes } where boxes is array of { x, y, width, height } in 0..1 fractions.
 */
export async function detectFaces(imageFile) {
  await loadModels()

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    img.onload = async () => {
      try {
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
        const detections = await faceapi.detectAllFaces(img, options)
        URL.revokeObjectURL(url)
        const boxes = detections.map(d => ({
          x: d.box.x / img.width,
          y: d.box.y / img.height,
          width: d.box.width / img.width,
          height: d.box.height / img.height,
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
 * Draw bounding boxes on a canvas overlay.
 * boxes: array of { x, y, width, height } in 0..1 fractions
 */
export function drawBoxes(canvas, boxes, imgWidth, imgHeight) {
  canvas.width = imgWidth
  canvas.height = imgHeight
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, imgWidth, imgHeight)
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = Math.max(2, imgWidth * 0.003)
  for (const b of boxes) {
    ctx.strokeRect(
      b.x * imgWidth,
      b.y * imgHeight,
      b.width * imgWidth,
      b.height * imgHeight
    )
  }
}
