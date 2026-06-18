const CAPACITY = Number(process.env.PRODUCTION_WEEK_CAPACITY) || 100

function parisDateParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  )
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  }
}

/** ISO date YYYY-MM-DD en fuseau Paris pour un instant UTC. */
function parisYmd(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

/** Prochain mardi 10h (Paris) + vendredi expédition. */
export function getProductionSchedule(now = new Date()) {
  for (let addDays = 0; addDays < 14; addDays++) {
    const probe = new Date(now.getTime() + addDays * 86400000)
    const p = parisDateParts(probe)
    const isTuesday = p.weekday === 'Tue'
    const beforeCutoff = addDays === 0 ? p.hour < 10 : true
    if (isTuesday && beforeCutoff) {
      const cutoffLocal = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}T10:00:00`
      const cutoffAt = new Date(
        new Date(cutoffLocal).toLocaleString('en-US', { timeZone: 'Europe/Paris' })
      )
      const shipProbe = new Date(probe.getTime() + 3 * 86400000)
      const shipDate = parisYmd(shipProbe)
      return { weekKey: shipDate, cutoffAt: probe, shipDate, capacity: CAPACITY }
    }
  }
  const fallback = new Date(now.getTime() + 7 * 86400000)
  const shipDate = parisYmd(fallback)
  return { weekKey: shipDate, cutoffAt: fallback, shipDate, capacity: CAPACITY }
}

/** Date du mardi de fabrication (YYYY-MM-DD Paris) à partir d'une semaine prod. */
export function getFabricationTuesdayYmd(week) {
  if (week.cutoff_at) {
    return new Date(week.cutoff_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  }
  const ship = new Date(`${week.ship_date || week.week_key}T12:00:00Z`)
  const tue = new Date(ship.getTime() - 3 * 86400000)
  return tue.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

/** Ex. « mardi 17 juin 2026 » */
export function formatFabricationMardiLabel(week) {
  const ymd = getFabricationTuesdayYmd(week)
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export async function getOrCreateCurrentWeek(supabase) {
  const schedule = getProductionSchedule()
  const { data: existing } = await supabase
    .from('mini_nous_production_weeks')
    .select('*')
    .eq('week_key', schedule.weekKey)
    .maybeSingle()

  if (existing) return existing

  const { data, error } = await supabase
    .from('mini_nous_production_weeks')
    .insert({
      week_key: schedule.weekKey,
      cutoff_at: schedule.cutoffAt.toISOString(),
      ship_date: schedule.shipDate,
      capacity: schedule.capacity,
      sold_count: 0,
      status: 'open',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** Plancher social proof (7–15) déterministe à partir de la clé semaine (date expédition). */
export function getSocialProofOrderFloor(weekKey) {
  let h = 2166136261
  for (let i = 0; i < weekKey.length; i++) {
    h ^= weekKey.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 7 + (Math.abs(h) % 9)
}

export async function getPaidOrderCount(supabase, weekId) {
  const { count, error } = await supabase
    .from('mini_nous_orders')
    .select('*', { count: 'exact', head: true })
    .eq('week_id', weekId)
    .eq('status', 'paid')
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function getSoldCharacterCount(supabase, weekId) {
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('face_count')
    .eq('week_id', weekId)
    .eq('status', 'paid')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((s, o) => s + o.face_count, 0)
}

export async function refreshWeekSoldCount(supabase, weekId) {
  const count = await getSoldCharacterCount(supabase, weekId)
  await supabase
    .from('mini_nous_production_weeks')
    .update({ sold_count: count, updated_at: new Date().toISOString() })
    .eq('id', weekId)
  return count
}

export async function assertCapacity(supabase, weekId, additionalFaces) {
  const { data: week, error } = await supabase
    .from('mini_nous_production_weeks')
    .select('*')
    .eq('id', weekId)
    .single()
  if (error) throw new Error(error.message)
  const sold = await getSoldCharacterCount(supabase, weekId)
  const capacity = week.capacity ?? CAPACITY
  if (sold + additionalFaces > capacity) {
    throw new Error(`Édition complète — ${Math.max(0, capacity - sold)} place(s) restante(s) sur ${capacity}.`)
  }
  return { sold, remaining: capacity - sold, capacity }
}
