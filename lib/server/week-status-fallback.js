import { packList, EXTRA_PERSON_CENTS, FRIDAY_DELIVERY_CENTS, MAX_FACES } from './packs.js'
import { getProductionSchedule, getSocialProofOrderFloor } from './weeks.js'

/** Réponse week-status sans Supabase (dev hors-ligne ou URL invalide). */
export function buildOfflineWeekStatus() {
  const schedule = getProductionSchedule()
  const capacity = schedule.capacity
  const socialProofFloor = getSocialProofOrderFloor(schedule.weekKey)
  const cutoffAt = schedule.cutoffAt instanceof Date
    ? schedule.cutoffAt.toISOString()
    : schedule.cutoffAt

  return {
    weekKey: schedule.weekKey,
    cutoffAt,
    shipDate: schedule.shipDate,
    capacity,
    soldCount: 0,
    orderCount: 0,
    socialProofFloor,
    displayOrderCount: socialProofFloor,
    displaySoldCount: socialProofFloor,
    remaining: capacity,
    displayRemaining: Math.max(0, capacity - socialProofFloor),
    isOpen: new Date() < new Date(cutoffAt),
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
    offline: true,
  }
}

export { isSupabaseNetworkError } from './supabase-errors.js'
