import { getStripe } from '../../server/stripe-client.js'
import { getStripeWebhookSecret } from '../../server/stripe-config.js'
import { markOrderPaid } from '../../server/orders.js'
import { getSupabase } from '../../server/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = getStripeWebhookSecret()
  if (!secret) return res.status(500).json({ error: 'Webhook secret non configuré' })

  const stripe = getStripe()
  const sig = req.headers['stripe-signature']
  const rawBody = req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}))

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    console.error('[stripe-webhook] signature:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const orderId = session.metadata?.order_id
      if (!orderId) {
        console.warn('[stripe-webhook] session sans order_id', session.id)
        return res.status(200).json({ received: true })
      }

      await markOrderPaid({
        orderId,
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id,
        email: session.customer_details?.email ?? session.customer_email,
        customerName: session.customer_details?.name,
        amountTotal: session.amount_total,
      })

      console.log('[stripe-webhook] order paid', orderId)
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object
      const orderId = session.metadata?.order_id
      if (orderId) {
        const supabase = getSupabase()
        await supabase
          .from('mini_nous_orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .eq('status', 'pending')
      }
    }

    return res.status(200).json({ received: true })
  } catch (e) {
    console.error('[stripe-webhook]', e)
    return res.status(500).json({ error: e.message })
  }
}

