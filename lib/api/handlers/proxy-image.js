function isAllowedImageUrl(url, env) {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') return false
    const r2Domain = env.R2_PUBLIC_DOMAIN?.replace(/^https?:\/\//, '').split('/')[0]
    if (r2Domain && hostname === r2Domain) return true
    if (hostname.endsWith('.r2.dev')) return true
    if (hostname.includes('fal.media') || hostname.includes('fal.ai')) return true
    if (hostname.includes('fal.run')) return true
    return false
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const url = req.query?.url
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url requis' })
  }
  if (!isAllowedImageUrl(url, process.env)) {
    return res.status(403).json({ error: 'URL non autorisée' })
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return res.status(response.status).json({ error: `Fetch image ${response.status}` })
    }
    const contentType = response.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await response.arrayBuffer())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).send(buffer)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Proxy failed'
    return res.status(500).json({ error: msg })
  }
}
