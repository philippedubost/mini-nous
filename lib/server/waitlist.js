import { getSupabase } from './supabase.js'
import { getOrCreateCurrentWeek } from './weeks.js'

/**
 * Inscrit un email en liste d'attente pour la semaine courante (ou une semaine passée).
 * Un doublon email+week_key est ignoré silencieusement.
 */
export async function saveWaitlistEmail(email, { faceCount = null, weekKey = null, source = 'landing' } = {}) {
  const supabase = getSupabase()

  let resolvedWeekKey = weekKey
  if (!resolvedWeekKey) {
    try {
      const week = await getOrCreateCurrentWeek(supabase)
      resolvedWeekKey = week.week_key
    } catch {
      // non-bloquant
    }
  }

  const { error } = await supabase
    .from('mini_nous_waitlist')
    .upsert(
      {
        email: email.trim().toLowerCase(),
        face_count: faceCount ? Number(faceCount) : null,
        week_key: resolvedWeekKey,
        source,
      },
      { onConflict: 'email,week_key', ignoreDuplicates: true },
    )

  if (error && !error.message?.includes('duplicate')) {
    throw new Error(error.message)
  }
  return { ok: true, weekKey: resolvedWeekKey }
}

/**
 * Compte les inscrits en liste d'attente pour une semaine donnée.
 * Renvoie { total, byFaceCount }.
 */
export async function getWaitlistStats(weekKey = null) {
  const supabase = getSupabase()

  let query = supabase
    .from('mini_nous_waitlist')
    .select('face_count, created_at')

  if (weekKey) query = query.eq('week_key', weekKey)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const byFaceCount = {}
  for (const r of rows) {
    const k = r.face_count ?? 'unknown'
    byFaceCount[k] = (byFaceCount[k] ?? 0) + 1
  }

  return { total: rows.length, byFaceCount }
}

/** Derniers inscrits (admin) */
export async function listWaitlistEmails({ limit = 200, weekKey = null } = {}) {
  const supabase = getSupabase()
  let query = supabase
    .from('mini_nous_waitlist')
    .select('email, face_count, week_key, source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (weekKey) query = query.eq('week_key', weekKey)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}
