export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const falKey = process.env.FAL_KEY
  if (!falKey) {
    return res.status(500).json({ error: 'FAL_KEY not configured' })
  }

  // @fal-ai/client sends the target fal URL in this header
  const targetUrl = req.headers['x-fal-target-url']
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing x-fal-target-url header' })
  }

  const headers = {
    Authorization: `Key ${falKey}`,
    'Content-Type': req.headers['content-type'] || 'application/json',
    Accept: req.headers['accept'] || 'application/json',
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD'
      ? JSON.stringify(req.body)
      : undefined,
  })

  const contentType = response.headers.get('content-type') || 'application/json'
  res.setHeader('Content-Type', contentType)

  if (contentType.includes('application/json')) {
    const data = await response.json()
    return res.status(response.status).json(data)
  }

  const text = await response.text()
  return res.status(response.status).send(text)
}
