import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

function getR2Config(env) {
  const bucket = env.R2_BUCKET_NAME
  const domain = env.R2_PUBLIC_DOMAIN
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY

  if (!bucket || !domain || !accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Variables R2 manquantes (R2_BUCKET_NAME, R2_PUBLIC_DOMAIN, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)'
    )
  }

  return { bucket, domain, accountId, accessKeyId, secretAccessKey }
}

function getClient(env) {
  const { accountId, accessKeyId, secretAccessKey } = getR2Config(env)
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function parseBase64(data) {
  const match = data.match(/^data:([\w+./-]+);base64,(.+)$/)
  if (match) {
    return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') }
  }
  return { contentType: 'image/png', buffer: Buffer.from(data, 'base64') }
}

async function fetchBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Impossible de télécharger l'image (${res.status})`)
  const contentType = res.headers.get('content-type')?.split(';')[0] || 'image/png'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { contentType, buffer }
}

/** Upload a global pipeline asset (settings, reference art, etc.) */
export async function uploadGlobalPipelineAssetToR2(body, env) {
  const { assetKey, url, base64, cacheControl } = body ?? {}
  if (!assetKey) throw new Error('assetKey requis')
  if (!url && !base64) throw new Error('url ou base64 requis')

  const { bucket, domain } = getR2Config(env)
  let contentType
  let buffer

  if (base64) {
    ;({ contentType, buffer } = parseBase64(base64))
  } else {
    ;({ contentType, buffer } = await fetchBuffer(url))
  }

  const ext = EXT_BY_TYPE[contentType] ?? 'png'
  const key = `mini-nous/global/${assetKey}.${ext}`

  await getClient(env).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl ?? 'public, max-age=300',
    })
  )

  return { url: `https://${domain}/${key}`, key }
}

/** Upload pipeline asset to R2; returns { url, key } */
export async function uploadPipelineAssetToR2(body, env) {
  const { generationId, assetType, url, base64, version } = body ?? {}
  if (!generationId || !assetType) {
    throw new Error('generationId et assetType requis')
  }
  if (!url && !base64) {
    throw new Error('url ou base64 requis')
  }

  const { bucket, domain } = getR2Config(env)
  let contentType
  let buffer

  if (base64) {
    ;({ contentType, buffer } = parseBase64(base64))
  } else {
    ;({ contentType, buffer } = await fetchBuffer(url))
  }

  const ext = EXT_BY_TYPE[contentType] ?? 'png'
  const versionSuffix = body.version ? `/v${body.version}` : ''
  const key = `mini-nous/${generationId}/${assetType}${versionSuffix}.${ext}`

  await getClient(env).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: body.cacheControl ?? 'public, max-age=31536000',
    })
  )

  return { url: `https://${domain}/${key}`, key }
}

/** Delete a single object from R2 by key */
export async function deleteR2Object(key, env) {
  if (!key) return
  const { bucket } = getR2Config(env)
  await getClient(env).send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  )
}

/** Resolve R2 key from stored r2_key or public image URL */
export function resolveR2Key({ r2Key, imageUrl }, env) {
  if (r2Key) return r2Key
  if (!imageUrl) return null
  try {
    const domain = env.R2_PUBLIC_DOMAIN?.replace(/^https?:\/\//, '').split('/')[0]
    const { hostname, pathname } = new URL(imageUrl)
    if (domain && hostname === domain && pathname.length > 1) {
      return pathname.slice(1)
    }
    if (pathname.includes('/mini-nous/')) {
      return pathname.replace(/^\//, '')
    }
  } catch {
    /* ignore */
  }
  return null
}
