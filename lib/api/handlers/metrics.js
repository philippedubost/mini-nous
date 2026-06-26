import { getAuthUser } from '../../server/auth.js'
import { hasAdminAccess } from '../../server/admin.js'
import { getFunnelStats, computeConversionRates } from '../../server/funnel.js'
import { getWaitlistStats, listWaitlistEmails } from '../../server/waitlist.js'
import { getSupabase } from '../../server/supabase.js'
import { getOrCreateCurrentWeek, getPaidOrderCount } from '../../server/weeks.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const user = await getAuthUser(req)
    if (!hasAdminAccess(req, user)) {
      return res.status(403).json({ error: 'Accès admin requis' })
    }

    const supabase = getSupabase()
    const week = await getOrCreateCurrentWeek(supabase)
    const weekKey = week.week_key

    const [funnelAll, funnelWeek, waitlistAll, waitlistWeek, paidThisWeek, waitlistEmails] = await Promise.all([
      getFunnelStats({ days: 30 }),
      getFunnelStats({ weekKey, days: 90 }),
      getWaitlistStats(null),
      getWaitlistStats(weekKey),
      getPaidOrderCount(supabase, week.id),
      listWaitlistEmails({ limit: 100, weekKey }),
    ])

    const conversion = computeConversionRates(funnelAll.counts, null)
    const conversionWeek = computeConversionRates(funnelWeek.counts, paidThisWeek)

    return res.status(200).json({
      weekKey,
      funnel: {
        last30Days: funnelAll,
        thisWeek: funnelWeek,
      },
      conversion: {
        last30Days: conversion,
        thisWeek: conversionWeek,
      },
      waitlist: {
        allTime: waitlistAll,
        thisWeek: waitlistWeek,
        emails: waitlistEmails,
      },
      week: {
        id: week.id,
        weekKey: week.week_key,
        shipDate: week.ship_date,
        capacity: week.capacity ?? 100,
        paidCount: paidThisWeek,
      },
    })
  } catch (e) {
    console.error('[metrics]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
