import { hasAdminAccess } from '../../server/admin.js'
import { getAuthUser } from '../../server/auth.js'
import {
  getPipelineSettings,
  savePipelineSettings,
  resetPipelineSettings,
  uploadReferenceLineArt,
} from '../../server/pipeline-settings.js'
import { getJsonBody } from '../prepare-req.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const result = await getPipelineSettings()
      return res.status(200).json(result)
    }

    if (req.method === 'POST') {
      const user = await getAuthUser(req)
      if (!hasAdminAccess(req, user)) {
        return res.status(403).json({ error: 'Réservé aux administrateurs' })
      }
      const { base64 } = getJsonBody(req)
      const result = await uploadReferenceLineArt(base64)
      return res.status(200).json(result)
    }

    if (req.method === 'PUT') {
      const user = await getAuthUser(req)
      if (!hasAdminAccess(req, user)) {
        return res.status(403).json({ error: 'Réservé aux administrateurs' })
      }
      const { settings, reset } = getJsonBody(req)
      const result = reset
        ? await resetPipelineSettings()
        : await savePipelineSettings(settings)
      return res.status(200).json(result)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[pipeline-settings]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
