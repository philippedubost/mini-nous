import pipelineSettings from './handlers/pipeline-settings.js'
import waitlist from './handlers/waitlist.js'
import track from './handlers/track.js'
import metrics from './handlers/metrics.js'
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
import quote from './handlers/quote.js'
import adminBoard from './handlers/admin-board.js'
import testFlow from './handlers/test-flow.js'
import engagement from './handlers/engagement.js'
import promoCodes from './handlers/promo-codes.js'
import studioGenerate from './handlers/studio-generate.js'
import studioWorker from './handlers/studio-worker.js'

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
  quote,
  'admin-board': adminBoard,
  'test-flow': testFlow,
  engagement,
  'promo-codes': promoCodes,
  'studio-generate': studioGenerate,
  'studio-worker': studioWorker,
  waitlist,
  track,
  metrics,
}

export async function dispatch(name, req, res) {
  const handler = routes[name]
  if (!handler) {
    res.status(404).json({ error: `Unknown API: ${name}` })
    return
  }
  await handler(req, res)
}
