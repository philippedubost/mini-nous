import { getSupabase } from '../../server/supabase.js'
import { packList, EXTRA_PERSON_CENTS, FRIDAY_DELIVERY_CENTS, MAX_FACES } from '../../server/packs.js'
import { buildOfflineWeekStatus, isSupabaseNetworkError } from '../../server/week-status-fallback.js'
import {
  getOrCreateCurrentWeek,
  getPaidOrderCount,
  getProductionSchedule,
  getSocialProofOrderFloor,
  getSoldCharacterCount,
} from '../../server/weeks.js'

async function buildLiveWeekStatus(supabase) {
  const schedule = getProductionSchedule()
  const week = await getOrCreateCurrentWeek(supabase)
  const sold = await getSoldCharacterCount(supabase, week.id)
  const orderCount = await getPaidOrderCount(supabase, week.id)
  const capacity = week.capacity ?? 100
  const socialProofFloor = getSocialProofOrderFloor(week.week_key)
  const displayOrderCount = Math.max(orderCount, socialProofFloor)
  const displaySoldCount = Math.max(sold, socialProofFloor)
  const remaining = Math.max(0, capacity - sold)
  const displayRemaining = Math.max(0, capacity - displaySoldCount)

  return {
    weekKey: week.week_key,
    cutoffAt: week.cutoff_at,
    shipDate: week.ship_date,
    capacity,
    soldCount: sold,
    orderCount,
    socialProofFloor,
    displayOrderCount,
    displaySoldCount,
    remaining,
    displayRemaining,
    isOpen: sold < capacity && new Date() < new Date(week.cutoff_at),
    packs: packList().map(p => ({
      id: p.id,
      label: p.label,
      faceCount: p.faceCount,
      priceEur: (p.priceCents / 100).toFixed(2),
      shippingEur: (p.shippingCents / 100).toFixed(2),
      totalEur: ((p.priceCents + p.shippingCents) / 100).toFixed(2),
      description: p.description,
    })),
    extraPersonEur: (EXTRA_PERSON_CENTS / 100).toFixed(2),
    fridayDeliveryEur: (FRIDAY_DELIVERY_CENTS / 100).toFixed(2),
    maxFaces: MAX_FACES,
    message: 'Fabrication artisanale sur-mesure, expédié vendredi',
    schedule,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    if (process.env.SUPABASE_REACHABLE === '0') {
      return res.status(200).json(buildOfflineWeekStatus())
    }

    const supabase = getSupabase()
    const payload = await buildLiveWeekStatus(supabase)
    return res.status(200).json(payload)
  } catch (e) {
    if (isSupabaseNetworkError(e)) {
      console.warn('[week-status] Supabase injoignable — réponse hors-ligne')
      return res.status(200).json(buildOfflineWeekStatus())
    }
    console.error('[week-status]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
