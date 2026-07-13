import { getSupabase } from './supabase.js'
import { getPipelineSettings, DEFAULT_REFERENCE_LINE_URL } from './pipeline-settings.js'
import { saveAssetVersion } from './assets.js'
import { WORKFLOW_STATUS } from './order-workflow.js'
import { loadOrderContext } from './order-workflow.js'
import { sendLineartReadyEmailIfNeeded } from './order-email.js'
import { publicAssetUrl } from './asset-url.js'
import { buildMegaRegenPrompt } from './regen-prompt.js'
import {
  STUDIO_FAL_MODEL,
  buildPrompt1,
  resolveImageUrls,
  uploadRemoteImageToFal,
  submitStudioFalStep,
  pollStudioFalJobWithWait,
} from './fal-studio.js'

const TICK_WAIT_MS = 8000

function shouldAutoChain() {
  return process.env.STUDIO_AUTO_CHAIN === '1'
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function nowIso() {
  return new Date().toISOString()
}

function studioJob(meta) {
  return meta?.studio_generate ?? null
}

async function loadUrlMap(supabase, generationId) {
  const urlMap = { user: null, ref: null, step1: null, step2: null }
  if (!generationId) return urlMap
  const { data, error } = await supabase
    .from('mini_nous_generation_steps')
    .select('asset_type, fal_url, image_url, status')
    .eq('generation_id', generationId)
  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    if (row.status === 'done' || row.fal_url || row.image_url) {
      urlMap[row.asset_type] = row.fal_url || row.image_url
    }
  }
  return urlMap
}

async function resolveReferenceFalUrl(settings) {
  let refUrl = settings.referenceLineUrl || DEFAULT_REFERENCE_LINE_URL
  if (refUrl.startsWith('/')) {
    const site = (process.env.SITE_URL || 'https://www.woodtribe.fr').replace(/\/$/, '')
    refUrl = `${site}${refUrl}`
  }
  return uploadRemoteImageToFal(refUrl, 'reference-line.png')
}

async function patchStudioJob(supabase, order, patch) {
  const meta = order.metadata ?? {}
  const prev = studioJob(meta) ?? {}
  const studio_generate = { ...prev, ...patch, updatedAt: nowIso() }

  if (patch.phase === 'error' && patch.error) {
    const prevLog = Array.isArray(prev.errorLog) ? prev.errorLog : []
    studio_generate.errorLog = [
      ...prevLog,
      {
        at: nowIso(),
        phase: patch.phase,
        step: prev.phase ?? null,
        message: String(patch.error),
      },
    ].slice(-30)
  }

  const { data, error } = await supabase
    .from('mini_nous_orders')
    .update({
      metadata: { ...meta, studio_generate },
      updated_at: nowIso(),
    })
    .eq('id', order.id)
    .select('*, week:mini_nous_production_weeks(*)')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function markGenerationRunning(supabase, generationId) {
  await supabase
    .from('mini_nous_generations')
    .update({ status: 'running', error_message: null, updated_at: nowIso() })
    .eq('id', generationId)
}

async function markGenerationDone(supabase, generationId) {
  await supabase
    .from('mini_nous_generations')
    .update({ status: 'done', updated_at: nowIso() })
    .eq('id', generationId)
}

async function markGenerationError(supabase, generationId, message) {
  await supabase
    .from('mini_nous_generations')
    .update({ status: 'error', error_message: message, updated_at: nowIso() })
    .eq('id', generationId)
}

async function finalizeLineart(req, supabase, order, lineartVersion) {
  const meta = order.metadata ?? {}
  await supabase
    .from('mini_nous_orders')
    .update({
      workflow_status: WORKFLOW_STATUS.PENDING_VALIDATION,
      updated_at: nowIso(),
      metadata: {
        ...meta,
        lineart_version: lineartVersion,
        studio_generate: {
          ...(studioJob(meta) ?? {}),
          phase: 'done',
          updatedAt: nowIso(),
        },
      },
    })
    .eq('id', order.id)

  if (lineartVersion === 1) {
    const { previewUrl: rawPreview, sourcePhotoUrl: rawPhoto } = await loadOrderContext(supabase, order)
    await sendLineartReadyEmailIfNeeded(req, {
      orderId: order.id,
      email: order.email,
      accessToken: order.access_token,
      packLabel: meta.pack_label,
      faceCount: order.face_count,
      sourcePhotoUrl: publicAssetUrl(req, rawPhoto ?? meta.paywall_source_url),
      previewUrl: publicAssetUrl(req, rawPreview),
      lineartVersion: 1,
    }).catch(err => console.error('[studio-generate email]', err))
  }
}

export function chainStudioTick(orderId, delayMs = 1500) {
  const secret = process.env.STUDIO_GENERATE_SECRET
  const site = (process.env.SITE_URL || 'https://www.woodtribe.fr').replace(/\/$/, '')
  if (!secret) {
    console.warn('[studio-generate] STUDIO_GENERATE_SECRET absent — chaînage impossible')
    return Promise.resolve()
  }
  const run = async () => {
    const res = await fetch(`${site}/api/studio-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ orderId }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[studio-generate chain]', res.status, body.slice(0, 200))
    }
  }
  if (delayMs > 0) return sleep(delayMs).then(run)
  return run()
}

async function ensureOrderGeneration(supabase, order) {
  let generationId = order.generation_id ?? order.metadata?.draft_generation_id ?? null
  if (generationId) {
    if (!order.generation_id) {
      await supabase
        .from('mini_nous_orders')
        .update({
          generation_id: generationId,
          workflow_status: WORKFLOW_STATUS.IN_STUDIO,
          updated_at: nowIso(),
        })
        .eq('id', order.id)
    }
    return generationId
  }

  const { data: gen, error } = await supabase
    .from('mini_nous_generations')
    .insert({
      face_count: order.face_count,
      resolution: '2K',
      aspect_ratio: '16:9',
      order_id: order.id,
      status: 'running',
      fal_model: STUDIO_FAL_MODEL,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)

  const meta = order.metadata ?? {}
  await supabase
    .from('mini_nous_orders')
    .update({
      generation_id: gen.id,
      workflow_status: WORKFLOW_STATUS.IN_STUDIO,
      updated_at: nowIso(),
      metadata: { ...meta, draft_generation_id: gen.id },
    })
    .eq('id', order.id)

  return gen.id
}

export async function queueStudioGenerate(orderId, { mode = 'initial', feedback = null } = {}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(error.message)
  if (data.status !== 'paid') return { skipped: true, reason: 'not_paid' }

  let order = data

  await ensureOrderGeneration(supabase, order)

  const { data: fresh, error: reloadErr } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', orderId)
    .single()
  if (reloadErr) throw new Error(reloadErr.message)
  order = fresh

  const draftId = order.metadata?.draft_generation_id
  if (draftId && !order.generation_id) {
    await supabase
      .from('mini_nous_orders')
      .update({
        generation_id: draftId,
        workflow_status: WORKFLOW_STATUS.IN_STUDIO,
        updated_at: nowIso(),
      })
      .eq('id', orderId)
  }

  const job = studioJob(order.metadata)
  if (job?.phase === 'done') return { skipped: true, reason: 'already_done' }
  if (job && !['error', 'done'].includes(job.phase) && job.mode === mode) {
    if (shouldAutoChain()) await chainStudioTick(orderId)
    return { queued: true, reused: true }
  }

  await patchStudioJob(supabase, order, {
    phase: 'queued',
    mode,
    model: STUDIO_FAL_MODEL,
    startedAt: nowIso(),
    error: null,
    step1RequestId: null,
    step2RequestId: null,
    feedback: feedback ?? null,
  })

  if (shouldAutoChain()) await chainStudioTick(orderId)
  return { queued: true }
}

export async function tickStudioGeneration(req, order) {
  const supabase = getSupabase()
  let meta = order.metadata ?? {}
  let job = studioJob(meta)
  if (!job || job.phase === 'done') return { done: true, phase: job?.phase ?? 'idle' }
  if (job.phase === 'error') return { done: true, phase: 'error', error: job.error }

  const generationId = order.generation_id ?? meta.draft_generation_id
  if (!generationId) return { done: true, phase: 'error', error: 'generation_id manquant' }

  const { settings } = await getPipelineSettings()
  const [cfg1, cfg2] = settings.steps
  const model = job.model || STUDIO_FAL_MODEL
  const isRegen = job.mode === 'regen'
  const lineartVersion = isRegen ? 2 : 1

  let urlMap = await loadUrlMap(supabase, generationId)
  const { sourcePhotoUrl, previewUrl } = await loadOrderContext(supabase, order)
  const sourceUrl = sourcePhotoUrl ?? meta.paywall_source_url

  if (!isRegen && urlMap.step2 && order.workflow_status !== WORKFLOW_STATUS.PENDING_VALIDATION) {
    await markGenerationDone(supabase, generationId)
    await finalizeLineart(req, supabase, order, 1)
    return { done: true, phase: 'done', lineartVersion: 1, recovered: true }
  }

  if (order.workflow_status === WORKFLOW_STATUS.PENDING_VALIDATION && previewUrl) {
    await patchStudioJob(supabase, order, { phase: 'done' })
    return { done: true, phase: 'done', lineartVersion: getLineartVersion(meta) }
  }

  if (!sourceUrl && !urlMap.user) return { done: true, phase: 'awaiting_photo' }

  await markGenerationRunning(supabase, generationId)

  if (!urlMap.user) {
    urlMap.user = await uploadRemoteImageToFal(sourceUrl, 'source.jpg')
    await saveAssetVersion(supabase, {
      generationId,
      assetType: 'source',
      imageUrl: sourceUrl,
      falUrl: urlMap.user,
      status: 'done',
      source: 'studio-server',
    })
  }

  if (!urlMap.ref) {
    urlMap.ref = await resolveReferenceFalUrl(settings)
    await saveAssetVersion(supabase, {
      generationId,
      assetType: 'ref',
      imageUrl: settings.referenceLineUrl || DEFAULT_REFERENCE_LINE_URL,
      falUrl: urlMap.ref,
      status: 'done',
      source: 'studio-server',
    })
  }

  if (isRegen) {
    // v2 : conserver step1 (ordre gauche→droite) — regénérer uniquement le line art step2
    urlMap.step2 = null
  }

  if (!urlMap.step1) {
    if (!job.step1RequestId) {
      const prompt1 = buildPrompt1(order.face_count, cfg1.prompt)
      const requestId = await submitStudioFalStep(
        model,
        { ...cfg1, prompt: prompt1 },
        resolveImageUrls(cfg1.imageInputs, urlMap),
      )
      order = await patchStudioJob(supabase, order, { phase: 'step1', step1RequestId: requestId })
      return { done: false, needsContinue: true, phase: 'step1', submitted: true }
    }

    const poll1 = await pollStudioFalJobWithWait(model, job.step1RequestId, TICK_WAIT_MS)
    if (poll1.status === 'FAILED') {
      await markGenerationError(supabase, generationId, poll1.error)
      await patchStudioJob(supabase, order, { phase: 'error', error: poll1.error })
      return { done: true, phase: 'error', error: poll1.error }
    }
    if (poll1.status !== 'COMPLETED') {
      return { done: false, needsContinue: true, phase: 'step1', status: poll1.status }
    }

    urlMap.step1 = poll1.url
    await saveAssetVersion(supabase, {
      generationId,
      assetType: 'step1',
      imageUrl: poll1.url,
      falUrl: poll1.url,
      prompt: buildPrompt1(order.face_count, cfg1.prompt),
      status: 'done',
      source: 'studio-server',
    })
    order = await patchStudioJob(supabase, order, { step1RequestId: null })
    job = studioJob(order.metadata)
  }

  if (!urlMap.step2) {
    if (!job.step2RequestId) {
      const prompt2 = isRegen
        ? buildMegaRegenPrompt(cfg2.prompt, job.feedback ?? meta.last_regen_feedback)
        : cfg2.prompt
      const step2Inputs = isRegen ? ['step1', 'ref'] : (cfg2.imageInputs ?? ['step1', 'ref'])
      const requestId = await submitStudioFalStep(
        model,
        { ...cfg2, prompt: prompt2 },
        resolveImageUrls(step2Inputs, urlMap),
      )
      order = await patchStudioJob(supabase, order, { phase: 'step2', step2RequestId: requestId })
      return { done: false, needsContinue: true, phase: 'step2', submitted: true }
    }

    const poll2 = await pollStudioFalJobWithWait(model, job.step2RequestId, TICK_WAIT_MS)
    if (poll2.status === 'FAILED') {
      await markGenerationError(supabase, generationId, poll2.error)
      await patchStudioJob(supabase, order, { phase: 'error', error: poll2.error })
      return { done: true, phase: 'error', error: poll2.error }
    }
    if (poll2.status !== 'COMPLETED') {
      return { done: false, needsContinue: true, phase: 'step2', status: poll2.status }
    }

    await saveAssetVersion(supabase, {
      generationId,
      assetType: 'step2',
      imageUrl: poll2.url,
      falUrl: poll2.url,
      prompt: isRegen
        ? buildMegaRegenPrompt(cfg2.prompt, job.feedback ?? meta.last_regen_feedback)
        : cfg2.prompt,
      status: 'done',
      source: 'studio-server',
    })
    await markGenerationDone(supabase, generationId)
    await finalizeLineart(req, supabase, order, lineartVersion)
    return { done: true, phase: 'done', lineartVersion }
  }

  return { done: true, phase: 'done' }
}

function getLineartVersion(meta) {
  return Number(meta?.lineart_version) || 1
}

export async function runStudioTickForOrderId(req, orderId) {
  const supabase = getSupabase()
  const { data: order, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(error.message)
  const result = await tickStudioGeneration(req, order)
  if (result.needsContinue && shouldAutoChain()) {
    await chainStudioTick(orderId, 0)
  }
  return result
}
