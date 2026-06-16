import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import {
  bodyToHeadBox,
  cropBoxToNormalized,
  cropImageData,
  extractBodyRegions,
  mapFaceFromCropToFull,
} from './bodyRegions.js'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144]
const RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380]

let landmarkerGPU = null
let landmarkerGPULoading = null
let landmarkerCPU = null
let landmarkerCPULoading = null

const LANDMARKER_OPTS = {
  runningMode: 'IMAGE',
  numFaces: 2,
  minFaceDetectionConfidence: 0.08,
  minFacePresenceConfidence: 0.08,
  minTrackingConfidence: 0.08,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false,
}

async function getLandmarker(delegate) {
  if (delegate === 'GPU') {
    if (landmarkerGPU) return landmarkerGPU
    if (landmarkerGPULoading) return landmarkerGPULoading
  } else {
    if (landmarkerCPU) return landmarkerCPU
    if (landmarkerCPULoading) return landmarkerCPULoading
  }

  const create = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
    const mkDelegate = delegate === 'GPU' ? 'GPU' : 'CPU'
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: mkDelegate },
      ...LANDMARKER_OPTS,
    })
  })()

  if (delegate === 'GPU') {
    landmarkerGPULoading = create
    landmarkerGPU = await create
    return landmarkerGPU
  }
  landmarkerCPULoading = create
  landmarkerCPU = await create
  return landmarkerCPU
}

function eyeMetrics(landmarks, indices) {
  const pts = indices.map(i => landmarks[i])
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  return {
    x: cx,
    y: cy,
    rx: (spanX / 2) * 1.2 || 0.01,
    ry: Math.max((spanY / 2) * 1.25, spanX * 0.18) || 0.005,
  }
}

function faceBox(landmarks) {
  const xs = landmarks.map(p => p.x)
  const ys = landmarks.map(p => p.y)
  const pad = 0.025
  const minX = Math.max(0, Math.min(...xs) - pad)
  const minY = Math.max(0, Math.min(...ys) - pad)
  const maxX = Math.min(1, Math.max(...xs) + pad)
  const maxY = Math.min(1, Math.max(...ys) + pad)
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function landmarksToFace(landmarks) {
  return {
    box: faceBox(landmarks),
    leftEye: eyeMetrics(landmarks, LEFT_EYE_IDX),
    rightEye: eyeMetrics(landmarks, RIGHT_EYE_IDX),
  }
}

function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return canvas
}

async function imageDataToBitmap(imageData, upscale = 1) {
  const canvas = imageDataToCanvas(imageData)
  if (upscale > 1) {
    const up = document.createElement('canvas')
    up.width = Math.round(canvas.width * upscale)
    up.height = Math.round(canvas.height * upscale)
    const ctx = up.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, up.width, up.height)
    return createImageBitmap(up)
  }
  return createImageBitmap(canvas)
}

async function detectOnBitmap(bitmap) {
  const toFaces = (result) => (result.faceLandmarks ?? []).map(landmarksToFace)

  try {
    const gpu = await getLandmarker('GPU')
    const faces = toFaces(gpu.detect(bitmap))
    if (faces.length) return faces
  } catch {
    // fallback CPU
  }

  const cpu = await getLandmarker('CPU')
  return toFaces(cpu.detect(bitmap))
}

async function detectFacesOnImageData(imageData) {
  const minDim = Math.min(imageData.width, imageData.height)
  const upscale = minDim < 180 ? Math.min(3, 220 / minDim) : 1
  const bitmap = await imageDataToBitmap(imageData, upscale)
  return detectOnBitmap(bitmap)
}

/**
 * Détection plein cadre (fallback).
 */
export async function detectFacesAndEyes(imageData) {
  const faces = await detectFacesOnImageData(imageData)
  return { faces, bodies: [], width: imageData.width, height: imageData.height, mode: 'full' }
}

/**
 * Détection guidée : silhouettes (gravure/outline) + nb personnes → crop tête → landmarks.
 */
export async function detectFacesGuided(photoData, silhouetteData, expectedCount = null) {
  if (!photoData) {
    return { faces: [], bodies: [], width: 0, height: 0, mode: 'none' }
  }

  const W = photoData.width
  const H = photoData.height
  let bodies = []
  let faces = []

  if (silhouetteData) {
    bodies = extractBodyRegions(silhouetteData, expectedCount)

    for (const body of bodies) {
      const headRatios = [0.34, 0.42, 0.5]
      let found = null

      for (const ratio of headRatios) {
        const headNorm = bodyToHeadBox(body, ratio)
        const { imageData: crop, offset } = cropImageData(photoData, headNorm)
        const cropFaces = await detectFacesOnImageData(crop)
        if (cropFaces.length) {
          const cropBox = cropBoxToNormalized(offset, W, H)
          found = mapFaceFromCropToFull(cropFaces[0], cropBox)
          break
        }
      }

      if (found) faces.push(found)
    }
  }

  if (faces.length) {
    return { faces, bodies, width: W, height: H, mode: 'guided' }
  }

  const fallback = await detectFacesAndEyes(photoData)
  return { ...fallback, bodies, mode: bodies.length ? 'guided-fallback' : 'full-fallback' }
}

/** Ellipses yeux verticales : 0.6× taille, hauteur ÷3 (vs forme horizontale détectée). */
export function formatEyeEllipseRadii(rx, ry) {
  const s = 0.6
  const vCompress = 3
  const vertRx = Math.min(rx, ry) * s
  const vertRy = (Math.max(rx, ry) * s) / vCompress
  return { rx: Math.max(0.5, vertRx), ry: Math.max(0.5, vertRy) }
}

/** Map normalized face data to pixel coords on a target image size. */
export function mapFacesToTarget(faces, dstW, dstH) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  return faces.map(f => ({
    box: {
      x: clamp(f.box.x, 0, 1) * dstW,
      y: clamp(f.box.y, 0, 1) * dstH,
      w: clamp(f.box.w, 0, 1) * dstW,
      h: clamp(f.box.h, 0, 1) * dstH,
    },
    leftEye: {
      x: clamp(f.leftEye.x, 0, 1) * dstW,
      y: clamp(f.leftEye.y, 0, 1) * dstH,
      rx: Math.max(1, f.leftEye.rx * dstW),
      ry: Math.max(1, f.leftEye.ry * dstH),
    },
    rightEye: {
      x: clamp(f.rightEye.x, 0, 1) * dstW,
      y: clamp(f.rightEye.y, 0, 1) * dstH,
      rx: Math.max(1, f.rightEye.rx * dstW),
      ry: Math.max(1, f.rightEye.ry * dstH),
    },
  }))
}

/** Taches blanches sur les yeux avant autotrace gravure (évite doublon avec ellipses face tracking). */
export function paintEyeMasksOnImageData(imageData, mappedFaces, opts = {}) {
  if (!imageData || !mappedFaces?.length) return imageData

  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  ctx.putImageData(imageData, 0, 0)

  const radiusScale = opts.eyeMaskRadiusScale ?? .8

  ctx.fillStyle = '#ffffff'
  for (const face of mappedFaces) {
    for (const eye of [face.leftEye, face.rightEye]) {
      const r = Math.max(eye.rx, eye.ry) * radiusScale
      ctx.beginPath()
      ctx.arc(eye.x, eye.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
