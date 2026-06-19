import { randomBytes } from 'node:crypto'
import { getSupabase } from './supabase.js'
import { getPack, computeQuote } from './packs.js'
import { assertCapacity, getOrCreateCurrentWeek, refreshWeekSoldCount } from './weeks.js'
import { buildFabricationPayload, loadWeeksById } from './fabrication.js'
import { WORKFLOW_STATUS } from './order-workflow.js'

export function newAccessToken() {
  return randomBytes(24).toString('hex')
}

export async function createPendingOrder({
  packType, faceCount, email, customerName,
  giftDelivery, giftRecipientName, giftMessage, childCount,
}) {
  const supabase = getSupabase()
  const quote = faceCount != null ? computeQuote(faceCount) : null
  if (quote && !quote.ok) {
    if (quote.reason === 'too_many') {
      throw new Error(`Maximum ${quote.maxFaces} personnages par photo`)
    }
    throw new Error('Nombre de personnages invalide')
  }

  const pack = quote?.basePack ?? getPack(packType)
  const actualFaceCount = quote?.faceCount ?? pack.faceCount
  const amountCents = quote?.totalCents ?? (pack.priceCents + pack.shippingCents)
  const shippingCents = quote?.shippingCents ?? pack.shippingCents
  const packLabel = quote?.label ?? pack.label

  const week = await getOrCreateCurrentWeek(supabase)
  await assertCapacity(supabase, week.id, actualFaceCount)

  const accessToken = newAccessToken()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .insert({
      week_id: week.id,
      pack_type: pack.id,
      face_count: actualFaceCount,
      amount_cents: amountCents,
      shipping_cents: shippingCents,
      email: email ?? null,
      customer_name: customerName ?? null,
      status: 'pending',
      access_token: accessToken,
      metadata: {
        pack_label: packLabel,
        extra_count: quote?.extraCount ?? 0,
        base_pack: pack.id,
        child_count: childCount != null ? Number(childCount) : null,
        gift_delivery: giftDelivery ? true : false,
        gift_recipient_name: giftRecipientName ?? null,
        gift_message: giftMessage ?? null,
      },
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return { order: data, week, pack, quote }
}

export async function markOrderPaid({
  orderId, stripeSessionId, stripePaymentIntentId, email, customerName, amountTotal,
}) {
  const supabase = getSupabase()
  const { data: order, error: findErr } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', orderId)
    .single()
  if (findErr) throw new Error(findErr.message)
  if (order.status === 'paid') return order

  await assertCapacity(supabase, order.week_id, order.face_count)

  const { data: updated, error } = await supabase
    .from('mini_nous_orders')
    .update({
      status: 'paid',
      workflow_status: WORKFLOW_STATUS.AWAITING_PHOTO,
      stripe_session_id: stripeSessionId,
      stripe_payment_intent_id: stripePaymentIntentId ?? null,
      email: email ?? order.email,
      customer_name: customerName ?? order.customer_name,
      amount_cents: amountTotal ?? order.amount_cents,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single()
  if (error) throw new Error(error.message)

  await refreshWeekSoldCount(supabase, order.week_id)

  return updated
}

export async function linkOrderToGeneration(orderId, generationId) {
  const supabase = getSupabase()
  const { error: oErr } = await supabase
    .from('mini_nous_orders')
    .update({
      generation_id: generationId,
      workflow_status: WORKFLOW_STATUS.IN_STUDIO,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
  if (oErr) throw new Error(oErr.message)
  await supabase
    .from('mini_nous_generations')
    .update({ order_id: orderId })
    .eq('id', generationId)
}

export async function getOrderByToken(token) {
  if (!token) return null
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('access_token', token)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/** Pack catalogue le plus proche — le face_count réel reste celui de la génération. */
function packTypeForFaceCount(faceCount) {
  const n = Math.max(1, Number(faceCount) || 1)
  if (n <= 2) return 'duo'
  if (n <= 4) return 'famille'
  return 'grande_famille'
}

export async function listAvailableGenerationsForWeek(supabase) {
  const { data: gens, error } = await supabase
    .from('mini_nous_generations')
    .select('id, created_at, status, face_count, resolution, aspect_ratio, order_id, fabricated_at, fabricated_week_id, fabricated_batch_key')
    .is('order_id', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const weekById = await loadWeeksById(
    supabase,
    (gens ?? []).map(g => g.fabricated_week_id).filter(Boolean),
  )

  const enriched = []
  for (const gen of gens ?? []) {
    const { data: steps } = await supabase
      .from('mini_nous_generation_steps')
      .select('asset_type, image_url')
      .eq('generation_id', gen.id)
      .in('asset_type', ['step2', 'step1', 'source', 'laser_merged'])

    const stepMap = Object.fromEntries((steps ?? []).map(s => [s.asset_type, s.image_url]))
    enriched.push({
      id: gen.id,
      createdAt: gen.created_at,
      status: gen.status,
      faceCount: gen.face_count,
      resolution: gen.resolution,
      aspectRatio: gen.aspect_ratio,
      hasLaserSvg: !!stepMap.laser_merged,
      thumbUrl: stepMap.step2 || stepMap.step1 || stepMap.source || null,
      fabrication: buildFabricationPayload(gen, weekById),
    })
  }
  return enriched
}

export async function assignGenerationToWeek({ weekKey, generationId, customerName }) {
  const supabase = getSupabase()

  const { data: week, error: wErr } = await supabase
    .from('mini_nous_production_weeks')
    .select('*')
    .eq('week_key', weekKey)
    .single()
  if (wErr) throw new Error(wErr.message)

  const { data: gen, error: gErr } = await supabase
    .from('mini_nous_generations')
    .select('*')
    .eq('id', generationId)
    .single()
  if (gErr) throw new Error(gErr.message)

  if (gen.order_id) {
    const { data: existingOrder } = await supabase
      .from('mini_nous_orders')
      .select('id, week_id, status')
      .eq('id', gen.order_id)
      .maybeSingle()
    if (existingOrder?.week_id === week.id && existingOrder.status === 'paid') {
      return { ok: true, orderId: existingOrder.id, alreadyAssigned: true }
    }
    throw new Error('Cette génération est déjà rattachée à une commande.')
  }

  const faceCount = gen.face_count ?? 1
  const packType = packTypeForFaceCount(faceCount)
  const packLabel = `Admin · ${faceCount} perso${faceCount > 1 ? 's' : ''}`

  await assertCapacity(supabase, week.id, faceCount)

  const { data: order, error: oErr } = await supabase
    .from('mini_nous_orders')
    .insert({
      week_id: week.id,
      pack_type: packType,
      face_count: faceCount,
      amount_cents: 0,
      shipping_cents: 0,
      customer_name: customerName || `Admin · ${new Date(gen.created_at).toLocaleDateString('fr-FR')}`,
      status: 'paid',
      paid_at: new Date().toISOString(),
      access_token: newAccessToken(),
      generation_id: generationId,
      workflow_status: WORKFLOW_STATUS.IN_STUDIO,
      metadata: { source: 'admin', pack_label: packLabel },
    })
    .select()
    .single()
  if (oErr) throw new Error(oErr.message)

  await linkOrderToGeneration(order.id, generationId)
  await refreshWeekSoldCount(supabase, week.id)

  return { ok: true, orderId: order.id, generationId }
}

export async function removeAdminOrderFromWeek(orderId) {
  const supabase = getSupabase()
  const { data: order, error } = await supabase
    .from('mini_nous_orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(error.message)
  if (order.metadata?.source !== 'admin') {
    throw new Error('Seules les commandes admin peuvent être retirées de l\'édition.')
  }

  if (order.generation_id) {
    const { error: gErr } = await supabase
      .from('mini_nous_generations')
      .update({ order_id: null, updated_at: new Date().toISOString() })
      .eq('id', order.generation_id)
    if (gErr) throw new Error(gErr.message)
  }

  const { error: uErr } = await supabase
    .from('mini_nous_orders')
    .update({
      status: 'cancelled',
      generation_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
  if (uErr) throw new Error(uErr.message)

  await refreshWeekSoldCount(supabase, order.week_id)
  return { ok: true }
}
