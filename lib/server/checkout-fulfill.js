import { markOrderPaid } from './orders.js'
import { sendOrderConfirmationEmailIfNeeded } from './order-email.js'
import { shippingAddressFromStripeDetails } from './shipping.js'
import { resolveCustomerFirstName } from './customer-name.js'
import { queueStudioGenerate } from './studio-generate.js'

/** Extrait l'URL PDF de facture depuis une session ou un objet invoice Stripe. */
function resolveInvoicePdfUrl(session) {
  const inv = session.invoice
  if (!inv) return null
  if (typeof inv === 'object' && inv.invoice_pdf) return inv.invoice_pdf
  return null
}

/** Marque la commande payée à partir d'une session Stripe Checkout complétée. */
export async function fulfillCheckoutSession(req, session) {
  const orderId = session.metadata?.order_id
  if (!orderId) {
    return { ok: false, reason: 'no_order_id' }
  }
  if (session.payment_status !== 'paid') {
    return { ok: false, paid: false, paymentStatus: session.payment_status }
  }

  const stripeShipping = shippingAddressFromStripeDetails(
    session.shipping_details ?? session.collected_information?.shipping_details,
  ) ?? shippingAddressFromStripeDetails(session.customer_details)

  const invoiceUrl = resolveInvoicePdfUrl(session)

  const order = await markOrderPaid({
    orderId,
    stripeSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id,
    email: session.customer_details?.email ?? session.customer_email,
    customerName: session.customer_details?.name,
    amountTotal: session.amount_total,
    shippingAddress: stripeShipping,
    invoiceUrl,
  })

  const customerFirstName = resolveCustomerFirstName({
    customerName: session.customer_details?.name,
    metadata: order.metadata,
  })
  sendOrderConfirmationEmailIfNeeded(req, {
    orderId,
    email: session.customer_details?.email ?? session.customer_email,
    accessToken: session.metadata?.access_token,
    packLabel: session.metadata?.pack_label,
    faceCount: Number(session.metadata?.face_count) || undefined,
    shipDate: session.metadata?.ship_date,
    fridayDelivery: session.metadata?.friday_delivery === '1',
    customerName: session.customer_details?.name,
    customerFirstName,
  }).catch(err => console.error('[order-email]', err))

  const hasPhoto = !!(order.metadata?.paywall_source_url || order.metadata?.draft_generation_id)
  if (hasPhoto) {
    queueStudioGenerate(order.id).catch(err => console.error('[studio-generate queue]', err))
  }

  return {
    ok: true,
    paid: true,
    order,
    accessToken: session.metadata?.access_token,
  }
}
