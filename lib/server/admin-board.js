import { getSupabase } from './supabase.js'
import { listProductionWeeks } from './batch.js'
import { formatFabricationMardiLabel, getProductionSchedule } from './weeks.js'
import { listAllPaidOrders, buildOrderResponse } from './order-access.js'

export async function buildAdminBoard(req) {
  const supabase = getSupabase()
  const weeksRaw = await listProductionWeeks(supabase, { limit: 32 })
  const weeks = weeksRaw.map(w => ({
    weekKey: w.week_key,
    shipDate: w.ship_date,
    cutoffAt: w.cutoff_at,
    fabricationLabel: formatFabricationMardiLabel(w),
    soldCount: w.sold_count ?? 0,
    capacity: w.capacity ?? 100,
    status: w.status,
    batchSvgUrl: w.batch_svg_url ?? null,
  }))

  const rows = await listAllPaidOrders()
  const orders = []

  for (const row of rows) {
    const card = await buildOrderResponse(req, row, null)
    let hasLaserSvg = false
    if (row.generation_id) {
      const { data: step } = await supabase
        .from('mini_nous_generation_steps')
        .select('image_url')
        .eq('generation_id', row.generation_id)
        .eq('asset_type', 'laser_merged')
        .maybeSingle()
      hasLaserSvg = !!step?.image_url
    }
    orders.push({
      ...card,
      weekKey: row.week?.week_key ?? null,
      weekId: row.week_id ?? null,
      hasLaserSvg,
      accessToken: row.access_token,
      isTestOrder: row.metadata?.source === 'admin' || row.metadata?.source === 'admin_account',
    })
  }

  const schedule = getProductionSchedule()
  return {
    weeks,
    orders,
    currentWeekKey: schedule.weekKey,
  }
}
