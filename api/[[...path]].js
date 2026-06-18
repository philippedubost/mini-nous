import { dispatch, routes } from '../lib/api/router.js'
import { prepareRequest } from '../lib/api/prepare-req.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  const segments = req.query?.path
  const name = Array.isArray(segments) ? segments[0] : segments
  if (!name || !routes[name]) {
    return res.status(404).json({ error: `Unknown API: ${name ?? 'unknown'}` })
  }
  await prepareRequest(req)
  await dispatch(name, req, res)
}
