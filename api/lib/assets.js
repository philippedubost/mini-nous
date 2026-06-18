import { getSupabase, ASSET_META } from './supabase.js'
import { deleteR2Object, resolveR2Key } from './r2.js'

/** Prochain numéro de version (toutes lignes, y compris soft-deleted — la contrainte unique les compte). */
export async function getNextVersion(supabase, generationId, assetType) {
  const { data, error } = await supabase
    .from('mini_nous_asset_versions')
    .select('version')
    .eq('generation_id', generationId)
    .eq('asset_type', assetType)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.version ?? 0) + 1
}

export function isDuplicateVersionError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

export async function saveAssetVersion(supabase, {
  generationId,
  assetType,
  imageUrl,
  r2Key,
  falUrl,
  prompt,
  status = 'done',
  log,
  errorMessage,
  source = 'pipeline',
  metadata,
  select = true,
  version: forcedVersion,
}) {
  const meta = ASSET_META[assetType] ?? { step_index: 0, label: assetType }
  const version = forcedVersion ?? await getNextVersion(supabase, generationId, assetType)

  if (select) {
    await supabase
      .from('mini_nous_asset_versions')
      .update({ is_selected: false })
      .eq('generation_id', generationId)
      .eq('asset_type', assetType)
  }

  const { data: versionRow, error: versionErr } = await supabase
    .from('mini_nous_asset_versions')
    .insert({
      generation_id: generationId,
      asset_type: assetType,
      version,
      step_index: meta.step_index,
      label: meta.label,
      status,
      prompt: prompt ?? null,
      image_url: imageUrl,
      r2_key: r2Key,
      fal_url: falUrl ?? null,
      log: log ?? null,
      error_message: errorMessage ?? null,
      source,
      is_selected: select,
      metadata: metadata ?? null,
    })
    .select()
    .single()
  if (versionErr) throw new Error(versionErr.message)

  if (select) {
    const { data: stepRow, error: stepErr } = await supabase
      .from('mini_nous_generation_steps')
      .upsert(
        {
          generation_id: generationId,
          asset_type: assetType,
          step_index: meta.step_index,
          label: meta.label,
          status,
          prompt: prompt ?? null,
          image_url: imageUrl,
          r2_key: r2Key,
          fal_url: falUrl ?? null,
          log: log ?? null,
          error_message: errorMessage ?? null,
          metadata: metadata ?? null,
          active_version_id: versionRow.id,
        },
        { onConflict: 'generation_id,asset_type' }
      )
      .select()
      .single()
    if (stepErr) throw new Error(stepErr.message)
    return { version: versionRow, step: stepRow }
  }

  return { version: versionRow, step: null }
}

export async function selectAssetVersion(supabase, generationId, versionId) {
  const { data: target, error: findErr } = await supabase
    .from('mini_nous_asset_versions')
    .select('*')
    .eq('id', versionId)
    .eq('generation_id', generationId)
    .is('deleted_at', null)
    .single()
  if (findErr) throw new Error(findErr.message)

  await supabase
    .from('mini_nous_asset_versions')
    .update({ is_selected: false })
    .eq('generation_id', generationId)
    .eq('asset_type', target.asset_type)

  const { data: versionRow, error: selErr } = await supabase
    .from('mini_nous_asset_versions')
    .update({ is_selected: true })
    .eq('id', versionId)
    .select()
    .single()
  if (selErr) throw new Error(selErr.message)

  const { data: stepRow, error: stepErr } = await supabase
    .from('mini_nous_generation_steps')
    .upsert(
      {
        generation_id: generationId,
        asset_type: target.asset_type,
        step_index: target.step_index,
        label: target.label,
        status: target.status,
        prompt: target.prompt,
        image_url: target.image_url,
        r2_key: target.r2_key,
        fal_url: target.fal_url,
        log: target.log,
        error_message: target.error_message,
        metadata: target.metadata,
        active_version_id: versionRow.id,
      },
      { onConflict: 'generation_id,asset_type' }
    )
    .select()
    .single()
  if (stepErr) throw new Error(stepErr.message)

  return { version: versionRow, step: stepRow }
}

export async function deleteAssetVersion(supabase, generationId, versionId, env) {
  const { data: target, error: findErr } = await supabase
    .from('mini_nous_asset_versions')
    .select('*')
    .eq('id', versionId)
    .eq('generation_id', generationId)
    .is('deleted_at', null)
    .single()
  if (findErr) throw new Error(findErr.message)

  const r2Key = resolveR2Key({ r2Key: target.r2_key, imageUrl: target.image_url }, env)
  if (r2Key) {
    try {
      await deleteR2Object(r2Key, env)
    } catch (err) {
      console.warn('[delete] R2:', r2Key, err)
    }
  }

  const { error: delErr } = await supabase
    .from('mini_nous_asset_versions')
    .update({ deleted_at: new Date().toISOString(), is_selected: false })
    .eq('id', versionId)
  if (delErr) throw new Error(delErr.message)

  let step = null
  if (target.is_selected) {
    const { data: next, error: nextErr } = await supabase
      .from('mini_nous_asset_versions')
      .select('*')
      .eq('generation_id', generationId)
      .eq('asset_type', target.asset_type)
      .is('deleted_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (nextErr) throw new Error(nextErr.message)

    if (next) {
      const result = await selectAssetVersion(supabase, generationId, next.id)
      step = result.step
    } else {
      const { data: cleared, error: clearErr } = await supabase
        .from('mini_nous_generation_steps')
        .update({
          image_url: null,
          r2_key: null,
          fal_url: null,
          active_version_id: null,
          status: 'pending',
        })
        .eq('generation_id', generationId)
        .eq('asset_type', target.asset_type)
        .select()
        .maybeSingle()
      if (clearErr) throw new Error(clearErr.message)
      step = cleared
    }
  }

  return { deleted: versionId, step }
}

export function groupVersions(versions) {
  return versions.reduce((acc, v) => {
    ;(acc[v.asset_type] ??= []).push(v)
    return acc
  }, {})
}

export function selectedUrlMap(steps) {
  const map = {}
  for (const s of steps ?? []) {
    map[s.asset_type] = s.image_url
    if (s.asset_type === 'step1') map.step1 = s.image_url
    if (s.asset_type === 'step2') map.step2 = s.image_url
    if (s.asset_type === 'source') map.user = s.image_url
    if (s.asset_type === 'ref') map.ref = s.image_url
  }
  return map
}
