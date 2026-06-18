import { formatFabricationMardiLabel } from './weeks.js'

export async function markGenerationsFabricated(supabase, { generationIds, weekId, batchR2Key }) {
  const ids = [...new Set(generationIds)].filter(Boolean)
  if (!ids.length) return { updated: 0 }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('mini_nous_generations')
    .update({
      fabricated_week_id: weekId ?? null,
      fabricated_at: now,
      fabricated_batch_key: batchR2Key ?? null,
      updated_at: now,
    })
    .in('id', ids)

  if (error) throw new Error(error.message)
  return { updated: ids.length }
}

export async function loadWeeksById(supabase, weekIds) {
  const ids = [...new Set(weekIds)].filter(Boolean)
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from('mini_nous_production_weeks')
    .select('id, week_key, cutoff_at, ship_date')
    .in('id', ids)
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map(w => [w.id, w]))
}

export function buildFabricationPayload(gen, weekById = {}) {
  if (!gen?.fabricated_at) return null
  const week = gen.fabricated_week_id ? weekById[gen.fabricated_week_id] : null
  const mardiLabel = week ? formatFabricationMardiLabel(week) : null
  return {
    at: gen.fabricated_at,
    weekId: gen.fabricated_week_id ?? null,
    weekKey: week?.week_key ?? null,
    mardiLabel,
    label: mardiLabel
      ? `Fabriquée · ${mardiLabel}`
      : `Fabriquée le ${new Date(gen.fabricated_at).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })}`,
    batchKey: gen.fabricated_batch_key ?? null,
  }
}

export async function enrichGenerationsWithFabrication(supabase, generations) {
  const weekById = await loadWeeksById(
    supabase,
    generations.map(g => g.fabricated_week_id).filter(Boolean),
  )
  return generations.map(g => ({
    ...g,
    fabrication: buildFabricationPayload(g, weekById),
  }))
}

export function generationIdsFromPlacements(placements) {
  return placements
    .map(p => p.order.generation_id)
    .filter(Boolean)
}
