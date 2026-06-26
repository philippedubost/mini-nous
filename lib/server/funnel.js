import { getSupabase } from './supabase.js'

/**
 * Événements funnel suivis :
 *   photo_uploaded       — POST /api/order-start réussi
 *   checkout_initiated   — session Stripe créée
 *   payment_completed    — commande markOrderPaid
 *   waitlist_signup      — inscription liste d'attente
 */
export async function trackFunnelEvent(event, {
  sessionId = null,
  orderId = null,
  faceCount = null,
  weekKey = null,
  metadata = {},
} = {}) {
  try {
    const supabase = getSupabase()
    await supabase.from('mini_nous_funnel_events').insert({
      event,
      session_id: sessionId,
      order_id: orderId || null,
      face_count: faceCount ? Number(faceCount) : null,
      week_key: weekKey,
      metadata: metadata ?? {},
    })
  } catch (err) {
    // non-bloquant — on logue mais on ne fait pas échouer la requête principale
    console.warn('[funnel]', event, err.message)
  }
}

/**
 * Statistiques funnel pour une période.
 * Renvoie un tableau d'événements agrégés par type.
 */
export async function getFunnelStats({ weekKey = null, days = 30 } = {}) {
  const supabase = getSupabase()

  const since = new Date(Date.now() - days * 86400000).toISOString()
  let query = supabase
    .from('mini_nous_funnel_events')
    .select('event, face_count, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (weekKey) query = query.eq('week_key', weekKey)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const counts = {}
  for (const r of rows) {
    counts[r.event] = (counts[r.event] ?? 0) + 1
  }

  return { counts, total: rows.length, since }
}

/**
 * Taux de conversion entre étapes.
 * Renvoie les ratios : photo→checkout, checkout→paid.
 */
export function computeConversionRates(counts, paidOrderCount) {
  const uploads = counts.photo_uploaded ?? 0
  const checkouts = counts.checkout_initiated ?? 0
  const paid = paidOrderCount ?? counts.payment_completed ?? 0

  return {
    uploads,
    checkouts,
    paid,
    uploadToCheckout: uploads > 0 ? Math.round((checkouts / uploads) * 100) : null,
    checkoutToPaid: checkouts > 0 ? Math.round((paid / checkouts) * 100) : null,
    uploadToPaid: uploads > 0 ? Math.round((paid / uploads) * 100) : null,
  }
}
