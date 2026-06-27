import { parseBase64Image, tracePngBuffer } from '../../server/autotrace.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { base64, opts = {} } = req.body ?? {}
  if (!base64) return res.status(400).json({ error: 'base64 requis' })

  try {
    const svg = await tracePngBuffer(parseBase64Image(base64), opts)
    return res.status(200).json({ svg, engine: 'autotrace' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Trace failed'
    const code = msg.includes('introuvable') ? 501 : 500
    return res.status(code).json({ error: msg })
  }
}
