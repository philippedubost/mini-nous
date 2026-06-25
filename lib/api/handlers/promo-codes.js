import { getStripe } from '../../server/stripe-client.js'
import { getAuthUser } from '../../server/auth.js'
import { hasAdminAccess } from '../../server/admin.js'
import { getJsonBody } from '../prepare-req.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const user = await getAuthUser(req)
    if (!hasAdminAccess(req, user)) {
      return res.status(403).json({ error: 'Accès admin requis' })
    }

    const stripe = getStripe()

    if (req.method === 'GET') {
      const { data: codes } = await stripe.promotionCodes.list({
        limit: 50,
        expand: ['data.coupon'],
      })
      return res.status(200).json({ codes })
    }

    if (req.method === 'POST') {
      const { code, percentOff, amountOffCents, currency, maxRedemptions, expiresAt } = getJsonBody(req)
      if (!code) return res.status(400).json({ error: 'code requis' })
      if (!percentOff && !amountOffCents) {
        return res.status(400).json({ error: 'percentOff ou amountOffCents requis' })
      }

      const couponParams = {
        duration: 'once',
        ...(percentOff != null ? { percent_off: percentOff } : {}),
        ...(amountOffCents != null ? {
          amount_off: amountOffCents,
          currency: currency || 'eur',
        } : {}),
        ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      }
      const coupon = await stripe.coupons.create(couponParams)

      const promoParams = {
        coupon: coupon.id,
        code: code.toUpperCase().trim(),
        ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
        ...(expiresAt ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
      }
      const promo = await stripe.promotionCodes.create(promoParams)

      return res.status(201).json({ ok: true, promo, coupon })
    }

    if (req.method === 'DELETE') {
      const { promoCodeId } = getJsonBody(req)
      if (!promoCodeId) return res.status(400).json({ error: 'promoCodeId requis' })
      await stripe.promotionCodes.update(promoCodeId, { active: false })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[promo-codes]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
