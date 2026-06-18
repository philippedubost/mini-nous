import {
  formatFalError,
  runLandingFalPreview,
} from './lib/fal-landing.js'

const MAX_BYTES = 5 * 1024 * 1024

function parseDataUri(dataUri) {
  const m = String(dataUri).match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  return { mime: m[1], buf }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { photoBase64, faceCount } = req.body ?? {}
    if (!photoBase64 || typeof photoBase64 !== 'string') {
      return res.status(400).json({ error: 'photoBase64 requis' })
    }

    const parsed = parseDataUri(photoBase64)
    if (!parsed) {
      return res.status(400).json({ error: 'Format image invalide (data URI attendu)' })
    }
    if (parsed.buf.length > MAX_BYTES) {
      return res.status(400).json({ error: 'Image trop lourde (max 5 Mo)' })
    }

    const { url, model, requestId } = await runLandingFalPreview({
      photoDataUri: photoBase64,
      faceCount: Number(faceCount) || null,
    })

    return res.status(200).json({
      previewUrl: url,
      model,
      requestId,
    })
  } catch (err) {
    console.error('[landing-preview]', err?.body?.detail ?? err)
    return res.status(500).json({ error: formatFalError(err) })
  }
}
