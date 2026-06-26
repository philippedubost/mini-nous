import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/** Affichage Kanban ~40px — export 80px @2x, WebP léger. */
export const KANBAN_THUMB_PX = 80

async function loadSharp() {
  const mod = await import('sharp')
  return mod.default
}

export async function createKanbanThumbBuffer(imageBuffer) {
  const sharp = await loadSharp()
  return sharp(imageBuffer)
    .rotate()
    .resize(KANBAN_THUMB_PX, KANBAN_THUMB_PX, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 42, effort: 4 })
    .toBuffer()
}

async function fetchImageBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Téléchargement image (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

function r2Config(env) {
  const bucket = env.R2_BUCKET_NAME
  const domain = env.R2_PUBLIC_DOMAIN
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  if (!bucket || !domain || !accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Variables R2 manquantes (vignette Kanban)')
  }
  return { bucket, domain, accountId, accessKeyId, secretAccessKey }
}

function r2Client(env) {
  const { accountId, accessKeyId, secretAccessKey } = r2Config(env)
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export async function uploadOrderKanbanThumb(env, orderId, thumbBuffer) {
  const { bucket, domain } = r2Config(env)
  const key = `mini-nous/thumbs/orders/${orderId}.webp`
  await r2Client(env).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: thumbBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return `https://${domain}/${key}`
}

export async function buildOrderKanbanThumb(env, orderId, source) {
  const raw = Buffer.isBuffer(source) ? source : await fetchImageBuffer(source)
  const thumb = await createKanbanThumbBuffer(raw)
  return uploadOrderKanbanThumb(env, orderId, thumb)
}

export async function saveOrderKanbanThumbUrl(supabase, orderId, kanbanThumbUrl) {
  const { data: order, error: loadErr } = await supabase
    .from('mini_nous_orders')
    .select('metadata')
    .eq('id', orderId)
    .maybeSingle()
  if (loadErr) throw new Error(loadErr.message)
  if (!order) return null

  const meta = order.metadata ?? {}
  if (meta.kanban_thumb_url === kanbanThumbUrl) return kanbanThumbUrl

  const { error } = await supabase
    .from('mini_nous_orders')
    .update({
      metadata: { ...meta, kanban_thumb_url: kanbanThumbUrl },
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
  if (error) throw new Error(error.message)
  return kanbanThumbUrl
}

export async function ensureOrderKanbanThumb(env, supabase, orderId, source) {
  if (!source || !env?.R2_BUCKET_NAME) return null
  try {
    const url = await buildOrderKanbanThumb(env, orderId, source)
    await saveOrderKanbanThumbUrl(supabase, orderId, url)
    return url
  } catch (err) {
    console.error('[kanban-thumb]', orderId, err.message)
    return null
  }
}

export async function resolveOrderSourceUrl(supabase, order) {
  const meta = order.metadata ?? {}
  if (meta.paywall_source_url) return meta.paywall_source_url

  const generationId = order.generation_id ?? meta.draft_generation_id
  if (!generationId) return null

  const { data } = await supabase
    .from('mini_nous_generation_steps')
    .select('image_url, fal_url')
    .eq('generation_id', generationId)
    .eq('asset_type', 'source')
    .limit(1)
    .maybeSingle()

  return data?.image_url || data?.fal_url || null
}

export async function backfillOrderKanbanThumb(env, supabase, order) {
  const meta = order.metadata ?? {}
  if (meta.kanban_thumb_url) return { orderId: order.id, skipped: true, reason: 'exists' }

  const sourceUrl = await resolveOrderSourceUrl(supabase, order)
  if (!sourceUrl) return { orderId: order.id, skipped: true, reason: 'no_source' }

  const url = await ensureOrderKanbanThumb(env, supabase, order.id, sourceUrl)
  if (!url) return { orderId: order.id, ok: false, error: 'generation_failed' }
  return { orderId: order.id, ok: true, url }
}
