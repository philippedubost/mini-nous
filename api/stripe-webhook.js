import stripeWebhook from '../lib/api/handlers/stripe-webhook.js'
import { prepareRequest } from '../lib/api/prepare-req.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  await prepareRequest(req)
  return stripeWebhook(req, res)
}
