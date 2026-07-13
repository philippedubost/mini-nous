import { randomBytes } from 'node:crypto'
import { getStripe } from './stripe-client.js'
import { getSupabase } from './supabase.js'

function uniqueCode(prefix = 'MINI') {
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`
}

/** Coupon -10 % usage unique pour une prochaine commande. */
export async function createLoyaltyPromoCode(orderId, email) {
  const stripe = getStripe()
  const code = uniqueCode()

  const coupon = await stripe.coupons.create({
    percent_off: 10,
    duration: 'once',
    name: 'WoodTribe — prochaine commande',
    max_redemptions: 1,
    redeem_by: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
    metadata: { order_id: String(orderId), type: 'loyalty_shipped' },
  })

  const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code,
    max_redemptions: 1,
    metadata: {
      order_id: String(orderId),
      email: email || '',
      type: 'loyalty_shipped',
    },
  })

  return { code: promo.code, promotionCodeId: promo.id, couponId: coupon.id }
}

export async function attachLoyaltyCouponToOrder(orderId, email) {
  const supabase = getSupabase()
  const { data: order } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata')
    .eq('id', orderId)
    .maybeSingle()

  if (order?.metadata?.loyalty_coupon_code) {
    return {
      code: order.metadata.loyalty_coupon_code,
      skipped: true,
    }
  }

  const { code, promotionCodeId } = await createLoyaltyPromoCode(orderId, email)
  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(order?.metadata ?? {}),
        loyalty_coupon_code: code,
        loyalty_coupon_created_at: sentAt,
        loyalty_promotion_code_id: promotionCodeId,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { code, skipped: false }
}
