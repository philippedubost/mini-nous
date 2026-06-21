import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSupabase } from './supabase.js'
import { getSiteUrl, getStripe } from './stripe-client.js'
import { startPaywallOrder, resolveCheckoutOrder } from './paywall-order.js'
import { linkOrderToGeneration } from './orders.js'
import { saveAssetVersion } from './assets.js'
import { WORKFLOW_STATUS } from './order-workflow.js'
import { applyAdminWorkflowStatus } from './admin-workflow.js'
import { hasAdminHeader } from './admin.js'
import { computeQuote } from './packs.js'

const TEST_EMAIL = 'pdubost@gmail.com'
const TEST_NAME = 'Jean-Test'
const TEST_FACE_COUNT = 2

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

export function isTestFlowEnabled(env = process.env) {
  if (env.ENABLE_TEST_FLOW === '1' || env.ENABLE_TEST_FLOW === 'true') return true
  if (env.VERCEL_ENV === 'preview') return true
  if (env.NODE_ENV !== 'production') return true
  return false
}

export function assertTestFlowAccess(req) {
  if (!isTestFlowEnabled()) {
    throw Object.assign(new Error('Test flow désactivé en production'), { status: 404 })
  }
  if (!hasAdminHeader(req)) {
    throw Object.assign(new Error('Header X-MiniNous-Admin requis'), { status: 403 })
  }
}

async function loadPlaceholderPhotoBase64() {
  const paths = [
    join(root, 'images', 'duo.webp'),
    join(root, 'dist', 'images', 'duo.webp'),
  ]
  for (const p of paths) {
    try {
      const buf = await readFile(p)
      return `data:image/webp;base64,${buf.toString('base64')}`
    } catch {
      // try next
    }
  }
  throw new Error('Image placeholder images/duo.webp introuvable')
}

export function testFlowDefaults() {
  return {
    email: TEST_EMAIL,
    customerName: TEST_NAME,
    faceCount: TEST_FACE_COUNT,
    childCount: 0,
    stripeCard: '4242424242424242',
    stripeExpiry: '08/27',
    stripeCvc: '123',
  }
}

export async function createTestDraftOrder(req, env, {
  faceCount = TEST_FACE_COUNT,
  childCount = 0,
  email = TEST_EMAIL,
  customerName = TEST_NAME,
} = {}) {
  const photoBase64 = await loadPlaceholderPhotoBase64()
  const quote = computeQuote(faceCount)
  if (!quote.ok) throw Object.assign(new Error('faceCount invalide'), { status: 400 })

  const result = await startPaywallOrder(req, env, {
    faceCount: quote.faceCount,
    packType: quote.basePack.id,
    childCount,
    photoBase64,
  })

  const supabase = getSupabase()
  const { data: order, error } = await supabase
    .from('mini_nous_orders')
    .update({
      email,
      customer_name: customerName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', result.order.id)
    .select('*, week:mini_nous_production_weeks(*)')
    .single()
  if (error) throw new Error(error.message)

  return {
    order,
    accessToken: order.access_token,
    generationId: result.generationId,
    sourcePhotoUrl: result.sourcePhotoUrl,
  }
}

export async function createTestCheckoutSession(req, env, {
  accessToken,
  faceCount = TEST_FACE_COUNT,
  childCount = 0,
  email = TEST_EMAIL,
  customerName = TEST_NAME,
  fridayDelivery = false,
}) {
  const quote = computeQuote(faceCount)
  if (!quote.ok) throw Object.assign(new Error('faceCount invalide'), { status: 400 })

  const resolved = await resolveCheckoutOrder(req, env, {
    accessToken,
    pack: quote.basePack.id,
    faceCount: quote.faceCount,
    email,
    customerName,
    childCount,
    fridayDelivery,
  })

  const order = resolved.order
  const week = resolved.week
  const stripe = getStripe()
  const site = getSiteUrl(req).replace(/\/$/, '')
  const packDef = quote.basePack
  const figurineLabel = quote.faceCount === 1
    ? '1 figurine MiniNous'
    : `${quote.faceCount} figurines MiniNous`

  const lineItems = [{
    price_data: {
      currency: 'eur',
      product_data: {
        name: figurineLabel,
        description: `Test E2E · Édition du ${week.ship_date}`,
      },
      unit_amount: packDef.priceCents,
    },
    quantity: 1,
  }]

  if (quote.extraCount > 0) {
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: { name: 'Personnage supplémentaire' },
        unit_amount: quote.extraPersonCents,
      },
      quantity: quote.extraCount,
    })
  }

  if (quote.shippingCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: { name: 'Frais de port' },
        unit_amount: quote.shippingCents,
      },
      quantity: 1,
    })
  }

  const supabase = getSupabase()
  await supabase
    .from('mini_nous_orders')
    .update({
      email,
      customer_name: customerName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: lineItems,
    success_url: `${site}/pipeline/test?order=${order.access_token}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/pipeline/test?cancelled=1`,
    metadata: {
      order_id: order.id,
      pack_type: packDef.id,
      face_count: String(quote.faceCount),
      extra_count: String(quote.extraCount),
      week_id: week.id,
      access_token: order.access_token,
      pack_label: order.metadata?.pack_label ?? packDef.label,
      ship_date: week.ship_date ?? '',
      test_flow: '1',
      child_count: childCount != null ? String(childCount) : '',
    },
    allow_promotion_codes: false,
  })

  return {
    url: session.url,
    sessionId: session.id,
    accessToken: order.access_token,
    orderId: order.id,
  }
}

export async function mockStudioForOrder(req, order) {
  const supabase = getSupabase()
  const meta = order.metadata ?? {}
  let generationId = order.generation_id ?? meta.draft_generation_id
  if (!generationId) throw Object.assign(new Error('Génération manquante'), { status: 400 })

  if (!order.generation_id) {
    await linkOrderToGeneration(order.id, generationId)
    order = { ...order, generation_id: generationId }
  }

  const site = getSiteUrl(req).replace(/\/$/, '')
  const sourceUrl = meta.paywall_source_url || `${site}/images/duo.webp`
  const lineartUrl = `${site}/images/duo-lineart.webp`

  await saveAssetVersion(supabase, {
    generationId,
    assetType: 'source',
    imageUrl: sourceUrl,
    status: 'done',
    source: 'test_flow',
  })
  await saveAssetVersion(supabase, {
    generationId,
    assetType: 'step1',
    imageUrl: sourceUrl,
    status: 'done',
    source: 'test_flow',
  })
  await saveAssetVersion(supabase, {
    generationId,
    assetType: 'step2',
    imageUrl: lineartUrl,
    status: 'done',
    source: 'test_flow',
  })

  await supabase
    .from('mini_nous_generations')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', generationId)

  const now = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      workflow_status: WORKFLOW_STATUS.PENDING_VALIDATION,
      updated_at: now,
      metadata: {
        ...meta,
        lineart_version: 1,
        test_flow_mock_at: now,
      },
    })
    .eq('id', order.id)

  return { generationId, lineartUrl, workflowStatus: WORKFLOW_STATUS.PENDING_VALIDATION }
}

export async function validateTestOrder(supabase, order) {
  const meta = order.metadata ?? {}
  const now = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      workflow_status: WORKFLOW_STATUS.APPROVED,
      updated_at: now,
      metadata: {
        ...meta,
        validated_at: now,
        validated_lineart_version: 1,
        version_pick_required: false,
        test_flow_validated_at: now,
      },
    })
    .eq('id', order.id)
  return WORKFLOW_STATUS.APPROVED
}

export async function advanceTestOrderWorkflow(req, order, targetStatus) {
  const supabase = getSupabase()
  return applyAdminWorkflowStatus(req, supabase, order, targetStatus)
}

export async function runPostPaymentTestFlow(req, order) {
  const supabase = getSupabase()
  const steps = []

  const { data: fresh, error } = await supabase
    .from('mini_nous_orders')
    .select('*, week:mini_nous_production_weeks(*)')
    .eq('id', order.id)
    .single()
  if (error) throw new Error(error.message)
  if (fresh.status !== 'paid') {
    throw Object.assign(new Error('Commande non payée'), { status: 402 })
  }

  steps.push({ step: 'mock_studio', ...(await mockStudioForOrder(req, fresh)) })

  await validateTestOrder(supabase, fresh)
  steps.push({ step: 'validate', workflowStatus: WORKFLOW_STATUS.APPROVED })

  let current = fresh
  for (const status of [WORKFLOW_STATUS.IN_PRODUCTION, WORKFLOW_STATUS.SHIPPED]) {
    const { data: row } = await supabase
      .from('mini_nous_orders')
      .select('*, week:mini_nous_production_weeks(*)')
      .eq('id', order.id)
      .single()
    current = row
    await advanceTestOrderWorkflow(req, current, status)
    steps.push({ step: 'admin_workflow', workflowStatus: status })
  }

  return { steps, accessToken: current.access_token }
}
