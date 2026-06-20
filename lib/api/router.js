import pipelineSettings from './handlers/pipeline-settings.js'
import orderStart from './handlers/order-start.js'
import checkoutConfirm from './handlers/checkout-confirm.js'
import checkout from './handlers/checkout.js'
import fal from './handlers/fal.js'
import generations from './handlers/generations.js'
import landingPreview from './handlers/landing-preview.js'
import orders from './handlers/orders.js'
import me from './handlers/me.js'
import revisions from './handlers/revisions.js'
import productionWeeks from './handlers/production-weeks.js'
import proxyImage from './handlers/proxy-image.js'
import stripeWebhook from './handlers/stripe-webhook.js'
import traceAutotrace from './handlers/trace-autotrace.js'
import uploadR2 from './handlers/upload-r2.js'
import weekStatus from './handlers/week-status.js'

export const routes = {
  checkout,
  'checkout-confirm': checkoutConfirm,
  'pipeline-settings': pipelineSettings,
  'order-start': orderStart,
  fal,
  generations,
  'landing-preview': landingPreview,
  orders,
  me,
  revisions,
  'production-weeks': productionWeeks,
  'proxy-image': proxyImage,
  'stripe-webhook': stripeWebhook,
  'trace-autotrace': traceAutotrace,
  'upload-r2': uploadR2,
  'week-status': weekStatus,
}

export async function dispatch(name, req, res) {
  const handler = routes[name]
  if (!handler) {
    res.status(404).json({ error: `Unknown API: ${name}` })
    return
  }
  await handler(req, res)
}
