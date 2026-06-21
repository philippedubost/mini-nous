import { getJsonBody } from '../prepare-req.js'
import { buildOrderResponse } from '../../server/order-access.js'
import { getOrderByToken } from '../../server/orders.js'
import { fulfillCheckoutSession } from '../../server/checkout-fulfill.js'
import { getStripe } from '../../server/stripe-client.js'
import { hasAdminHeader } from '../../server/admin.js'
import {
  assertTestFlowAccess,
  createTestDraftOrder,
  createTestCheckoutSession,
  runPostPaymentTestFlow,
  testFlowDefaults,
  isTestFlowEnabled,
} from '../../server/test-flow.js'

function canAccessTestFlow(req) {
  if (isTestFlowEnabled()) return true
  return hasAdminHeader(req)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!canAccessTestFlow(req)) {
    return res.status(404).json({
      error: 'Test flow indisponible — connectez-vous avec le mot de passe admin sur /pipeline/test',
    })
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        enabled: true,
        defaults: testFlowDefaults(),
        hint: 'POST avec header X-MiniNous-Admin (mot de passe admin)',
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    assertTestFlowAccess(req)
    const body = getJsonBody(req)
    const { action, accessToken, sessionId } = body

    if (action === 'create_draft') {
      const result = await createTestDraftOrder(req, process.env, body)
      return res.status(201).json({
        ...result,
        order: await buildOrderResponse(req, result.order, null),
      })
    }

    if (action === 'checkout') {
      const result = await createTestCheckoutSession(req, process.env, body)
      return res.status(200).json(result)
    }

    if (action === 'confirm_payment') {
      if (!sessionId) return res.status(400).json({ error: 'sessionId requis' })
      const stripe = getStripe()
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (accessToken && session.metadata?.access_token !== accessToken) {
        return res.status(403).json({ error: 'Token invalide pour cette session' })
      }
      if (session.payment_status !== 'paid') {
        return res.status(200).json({ paid: false, paymentStatus: session.payment_status })
      }
      const existing = accessToken ? await getOrderByToken(accessToken) : null
      if (existing?.status !== 'paid') {
        await fulfillCheckoutSession(req, session)
      }
      const order = await getOrderByToken(accessToken || session.metadata?.access_token)
      return res.status(200).json({
        paid: true,
        order: order ? await buildOrderResponse(req, order, null) : null,
      })
    }

    if (action === 'run_after_payment') {
      if (!accessToken) return res.status(400).json({ error: 'accessToken requis' })
      const order = await getOrderByToken(accessToken)
      if (!order) return res.status(404).json({ error: 'Commande introuvable' })
      const result = await runPostPaymentTestFlow(req, order)
      const final = await getOrderByToken(accessToken)
      return res.status(200).json({
        ...result,
        order: final ? await buildOrderResponse(req, final, null) : null,
      })
    }

    if (action === 'full_start') {
      const draft = await createTestDraftOrder(req, process.env, body)
      const checkout = await createTestCheckoutSession(req, process.env, {
        accessToken: draft.accessToken,
        ...body,
      })
      return res.status(200).json({
        ...draft,
        checkoutUrl: checkout.url,
        sessionId: checkout.sessionId,
        order: await buildOrderResponse(req, draft.order, null),
      })
    }

    return res.status(400).json({ error: 'action inconnue' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[test-flow]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
