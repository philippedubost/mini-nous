import { computeQuote, formatQuoteForClient } from '../../server/packs.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const faces = req.query?.faces
  if (faces == null || faces === '') {
    return res.status(400).json({ ok: false, error: 'faces requis' })
  }

  const friday = req.query?.friday === '1' || req.query?.friday === 'true'
  const zone = req.query?.zone || 'fr'
  const quote = computeQuote(faces, zone)
  return res.status(200).json(formatQuoteForClient(quote, { fridayDelivery: friday }))
}
