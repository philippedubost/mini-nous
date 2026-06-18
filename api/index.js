import { dispatch, routes } from '../lib/api/router.js'
import { prepareRequest } from '../lib/api/prepare-req.js'

export const config = { api: { bodyParser: false } }

function resolveRouteName(req) {
  let name = req.query?.route ?? req.query?.path
  if (Array.isArray(name)) name = name[0]
  if (name && name !== 'index') return name

  const path = (req.url || '').split('?')[0]
  const match = path.match(/^\/api\/([^/]+)/)
  const segment = match?.[1]
  return segment && segment !== 'index' ? segment : null
}

export default async function handler(req, res) {
  const name = resolveRouteName(req)
  if (!name || !routes[name]) {
    return res.status(404).json({ error: `Unknown API: ${name ?? 'unknown'}` })
  }
  await prepareRequest(req)
  await dispatch(name, req, res)
}
