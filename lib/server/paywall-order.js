import { createPendingOrder, getOrderByToken, updatePendingOrderQuote } from './orders.js'
import { computeQuote, packTypeForDatabase } from './packs.js'
import { getSupabase } from './supabase.js'
import { uploadPipelineAssetToR2 } from './r2.js'
import { getNextVersion, saveAssetVersion } from './assets.js'
import { getSiteUrl } from './stripe-client.js'

const MAX_PHOTO_BYTES = 3 * 1024 * 1024

function parsePhotoBase64(photoBase64) {
  const raw = String(photoBase64 || '')
  const m = raw.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  return { mime: m[1], buf }
}

function orderLinks(req, accessToken) {
  const site = getSiteUrl(req).replace(/\/$/, '')
  const q = encodeURIComponent(accessToken)
  return {
    status: `${site}/pipeline/commande?order=${q}`,
    studio: `${site}/pipeline/commande?order=${q}&auto=1`,
    shop: site,
  }
}

async function createDraftGeneration(supabase, { orderId, faceCount }) {
  const { data, error } = await supabase
    .from('mini_nous_generations')
    .insert({
      face_count: faceCount,
      resolution: '2K',
      aspect_ratio: '16:9',
      order_id: orderId,
      status: 'running',
      fal_model: 'fal-ai/nano-banana-pro/edit',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function savePaywallSourcePhoto(env, supabase, { generationId, photoBase64 }) {
  const version = await getNextVersion(supabase, generationId, 'source')
  const { url, key } = await uploadPipelineAssetToR2(
    { generationId, assetType: 'source', base64: photoBase64, version },
    env,
  )
  await saveAssetVersion(supabase, {
    generationId,
    assetType: 'source',
    imageUrl: url,
    r2Key: key,
    status: 'done',
    source: 'paywall',
    version,
  })
  return url
}

async function attachPaywallPhoto(env, order, photoBase64, { countAsReplacement = false } = {}) {
  if (countAsReplacement && Number(order.metadata?.paywall_photo_replacements) >= 1) {
    throw Object.assign(
      new Error('Vous avez déjà modifié la photo une fois — finalisez le paiement ou contactez-nous.'),
      { status: 409 },
    )
  }

  const supabase = getSupabase()
  let generationId = order.metadata?.draft_generation_id ?? order.generation_id

  if (!generationId) {
    const gen = await createDraftGeneration(supabase, {
      orderId: order.id,
      faceCount: order.face_count,
    })
    generationId = gen.id
  }

  const sourcePhotoUrl = await savePaywallSourcePhoto(env, supabase, {
    generationId,
    photoBase64,
  })

  const replacements = countAsReplacement
    ? (Number(order.metadata?.paywall_photo_replacements) || 0) + 1
    : Number(order.metadata?.paywall_photo_replacements) || 0

  const { data: updated, error } = await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(order.metadata ?? {}),
        draft_generation_id: generationId,
        paywall_source_url: sourcePhotoUrl,
        paywall_photo_at: new Date().toISOString(),
        paywall_photo_replacements: replacements,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select('*, week:mini_nous_production_weeks(*)')
    .single()
  if (error) throw new Error(error.message)

  return { order: updated, generationId, sourcePhotoUrl }
}

/** Crée une commande pending + génération brouillon avec photo paywall. */
export async function startPaywallOrder(req, env, {
  faceCount,
  packType,
  childCount,
  photoBase64,
  giftDelivery,
  giftRecipientName,
  giftMessage,
  fridayDelivery,
}) {
  const parsed = parsePhotoBase64(photoBase64)
  if (!parsed) throw Object.assign(new Error('Format image invalide'), { status: 400 })
  if (parsed.buf.length > MAX_PHOTO_BYTES) {
    throw Object.assign(new Error('Image trop lourde (max 3 Mo)'), { status: 400 })
  }

  const quote = computeQuote(faceCount)
  if (!quote.ok) {
    const msg = quote.reason === 'too_many'
      ? `Maximum ${quote.maxFaces} personnages`
      : 'Nombre de personnages invalide'
    throw Object.assign(new Error(msg), { status: 400 })
  }

  const { order, week } = await createPendingOrder({
    packType: packType ?? quote.basePack.id,
    faceCount: quote.faceCount,
    giftDelivery: !!giftDelivery,
    giftRecipientName: giftRecipientName?.trim() || null,
    giftMessage: giftMessage?.trim() || null,
    childCount: childCount != null ? Number(childCount) : null,
    fridayDelivery: !!fridayDelivery,
  })

  const { order: withPhoto, generationId, sourcePhotoUrl } = await attachPaywallPhoto(
    env,
    order,
    photoBase64,
  )

  return {
    order: withPhoto,
    week,
    accessToken: withPhoto.access_token,
    generationId,
    sourcePhotoUrl,
    links: orderLinks(req, withPhoto.access_token),
  }
}

/** Met à jour le brouillon paywall (photo, nombre de figurines). */
export async function updatePaywallOrder(req, env, {
  accessToken,
  faceCount,
  childCount,
  photoBase64,
  giftDelivery,
  giftRecipientName,
  giftMessage,
  fridayDelivery,
}) {
  let order = await getOrderByToken(accessToken)
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 })
  if (order.status !== 'pending') {
    throw Object.assign(new Error('Cette commande ne peut plus être modifiée'), { status: 409 })
  }

  if (faceCount != null) {
    order = await updatePendingOrderQuote(order.id, {
      faceCount,
      childCount,
      giftDelivery,
      giftRecipientName,
      giftMessage,
      fridayDelivery,
    })
  }

  let sourcePhotoUrl = null
  let generationId = order.generation_id
  if (photoBase64) {
    const parsed = parsePhotoBase64(photoBase64)
    if (!parsed) throw Object.assign(new Error('Format image invalide'), { status: 400 })
    if (parsed.buf.length > MAX_PHOTO_BYTES) {
      throw Object.assign(new Error('Image trop lourde (max 3 Mo)'), { status: 400 })
    }
    const isReplacement = !!order.metadata?.paywall_source_url
    const attached = await attachPaywallPhoto(env, order, photoBase64, { countAsReplacement: isReplacement })
    order = attached.order
    sourcePhotoUrl = attached.sourcePhotoUrl
    generationId = attached.generationId
  }

  return {
    order,
    accessToken: order.access_token,
    generationId,
    sourcePhotoUrl,
    links: orderLinks(req, order.access_token),
  }
}

/** Réutilise un brouillon paywall existant ou en crée un nouveau au checkout. */
export async function resolveCheckoutOrder(req, env, {
  accessToken,
  pack,
  faceCount,
  email,
  customerName,
  childCount,
  giftDelivery,
  giftRecipientName,
  giftMessage,
  photoBase64,
  fridayDelivery,
  shippingZone,
  shippingAddress,
  newsletterOptIn,
}) {
  if (accessToken) {
    const existing = await getOrderByToken(accessToken)
    if (existing?.status === 'pending') {
      let order = existing
      if (faceCount != null || fridayDelivery !== undefined || shippingZone || shippingAddress || newsletterOptIn != null) {
        order = await updatePendingOrderQuote(existing.id, {
          faceCount,
          childCount,
          giftDelivery,
          giftRecipientName,
          giftMessage,
          fridayDelivery,
          shippingZone,
          shippingAddress,
          newsletterOptIn,
        })
      }
      if (photoBase64) {
        const isReplacement = !!order.metadata?.paywall_source_url
        const attached = await attachPaywallPhoto(env, order, photoBase64, { countAsReplacement: isReplacement })
        order = attached.order
      }
      const supabase = getSupabase()
      const { data: week, error } = await supabase
        .from('mini_nous_production_weeks')
        .select('*')
        .eq('id', order.week_id)
        .single()
      if (error) throw new Error(error.message)
      return { order, week, reused: true }
    }
  }

  const quote = faceCount != null ? computeQuote(faceCount) : null
  if (photoBase64) {
    const started = await startPaywallOrder(req, env, {
      faceCount,
      packType: pack,
      childCount,
      photoBase64,
      giftDelivery,
      giftRecipientName,
      giftMessage,
      fridayDelivery,
    })
    return { order: started.order, week: started.week, reused: false }
  }

  const created = await createPendingOrder({
    packType: packTypeForDatabase(quote?.basePack?.id ?? pack),
    faceCount: quote?.faceCount ?? faceCount,
    email,
    customerName,
    giftDelivery: !!giftDelivery,
    giftRecipientName: giftRecipientName?.trim() || null,
    giftMessage: giftMessage?.trim() || null,
    childCount: childCount != null ? Number(childCount) : null,
    fridayDelivery: !!fridayDelivery,
    shippingZone,
    shippingAddress,
    newsletterOptIn,
  })
  return { ...created, reused: false }
}
