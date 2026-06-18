import { getSupabase } from '../../../api/lib/supabase.js'
import { buildWeekBatch, buildGenerationsBatch, fetchWeekOrders, listProductionWeeks } from '../../../api/lib/batch.js'
import { getProductionSchedule, getPaidOrderCount, getSoldCharacterCount, formatFabricationMardiLabel } from '../../../api/lib/weeks.js'
import {
  assignGenerationToWeek,
  listAvailableGenerationsForWeek,
  removeAdminOrderFromWeek,
} from '../../../api/lib/orders.js'
import { buildFabricationPayload, loadWeeksById } from '../../../api/lib/fabrication.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const supabase = getSupabase()
    const schedule = getProductionSchedule()

    if (req.method === 'GET') {
      const weekKey = req.query?.week
      const weeks = await listProductionWeeks(supabase)

      if (!weekKey) {
        return res.status(200).json({
          weeks: weeks.map(w => ({
            ...w,
            fabricationLabel: formatFabricationMardiLabel(w),
          })),
          currentWeekKey: schedule.weekKey,
        })
      }

      const { week, orders, totalFaces } = await fetchWeekOrders(weekKey)
      const orderCount = await getPaidOrderCount(supabase, week.id)
      const soldCount = await getSoldCharacterCount(supabase, week.id)
      const generationIds = orders.map(o => o.generation_id).filter(Boolean)
      const availableGenerations = await listAvailableGenerationsForWeek(supabase)
      const weekById = await loadWeeksById(
        supabase,
        orders.map(o => o.generation?.fabricated_week_id).filter(Boolean),
      )

      return res.status(200).json({
        week,
        orders: orders.map(o => ({
          id: o.id,
          customerName: o.customer_name,
          email: o.email,
          faceCount: o.face_count,
          packType: o.pack_type,
          generationId: o.generation_id,
          hasLaserSvg: o.hasLaserSvg,
          paidAt: o.paid_at,
          generationStatus: o.generation?.status ?? null,
          isAdmin: o.metadata?.source === 'admin',
          fabrication: o.generation
            ? buildFabricationPayload(o.generation, weekById)
            : null,
        })),
        availableGenerations,
        orderCount,
        soldCount,
        totalFaces,
        generationIds,
        capacity: week.capacity ?? 100,
        batchSvgUrl: week.batch_svg_url ?? null,
        batchR2Key: week.batch_r2_key ?? null,
        status: week.status,
      })
    }

    if (req.method === 'POST') {
      const { action = 'build-batch', weekKey, dryRun, kerf, generationId, orderId, customerName, generationIds } = req.body ?? {}
      if (!weekKey && action !== 'remove-order' && action !== 'build-batch-selection') {
        return res.status(400).json({ error: 'weekKey requis' })
      }

      if (action === 'assign-generation') {
        if (!generationId) return res.status(400).json({ error: 'generationId requis' })
        const result = await assignGenerationToWeek({ weekKey, generationId, customerName })
        return res.status(200).json(result)
      }

      if (action === 'remove-order') {
        if (!orderId) return res.status(400).json({ error: 'orderId requis' })
        const result = await removeAdminOrderFromWeek(orderId)
        return res.status(200).json(result)
      }

      if (action === 'build-batch-selection') {
        const { generationIds } = req.body ?? {}
        if (!Array.isArray(generationIds) || !generationIds.length) {
          return res.status(400).json({ error: 'generationIds requis (tableau non vide)' })
        }
        const result = await buildGenerationsBatch({
          generationIds,
          weekKey: weekKey || undefined,
          dryRun: !!dryRun,
          kerfMm: kerf != null ? Number(kerf) : -0.1,
        })
        return res.status(200).json({
          ok: true,
          uploaded: result.uploaded,
          batchSvgUrl: result.batchSvgUrl ?? null,
          builtAt: result.builtAt ?? null,
          placementCount: result.placementCount,
          generationCount: result.generationCount,
          skippedCount: result.skippedCount,
          svg: dryRun ? result.svg : undefined,
        })
      }

      if (action !== 'build-batch') {
        return res.status(400).json({ error: `Action inconnue : ${action}` })
      }

      const result = await buildWeekBatch({
        weekKey,
        dryRun: !!dryRun,
        kerfMm: kerf != null ? Number(kerf) : -0.1,
      })

      return res.status(200).json({
        ok: true,
        uploaded: result.uploaded,
        batchSvgUrl: result.batchSvgUrl ?? null,
        builtAt: result.builtAt ?? null,
        placementCount: result.placementCount,
        orderCount: result.orderCount,
        totalFaces: result.totalFaces,
        skippedOrders: result.skippedOrders,
        svg: dryRun ? result.svg : undefined,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[production-weeks]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
