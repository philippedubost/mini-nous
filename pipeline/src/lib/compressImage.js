export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible'))
    }
    img.src = url
  })
}

function blobToFile(blob, file) {
  const base = (file.name || 'photo').replace(/\.[^.]+$/i, '')
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}

/** Compresse si nécessaire pour rester sous maxBytes (défaut 3 Mo). */
export async function compressImageFile(file, maxBytes = MAX_UPLOAD_BYTES) {
  if (!file || file.size <= maxBytes) return file

  const img = await loadImageElement(file)
  let w = img.naturalWidth
  let h = img.naturalHeight
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let quality = 0.9

  for (let pass = 0; pass < 16; pass++) {
    if (pass > 0) {
      if (pass % 2 === 1) quality = Math.max(0.42, quality - 0.08)
      else {
        w = Math.max(720, Math.round(w * 0.86))
        h = Math.max(720, Math.round(h * 0.86))
      }
    }

    const scale = Math.min(1, 4096 / Math.max(w, h))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    canvas.width = cw
    canvas.height = ch
    ctx.drawImage(img, 0, 0, cw, ch)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= maxBytes) return blobToFile(blob, file)
  }

  throw new Error('Impossible de compresser sous 3 Mo — essayez une photo plus petite.')
}
