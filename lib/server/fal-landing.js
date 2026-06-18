import { fal } from '@fal-ai/client'

const DEFAULT_MODEL = 'fal-ai/nano-banana/edit'

export const LANDING_PREVIEW_PROMPT = `Tu reçois UNE photo de groupe. Pour chaque personne visible :

1. Isole-la individuellement de la photo de groupe.
2. Représente-la en figurine bois contreplaqué découpée au laser, en pose de FACE (vue de face, plein pied, debout).
3. Place toutes les figurines côte à côte, alignées sur un établi de menuiserie dans un atelier (sciure, copeaux, outils flous en arrière-plan, lumière chaleureuse).

Chaque figurine est distincte, bien séparée des autres, même échelle proportionnelle, traits de visage et vêtements gravés au laser en line art noir fin sur bois clair, petit socle en bois en croix aux pieds.

INTERDIT :
- Ne pas coller, incruster ou afficher la photo originale dans la scène.
- Pas de groupe serré ou de personnages qui se chevauchent — chaque figurine est individuelle, de face, côte à côte.
- Pas de cadre photo, pas d'illustration 2D plate.

OBLIGATOIRE :
- Chaque humain de la photo source devient une figurine bois reconnaissable, vue de face.
- Photo produit réaliste, style artisanal d'atelier menuiserie.
Pas de texte, watermark ou logo.`

export function buildLandingPrompt(faceCount) {
  if (!faceCount || faceCount < 1) return LANDING_PREVIEW_PROMPT
  const n = Math.min(8, Math.max(1, faceCount))
  return `${LANDING_PREVIEW_PROMPT}\n\nNombre exact de figurines individuelles, de face, côte à côte : ${n}.`
}

function parseDataUri(dataUri) {
  const m = String(dataUri).match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) return null
  return { mime: m[1], buf: Buffer.from(m[2], 'base64') }
}

async function uploadBufferToFal(buf, mime, filename) {
  const file = typeof File !== 'undefined'
    ? new File([buf], filename, { type: mime })
    : new Blob([buf], { type: mime })
  return fal.storage.upload(file)
}

export function formatFalError(err) {
  const detail = err?.body?.detail
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join('; ')
  }
  if (detail) return String(detail)
  return err?.message || 'Échec génération aperçu'
}

function landingModel(model) {
  return model || process.env.LANDING_FAL_MODEL || DEFAULT_MODEL
}

function landingInput(photoFalUrl, faceCount) {
  return {
    prompt: buildLandingPrompt(faceCount),
    image_urls: [photoFalUrl],
    aspect_ratio: process.env.LANDING_FAL_ASPECT_RATIO || '16:9',
    output_format: 'jpeg',
    num_images: 1,
  }
}

export function extractPreviewUrl(result) {
  return result?.data?.images?.[0]?.url
    ?? result?.data?.image?.url
    ?? result?.images?.[0]?.url
    ?? null
}

function configureFal() {
  const falKey = process.env.FAL_KEY
  if (!falKey) throw new Error('FAL_KEY non configurée')
  fal.config({ credentials: falKey })
}

/** Soumet un job FAL (rapide, compatible timeout Vercel Hobby). */
export async function submitLandingPreviewJob({
  photoDataUri,
  faceCount,
  model = landingModel(),
}) {
  configureFal()

  const parsed = parseDataUri(photoDataUri)
  if (!parsed) throw new Error('Format image invalide')

  const photoFalUrl = await uploadBufferToFal(parsed.buf, parsed.mime, 'landing-photo.jpg')
  const { request_id: requestId } = await fal.queue.submit(model, {
    input: landingInput(photoFalUrl, faceCount),
  })
  if (!requestId) throw new Error('fal.ai n\'a pas renvoyé de requestId')

  return { requestId, model }
}

/** Interroge le statut d'un job FAL (appel court, idéal pour polling client). */
export async function pollLandingPreviewJob({ requestId, model = landingModel() }) {
  configureFal()

  const status = await fal.queue.status(model, { requestId, logs: false })
  const state = status?.status

  if (state === 'COMPLETED') {
    const result = await fal.queue.result(model, { requestId })
    const url = extractPreviewUrl(result)
    if (!url) throw new Error('Aucune image retournée par fal.ai')
    return { status: 'COMPLETED', previewUrl: url, requestId }
  }

  if (state === 'FAILED') {
    return {
      status: 'FAILED',
      error: status?.error || 'Génération fal.ai échouée',
      requestId,
    }
  }

  return {
    status: state || 'IN_QUEUE',
    queuePosition: status?.queue_position ?? null,
    requestId,
  }
}

/** Bloquant — réservé au dev local (dépasse souvent le timeout Vercel). */
export async function runLandingFalPreview({
  photoDataUri,
  faceCount,
  model = landingModel(),
}) {
  configureFal()

  const parsed = parseDataUri(photoDataUri)
  if (!parsed) throw new Error('Format image invalide')

  const photoFalUrl = await uploadBufferToFal(parsed.buf, parsed.mime, 'landing-photo.jpg')

  const result = await fal.subscribe(model, {
    input: landingInput(photoFalUrl, faceCount),
    pollInterval: 2000,
    logs: false,
  })

  const url = extractPreviewUrl(result)
  if (!url) throw new Error('Aucune image retournée par fal.ai')
  return { url, model, requestId: result?.requestId ?? null }
}
