import { uploadPipelineAssetToR2 } from './lib/r2.js'
import { getSupabase } from './lib/supabase.js'
import { getNextVersion, saveAssetVersion, isDuplicateVersionError } from './lib/assets.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body ?? {}
    const {
      generationId, assetType, url, base64, falUrl, prompt,
      status, log, error: stepError, source, select, metadata,
    } = body

    const supabase = getSupabase()
    const uploadPayload = {
      generationId, assetType, url: url || falUrl, base64,
    }

    let result
    let imageUrl
    let key
    for (let attempt = 0; attempt < 5; attempt++) {
      const version = await getNextVersion(supabase, generationId, assetType)
      ;({ url: imageUrl, key } = await uploadPipelineAssetToR2(
        { ...uploadPayload, version },
        process.env,
      ))
      try {
        result = await saveAssetVersion(supabase, {
          generationId,
          assetType,
          imageUrl,
          r2Key: key,
          falUrl: falUrl ?? (url?.includes('fal.') ? url : null),
          prompt,
          status: status ?? 'done',
          log,
          errorMessage: stepError,
          source: source ?? 'pipeline',
          select: select !== false,
          version,
          metadata,
        })
        break
      } catch (e) {
        if (!isDuplicateVersionError(e) || attempt === 4) throw e
        console.warn(`[upload-r2] version collision ${assetType} v${version}, retry…`)
      }
    }

    return res.status(200).json({ url: imageUrl, key, version: result.version.version, ...result })
  } catch (e) {
    console.error('R2 pipeline upload error:', e)
    const msg = e instanceof Error ? e.message : 'Upload failed'
    const code = msg.includes('manquantes') || msg.includes('requis') ? 400 : 500
    return res.status(code).json({ error: msg })
  }
}
