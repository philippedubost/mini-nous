/**
 * Extrait les silhouettes (corps) depuis gravure / outline via flood-fill + composantes connexes.
 */

function lumaAt(data, i) {
  const j = i * 4
  return 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
}

function buildMask(data, W, H, thresh = 240) {
  const exterior = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  let qHead = 0
  let qTail = 0
  const luma = (i) => lumaAt(data, i)
  const seed = (i) => {
    if (luma(i) >= thresh && !exterior[i]) {
      exterior[i] = 1
      queue[qTail++] = i
    }
  }
  for (let x = 0; x < W; x++) {
    seed(x)
    seed((H - 1) * W + x)
  }
  for (let y = 1; y < H - 1; y++) {
    seed(y * W)
    seed(y * W + W - 1)
  }
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

function connectedBodies(mask, W, H) {
  const labels = new Int32Array(W * H)
  const bodies = []
  let label = 0

  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || labels[i]) continue
    label++
    let minX = W
    let minY = H
    let maxX = 0
    let maxY = 0
    let area = 0
    const queue = [i]
    labels[i] = label

    for (let q = 0; q < queue.length; q++) {
      const idx = queue[q]
      const x = idx % W
      const y = (idx / W) | 0
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      area++

      if (x > 0) {
        const n = idx - 1
        if (mask[n] && !labels[n]) { labels[n] = label; queue.push(n) }
      }
      if (x < W - 1) {
        const n = idx + 1
        if (mask[n] && !labels[n]) { labels[n] = label; queue.push(n) }
      }
      if (y > 0) {
        const n = idx - W
        if (mask[n] && !labels[n]) { labels[n] = label; queue.push(n) }
      }
      if (y < H - 1) {
        const n = idx + W
        if (mask[n] && !labels[n]) { labels[n] = label; queue.push(n) }
      }
    }

    bodies.push({
      id: label,
      x: minX / W,
      y: minY / H,
      w: (maxX - minX + 1) / W,
      h: (maxY - minY + 1) / H,
      area,
      cx: (minX + maxX) / 2 / W,
    })
  }

  return { bodies, labels }
}

/**
 * @param {ImageData} imageData gravure, outline_bulk ou outline
 * @param {number|null} expectedCount face_count de la génération
 */
export function extractBodyRegionsDetailed(imageData, expectedCount = null) {
  const W = imageData.width
  const H = imageData.height
  const mask = buildMask(imageData.data, W, H, 240)
  const minArea = W * H * 0.006
  let { bodies, labels } = connectedBodies(mask, W, H)
  bodies = bodies.filter(b => b.area >= minArea).sort((a, b) => a.cx - b.cx)

  if (expectedCount && bodies.length > expectedCount) {
    const kept = [...bodies]
      .sort((a, b) => b.area - a.area)
      .slice(0, expectedCount)
      .sort((a, b) => a.cx - b.cx)
    const keptIds = new Set(kept.map(b => b.id))
    const newLabels = new Int32Array(W * H)
    for (let i = 0; i < labels.length; i++) {
      if (keptIds.has(labels[i])) newLabels[i] = labels[i]
    }
    labels = newLabels
    bodies = kept
  }

  return { bodies, labels, width: W, height: H }
}

export function extractBodyRegions(imageData, expectedCount = null) {
  return extractBodyRegionsDetailed(imageData, expectedCount).bodies
}

/** Zone tête = bande haute du corps (pour crop face). */
export function bodyToHeadBox(body, headRatio = 0.34) {
  const padX = body.w * 0.06
  return {
    x: Math.max(0, body.x - padX),
    y: body.y,
    w: Math.min(1 - Math.max(0, body.x - padX), body.w + padX * 2),
    h: Math.min(1 - body.y, body.h * headRatio),
  }
}

export function cropImageData(imageData, box) {
  const W = imageData.width
  const H = imageData.height
  const x0 = Math.max(0, Math.floor(box.x * W))
  const y0 = Math.max(0, Math.floor(box.y * H))
  const x1 = Math.min(W, Math.ceil((box.x + box.w) * W))
  const y1 = Math.min(H, Math.ceil((box.y + box.h) * H))
  const cw = Math.max(1, x1 - x0)
  const ch = Math.max(1, y1 - y0)
  const out = new ImageData(cw, ch)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y0 + y) * W + (x0 + x)) * 4
      const di = (y * cw + x) * 4
      out.data[di] = imageData.data[si]
      out.data[di + 1] = imageData.data[si + 1]
      out.data[di + 2] = imageData.data[si + 2]
      out.data[di + 3] = imageData.data[si + 3]
    }
  }
  return { imageData: out, offset: { x: x0, y: y0, w: cw, h: ch } }
}

/** Remonte un visage (coords 0–1 dans le crop) vers l'image complète. */
export function mapFaceFromCropToFull(face, cropBox) {
  return {
    box: {
      x: cropBox.x + face.box.x * cropBox.w,
      y: cropBox.y + face.box.y * cropBox.h,
      w: face.box.w * cropBox.w,
      h: face.box.h * cropBox.h,
    },
    leftEye: {
      x: cropBox.x + face.leftEye.x * cropBox.w,
      y: cropBox.y + face.leftEye.y * cropBox.h,
      rx: face.leftEye.rx * cropBox.w,
      ry: face.leftEye.ry * cropBox.h,
    },
    rightEye: {
      x: cropBox.x + face.rightEye.x * cropBox.w,
      y: cropBox.y + face.rightEye.y * cropBox.h,
      rx: face.rightEye.rx * cropBox.w,
      ry: face.rightEye.ry * cropBox.h,
    },
  }
}

export function cropBoxToNormalized(offset, fullW, fullH) {
  return {
    x: offset.x / fullW,
    y: offset.y / fullH,
    w: offset.w / fullW,
    h: offset.h / fullH,
  }
}
