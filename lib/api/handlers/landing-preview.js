import {
  formatFalError,
  pollLandingPreviewJob,
  submitLandingPreviewJob,
} from '../../server/fal-landing.js'

const MAX_BYTES = 3 * 1024 * 1024

function parseDataUri(dataUri) {
  const m = String(dataUri).match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  return { mime: m[1], buf }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    try {
      const requestId = req.query?.requestId
      const model = req.query?.model
      if (!requestId || typeof requestId !== 'string') {
        return res.status(400).json({ error: 'requestId requis' })
      }

      const result = await pollLandingPreviewJob({ requestId, model })
      return res.status(200).json(result)
    } catch (err) {
      console.error('[landing-preview GET]', err?.body?.detail ?? err)
      return res.status(500).json({ error: formatFalError(err) })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' })

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
      return res.status(400).json({ error: 'Image trop lourde (max 3 Mo)' })
    }

    const { requestId, model } = await submitLandingPreviewJob({
      photoDataUri: photoBase64,
      faceCount: Number(faceCount) || null,
    })

    return res.status(200).json({ requestId, model })
  } catch (err) {
    console.error('[landing-preview POST]', err?.body?.detail ?? err)
    return res.status(500).json({ error: formatFalError(err) })
  }
}
