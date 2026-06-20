import { getSiteUrl } from './stripe-client.js'

/** URL affichable (studio, e-mail) — proxy API si asset R2/FAL. */
export function publicAssetUrl(req, rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  try {
    const { hostname, protocol } = new URL(rawUrl)
    if (protocol !== 'https:' && protocol !== 'http:') return rawUrl
    const r2Domain = process.env.R2_PUBLIC_DOMAIN?.replace(/^https?:\/\//, '').split('/')[0]
    const needsProxy = (r2Domain && hostname === r2Domain)
      || hostname.endsWith('.r2.dev')
      || hostname.includes('fal.media')
      || hostname.includes('fal.run')
    if (!needsProxy) return rawUrl
    const site = getSiteUrl(req).replace(/\/$/, '')
    return `${site}/api/proxy-image?url=${encodeURIComponent(rawUrl)}`
  } catch {
    return rawUrl
  }
}
