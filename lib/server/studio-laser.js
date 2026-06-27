import { getSupabase } from './supabase.js'
import { saveAssetVersion, getNextVersion, isDuplicateVersionError } from './assets.js'
import { uploadPipelineAssetToR2 } from './r2.js'
import { runServerLaserPipeline } from './studio-laser-pipeline.js'
import { rgbaToDataUrl, svgToDataUrl } from './trace/image.js'
import { WORKFLOW_STATUS } from './order-workflow.js'
import { resolveValidatedLineartUrl } from './lineart-resolve.js'

function nowIso() {
  return new Date().toISOString()
}

function laserJob(meta) {
  return meta?.studio_laser ?? null
}

function shouldAutoChain() {
  return process.env.STUDIO_AUTO_CHAIN === '1'
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw Object.assign(new Error('Commande introuvable'), { status: 404 })
  return data
}

async function patchLaserJob(supabase, order, patch) {
  const meta = order.metadata ?? {}
  const prev = laserJob(meta) ?? {}
  const studio_laser = { ...prev, ...patch, updatedAt: nowIso() }

  if (patch.phase === 'error' && patch.error) {
    const prevLog = Array.isArray(prev.errorLog) ? prev.errorLog : []
    studio_laser.errorLog = [
      ...prevLog,
      { at: nowIso(), phase: 'error', message: String(patch.error) },
    ].slice(-30)
  }

  const { data, error } = await supabase
    .from('mini_nous_orders')
    .update({
      metadata: { ...meta, studio_laser },
      updated_at: nowIso(),
    })
    .eq('id', order.id)
    .select('*, week:mini_nous_production_weeks(*)')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function persistLaserAsset(supabase, generationId, assetType, base64, { source, metadata } = {}) {
  let result
  for (let attempt = 0; attempt < 5; attempt++) {
    const version = await getNextVersion(supabase, generationId, assetType)
    const { url: imageUrl, key } = await uploadPipelineAssetToR2(
      { generationId, assetType, base64, version },
      process.env,
    )
    try {
      result = await saveAssetVersion(supabase, {
        generationId,
        assetType,
        imageUrl,
        r2Key: key,
        status: 'done',
        source: source ?? 'studio_laser',
        select: true,
        version,
        metadata,
      })
      break
    } catch (e) {
      if (!isDuplicateVersionError(e) || attempt === 4) throw e
    }
  }
  return result
}

async function orderHasLaserSvg(supabase, generationId) {
  const { data } = await supabase
    .from('mini_nous_generation_steps')
    .select('image_url, fal_url')
    .eq('generation_id', generationId)
    .eq('asset_type', 'laser_merged')
    .maybeSingle()
  return !!(data?.image_url || data?.fal_url)
}

export function chainStudioLaser(orderId, delayMs = 500) {
  const secret = process.env.STUDIO_GENERATE_SECRET
  const site = (process.env.SITE_URL || 'https://mininous.app').replace(/\/$/, '')
  if (!secret) {
    console.warn('[studio-laser] STUDIO_GENERATE_SECRET absent — chaînage impossible')
    return Promise.resolve()
  }
  const run = async () => {
    const res = await fetch(`${site}/api/studio-laser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ orderId }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[studio-laser chain]', res.status, body.slice(0, 200))
    }
  }
  if (delayMs > 0) return sleep(delayMs).then(run)
  return run()
}

async function assertLaserReady(supabase, order) {
  const generationId = order.generation_id ?? order.metadata?.draft_generation_id
  if (!generationId) {
    throw Object.assign(new Error('generation_id manquant'), { status: 400 })
  }
  if (order.status !== 'paid') {
    throw Object.assign(new Error('Commande non payée — laser impossible'), { status: 400 })
  }
  const step2Url = await resolveValidatedLineartUrl(supabase, order, url => url)
  if (!step2Url) {
    throw Object.assign(new Error('Tracé step2 validé introuvable'), { status: 400 })
  }
  return { generationId, step2Url }
}

export async function queueStudioLaser(orderId, { force = false } = {}) {
  const supabase = getSupabase()
  const order = await loadOrder(supabase, orderId)

  const approved = [WORKFLOW_STATUS.APPROVED, WORKFLOW_STATUS.IN_PRODUCTION].includes(order.workflow_status)
  if (!approved && !force) {
    throw Object.assign(new Error('Tracé non validé — laser impossible'), { status: 400 })
  }

  const { generationId } = await assertLaserReady(supabase, order)

  const job = laserJob(order.metadata)
  if (job?.phase === 'running') return { queued: true, reused: true }
  if (job?.phase === 'error' && !force) {
    return { skipped: true, reason: 'laser_error', error: job.error ?? null }
  }
  if (job?.phase === 'done' && !force) {
    const hasSvg = await orderHasLaserSvg(supabase, generationId)
    if (hasSvg) return { skipped: true, reason: 'already_done' }
  }

  await patchLaserJob(supabase, order, {
    phase: 'queued',
    error: null,
    log: null,
    startedAt: nowIso(),
  })

  if (shouldAutoChain()) await chainStudioLaser(orderId)
  return { queued: true }
}

export async function runStudioLaserForOrderId(orderId) {
  const supabase = getSupabase()
  let order = await loadOrder(supabase, orderId)
  const job = laserJob(order.metadata)
  if (job?.phase === 'done') {
    const generationId = order.generation_id ?? order.metadata?.draft_generation_id
    if (generationId && await orderHasLaserSvg(supabase, generationId)) {
      return { done: true, phase: 'done' }
    }
  }
  if (job?.phase === 'running') return { done: false, phase: 'running' }

  const generationId = order.generation_id ?? order.metadata?.draft_generation_id
  if (!generationId) {
    await patchLaserJob(supabase, order, { phase: 'error', error: 'generation_id manquant' })
    return { done: true, phase: 'error', error: 'generation_id manquant' }
  }

  try {
    await assertLaserReady(supabase, order)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await patchLaserJob(supabase, order, { phase: 'error', error: message, log: null })
    console.error('[studio-laser]', orderId, message)
    return { done: true, phase: 'error', error: message }
  }

  order = await patchLaserJob(supabase, order, { phase: 'running', log: 'Démarrage…' })

  try {
    const onProgress = async (log) => {
      order = await patchLaserJob(supabase, order, { log })
    }

    const { layers, merged, traceSettings } = await runServerLaserPipeline(supabase, {
      generationId,
      order,
      faceCount: order.face_count,
      onProgress,
    })

    await onProgress('Upload calques PNG + SVG…')
    const meta = { traceSettings }
    await Promise.all([
      persistLaserAsset(supabase, generationId, 'outline', await rgbaToDataUrl(layers.outline)),
      persistLaserAsset(supabase, generationId, 'outline_bulk', await rgbaToDataUrl(layers.outlineBulky)),
      persistLaserAsset(supabase, generationId, 'gravure', await rgbaToDataUrl(layers.gravure)),
      persistLaserAsset(supabase, generationId, 'overlay', await rgbaToDataUrl(layers.overlay)),
      persistLaserAsset(supabase, generationId, 'laser_merged', await svgToDataUrl(merged), { metadata: meta }),
    ])

    const { error: doneErr } = await supabase
      .from('mini_nous_generations')
      .update({ status: 'done', updated_at: nowIso() })
      .eq('id', generationId)
    if (doneErr) throw new Error(doneErr.message)

    await patchLaserJob(supabase, order, { phase: 'done', log: 'SVG laser prêt ✓', error: null })
    return { done: true, phase: 'done' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await patchLaserJob(supabase, order, { phase: 'error', error: message, log: null })
    console.error('[studio-laser]', orderId, message)
    const { error: markErr } = await supabase
      .from('mini_nous_generations')
      .update({ status: 'error', error_message: message, updated_at: nowIso() })
      .eq('id', generationId)
    if (markErr) console.error('[studio-laser] mark generation error:', markErr.message)
    return { done: true, phase: 'error', error: message }
  }
}
