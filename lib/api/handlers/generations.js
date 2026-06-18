import { getSupabase, ASSET_META } from '../../server/supabase.js'
import { selectAssetVersion, deleteAssetVersion, groupVersions } from '../../server/assets.js'
import { enrichGenerationsWithFabrication } from '../../server/fabrication.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const supabase = getSupabase()

    if (req.method === 'GET') {
      const id = req.query?.id
      if (id) {
        const { data: generation, error: genErr } = await supabase
          .from('mini_nous_generations')
          .select('*')
          .eq('id', id)
          .single()
        if (genErr) throw new Error(genErr.message)

        const { data: steps, error: stepsErr } = await supabase
          .from('mini_nous_generation_steps')
          .select('*')
          .eq('generation_id', id)
          .order('step_index')
          .order('asset_type')
        if (stepsErr) throw new Error(stepsErr.message)

        const { data: versions, error: verErr } = await supabase
          .from('mini_nous_asset_versions')
          .select('*')
          .eq('generation_id', id)
          .is('deleted_at', null)
          .order('asset_type')
          .order('version', { ascending: false })
        if (verErr) throw new Error(verErr.message)

        const [enriched] = await enrichGenerationsWithFabrication(supabase, [generation])

        return res.status(200).json({
          generation: enriched,
          steps,
          versions,
          versionsByType: groupVersions(versions),
          fabrication: enriched.fabrication,
        })
      }

      const { data: generations, error: listErr } = await supabase
        .from('mini_nous_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (listErr) throw new Error(listErr.message)

      const ids = generations.map(g => g.id)
      let steps = []
      if (ids.length) {
        const { data: allSteps, error: stepsErr } = await supabase
          .from('mini_nous_generation_steps')
          .select('*')
          .in('generation_id', ids)
          .order('step_index')
          .order('asset_type')
        if (stepsErr) throw new Error(stepsErr.message)
        steps = allSteps
      }

      const byGen = steps.reduce((acc, s) => {
        ;(acc[s.generation_id] ??= []).push(s)
        return acc
      }, {})
      const withSteps = generations.map(g => ({
        ...g,
        steps: byGen[g.id] ?? [],
      }))
      const result = await enrichGenerationsWithFabrication(supabase, withSteps)

      return res.status(200).json({ generations: result })
    }

    if (req.method === 'POST') {
      const { faceCount, resolution, aspectRatio, settings, falModel, orderId } = req.body ?? {}
      const { data, error } = await supabase
        .from('mini_nous_generations')
        .insert({
          face_count: faceCount ?? null,
          resolution: resolution ?? null,
          aspect_ratio: aspectRatio ?? null,
          settings: settings ?? null,
          fal_model: falModel ?? 'fal-ai/nano-banana-pro/edit',
          status: 'running',
          order_id: orderId ?? null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return res.status(201).json({ generation: data })
    }

    if (req.method === 'PATCH') {
      const { id, status, errorMessage, step, selectVersionId, deleteVersionId } = req.body ?? {}
      if (!id) return res.status(400).json({ error: 'id requis' })

      if (deleteVersionId) {
        const result = await deleteAssetVersion(supabase, id, deleteVersionId, process.env)
        return res.status(200).json(result)
      }

      if (selectVersionId) {
        const result = await selectAssetVersion(supabase, id, selectVersionId)
        return res.status(200).json(result)
      }

      if (step) {
        const meta = ASSET_META[step.asset_type] ?? { step_index: step.step_index ?? 0, label: step.asset_type }
        const row = {
          generation_id: id,
          asset_type: step.asset_type,
          step_index: step.step_index ?? meta.step_index,
          label: step.label ?? meta.label,
          status: step.status ?? 'pending',
          prompt: step.prompt ?? null,
          image_url: step.image_url ?? null,
          r2_key: step.r2_key ?? null,
          fal_url: step.fal_url ?? null,
          log: step.log ?? null,
          error_message: step.error_message ?? null,
          metadata: step.metadata ?? null,
        }
        const { data, error } = await supabase
          .from('mini_nous_generation_steps')
          .upsert(row, { onConflict: 'generation_id,asset_type' })
          .select()
          .single()
        if (error) throw new Error(error.message)
        return res.status(200).json({ step: data })
      }

      const patch = {}
      if (status) patch.status = status
      if (errorMessage !== undefined) patch.error_message = errorMessage
      if (req.body?.settings !== undefined) patch.settings = req.body.settings

      if (!Object.keys(patch).length) {
        return res.status(400).json({ error: 'Aucune modification' })
      }

      patch.updated_at = new Date().toISOString()

      const { data, error } = await supabase
        .from('mini_nous_generations')
        .update(patch)
        .eq('id', id)
        .select()

      if (error) throw new Error(error.message)
      const generation = data?.[0]
      if (!generation) throw new Error('Génération introuvable ou mise à jour refusée')
      return res.status(200).json({ generation })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('Generations API error:', e)
    const msg = e instanceof Error ? e.message : 'Request failed'
    return res.status(500).json({ error: msg })
  }
}
