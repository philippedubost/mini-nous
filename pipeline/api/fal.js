export const config = { runtime: 'edge' }

export default async function handler(req) {
  const falKey = process.env.FAL_KEY
  if (!falKey) {
    return new Response(JSON.stringify({ error: 'FAL_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const targetPath = url.searchParams.get('path') || ''
  const targetUrl = `https://queue.fal.run/${targetPath}`

  const headers = new Headers(req.headers)
  headers.set('Authorization', `Key ${falKey}`)
  headers.delete('host')

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
