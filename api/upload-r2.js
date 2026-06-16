import { uploadPipelineAssetToR2 } from './lib/r2.js'
import { getSupabase, ASSET_META } from './lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body ?? {}
    const { generationId, assetType, url, base64, falUrl, prompt, status, log, error: stepError } = body
    const { url: imageUrl, key } = await uploadPipelineAssetToR2(
      { generationId, assetType, url: url || falUrl, base64 },
      process.env
    )

    const meta = ASSET_META[assetType] ?? { step_index: 0, label: assetType }
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('mini_nous_generation_steps')
      .upsert(
        {
          generation_id: generationId,
          asset_type: assetType,
          step_index: meta.step_index,
          label: meta.label,
          status: status ?? 'done',
          prompt: prompt ?? null,
          image_url: imageUrl,
          r2_key: key,
          fal_url: falUrl ?? (url?.includes('fal.') ? url : null),
          log: log ?? null,
          error_message: stepError ?? null,
        },
        { onConflict: 'generation_id,asset_type' }
      )
      .select()
      .single()

    if (error) throw new Error(error.message)

    return res.status(200).json({ url: imageUrl, key, step: data })
  } catch (e) {
    console.error('R2 pipeline upload error:', e)
    const msg = e instanceof Error ? e.message : 'Upload failed'
    const code = msg.includes('manquantes') || msg.includes('requis') ? 400 : 500
    return res.status(code).json({ error: msg })
  }
}
