import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { uploadPipelineAssetToR2 } from './r2.js'
import { getSupabase } from './supabase.js'
import { getOrCreateCurrentWeek } from './weeks.js'
import { generationIdsFromPlacements, markGenerationsFabricated } from './fabrication.js'
import { appendFlatPath, flattenLayerToPaths, getBatchStrokeScale } from './batchPaths.js'

const ROW_MAX_MM = Number(process.env.BATCH_ROW_MAX_MM) || 1000
const FIGURE_HEIGHT_MM = Number(process.env.BATCH_FIGURE_HEIGHT_MM) || 180
const FIGURE_GAP_MM = Number(process.env.BATCH_FIGURE_GAP_MM) || 20
const ROW_GAP_MM = Number(process.env.BATCH_ROW_GAP_MM) || FIGURE_GAP_MM / 3
function parseViewBox(svg) {
  const m = svg.match(/viewBox=["']([^"']+)["']/)
  if (m) {
    const [, , w, h] = m[1].trim().split(/\s+/).map(Number)
    return { width: w, height: h }
  }
  const wm = svg.match(/\bwidth=["']([\d.]+)/)
  const hm = svg.match(/\bheight=["']([\d.]+)/)
  return { width: Number(wm?.[1] || 500), height: Number(hm?.[1] || 500) }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape'

function parseSvgDoc(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName === 'parsererror') return null
  return doc
}

function findLayerGroup(doc, groupId) {
  if (!doc) return null
  return doc.getElementById(groupId)
    ?? [...doc.getElementsByTagName('g')].find(el => el.getAttribute('id') === groupId)
    ?? null
}

function isBatchPlancheSvg(svg) {
  return /Mini-Nous batch/i.test(svg) || /\bid=["']order-\d+-decoupe["']/i.test(svg)
}

function assertWellFormedBatchSvg(svg) {
  let depth = 0
  for (const m of svg.matchAll(/<\/?g\b[^>]*>/gi)) {
    if (m[0].startsWith('</')) depth--
    else if (!/\/\s*>$/.test(m[0])) depth++
    if (depth < 0) throw new Error('Planche batch : balises <g> déséquilibrées.')
  }
  if (depth !== 0) {
    throw new Error(`Planche batch : ${depth} balise(s) <g> non fermée(s).`)
  }

  try {
    const doc = parseSvgDoc(svg)
    if (!doc) throw new Error('Planche batch : XML invalide après assemblage.')
  } catch (e) {
    if (e.message?.startsWith('Planche batch')) throw e
    throw new Error(`Planche batch : ${e.message || 'XML invalide'}`)
  }
}
export function batchLabelFor(order) {
  const packLabel = order.metadata?.pack_label
  if (packLabel) {
    return String(packLabel).replace(/^Admin\s*·\s*/i, '').trim() || String(packLabel)
  }
  const name = order.customer_name?.trim()
  if (name && !/^Admin\s*·/i.test(name)) return name
  if (order.email) return order.email.split('@')[0]
  if (order.face_count != null) return `${order.face_count} persos`
  return String(order.generation_id ?? order.id ?? 'cmd').slice(0, 8)
}

/** Place les générations en ligne ; retour à la ligne si largeur > 100 cm ; hauteur cible 18 cm. */
export function layoutOrdersOnSheet(orders, {
  rowMaxMm = ROW_MAX_MM,
  figureHeightMm = FIGURE_HEIGHT_MM,
  figureGap = FIGURE_GAP_MM,
  rowGap = ROW_GAP_MM,
} = {}) {
  const placements = []
  let x = 0
  let y = 0
  let rowH = 0

  for (const order of orders) {
    if (!order.laserSvg) continue
    const { width, height } = parseViewBox(order.laserSvg)
    if (!width || !height) continue

    const scale = figureHeightMm / height
    const dw = width * scale
    const dh = figureHeightMm

    if (placements.length > 0 && x + dw > rowMaxMm) {
      x = 0
      y += rowH + rowGap
      rowH = 0
    }

    placements.push({
      order,
      transform: `translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${scale.toFixed(6)})`,
      width: dw,
      height: dh,
      x,
      y,
    })

    x += dw + figureGap
    rowH = Math.max(rowH, dh)
  }

  const contentW = placements.length
    ? Math.max(...placements.map(p => p.x + p.width))
    : 0
  const contentH = placements.length ? y + rowH : 0
  const sheetWidthMm = Math.max(rowMaxMm, contentW)
  const sheetHeightMm = Math.max(figureHeightMm, contentH)

  return {
    sheetWidthMm,
    sheetHeightMm,
    placements,
    /** @deprecated utiliser sheetHeightMm */
    sheetMm: sheetHeightMm,
  }
}

export function buildBatchSvg({ sheetWidthMm, sheetHeightMm, sheetMm, placements, weekKey, kerfMm, strokeScale }) {
  const batchStrokeScale = strokeScale ?? getBatchStrokeScale()
  const w = sheetWidthMm ?? ROW_MAX_MM
  const h = sheetHeightMm ?? sheetMm ?? w
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}" xmlns:inkscape="${INKSCAPE_NS}" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm"></svg>`,
    'image/svg+xml',
  )
  const root = doc.documentElement
  root.setAttribute('data-week', weekKey)
  root.setAttribute('data-kerf-mm', String(kerfMm))

  const title = doc.createElementNS(SVG_NS, 'title')
  title.appendChild(doc.createTextNode(`Mini-Nous batch ${weekKey}`))
  root.appendChild(title)

  for (const layerId of ['gravure', 'découpe']) {
    const layerG = doc.createElementNS(SVG_NS, 'g')
    layerG.setAttribute('id', layerId)
    layerG.setAttributeNS(INKSCAPE_NS, 'inkscape:label', layerId)
    layerG.setAttributeNS(INKSCAPE_NS, 'inkscape:groupmode', 'layer')

    for (const p of placements) {
      const laserSvg = p.order.laserSvg
      if (!laserSvg) continue
      if (isBatchPlancheSvg(laserSvg)) {
        throw new Error(`Génération ${p.order.generation_id ?? p.order.id} : SVG laser invalide (fichier planche batch). Regénérez le SVG laser.`)
      }

      const sourceDoc = parseSvgDoc(laserSvg)
      const layer = findLayerGroup(sourceDoc, layerId)
      const orderId = p.order.generation_id ?? p.order.id
      const paths = flattenLayerToPaths(layer, {
        placementMatrix: p.transform,
        layerId,
        orderId,
        simplifyGravure: layerId === 'gravure',
        strokeScale: batchStrokeScale,
      })

      for (const item of paths) {
        appendFlatPath(doc, layerG, item, layerId)
      }
    }

    root.appendChild(layerG)
  }

  const svg = new XMLSerializer().serializeToString(doc)
  assertWellFormedBatchSvg(svg)
  return svg
}

export async function loadOrderSvgs(orders, { allowPlaceholder = false } = {}) {
  const out = []
  for (const order of orders) {
    if (order.laserUrl) {
      const res = await fetch(order.laserUrl)
      if (!res.ok) throw new Error(`Fetch SVG ${order.id}: ${res.status}`)
      out.push({ ...order, laserSvg: await res.text(), isPlaceholder: false })
    } else if (allowPlaceholder) {
      out.push({
        ...order,
        laserSvg: placeholderLaserSvg(order),
        isPlaceholder: true,
      })
    }
  }
  return out
}

function placeholderLaserSvg(item) {
  const w = 200
  const h = 280
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">
  <g id="découpe">
    <path d="M 12 20 L ${w - 12} 20 L ${w - 12} ${h - 12} L 12 ${h - 12} Z" fill="none" stroke="#dc2626" stroke-width="2"/>
  </g>
  <g id="gravure"></g>
</svg>`
}

export async function fetchWeekOrders(weekKey) {
  const supabase = getSupabase()
  let week
  if (weekKey) {
    const { data, error } = await supabase
      .from('mini_nous_production_weeks')
      .select('*')
      .eq('week_key', weekKey)
      .single()
    if (error) throw new Error(error.message)
    week = data
  } else {
    week = await getOrCreateCurrentWeek(supabase)
  }

  const { data: orders, error: oErr } = await supabase
    .from('mini_nous_orders')
    .select(`
      id, customer_name, email, face_count, pack_type, generation_id, paid_at, status, metadata,
      generation:mini_nous_generations!generation_id(
        id, status, fabricated_at, fabricated_week_id, fabricated_batch_key
      )
    `)
    .eq('week_id', week.id)
    .eq('status', 'paid')
    .order('paid_at')
  if (oErr) throw new Error(oErr.message)

  const enriched = []
  for (const order of orders ?? []) {
    let laserUrl = null
    if (order.generation_id) {
      const { data: step } = await supabase
        .from('mini_nous_generation_steps')
        .select('image_url')
        .eq('generation_id', order.generation_id)
        .eq('asset_type', 'laser_merged')
        .maybeSingle()
      laserUrl = step?.image_url ?? null
    }
    enriched.push({ ...order, laserUrl, hasLaserSvg: !!laserUrl })
  }

  const totalFaces = enriched.reduce((s, o) => s + o.face_count, 0)
  return { week, orders: enriched, totalFaces }
}

export async function fetchGenerationsForBatch(supabase, generationIds) {
  if (!generationIds?.length) throw new Error('Aucune génération sélectionnée')
  const unique = [...new Set(generationIds)]
  const items = []

  for (const genId of unique) {
    const { data: gen, error } = await supabase
      .from('mini_nous_generations')
      .select('id, created_at, face_count')
      .eq('id', genId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!gen) continue

    const { data: step } = await supabase
      .from('mini_nous_generation_steps')
      .select('image_url')
      .eq('generation_id', genId)
      .eq('asset_type', 'laser_merged')
      .maybeSingle()

    const laserUrl = step?.image_url ?? null
    items.push({
      id: genId,
      generation_id: genId,
      customer_name: gen.face_count != null ? `${gen.face_count} persos` : genId.slice(0, 8),
      laserUrl,
      hasLaserSvg: !!laserUrl,
      face_count: gen.face_count,
    })
  }

  return items
}

export async function uploadSelectionBatchSvg({ batchKey, svg, env = process.env }) {
  const base64 = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  const slug = batchKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)
  const version = Date.now()
  const { url, key } = await uploadPipelineAssetToR2(
    {
      generationId: `batchsel-${slug}`,
      assetType: 'batch_planche',
      base64,
      version,
      cacheControl: 'public, max-age=300',
    },
    env,
  )
  return { url, key, builtAt: new Date(version).toISOString() }
}

export async function buildGenerationsBatch({
  generationIds, weekKey, dryRun = false, kerfMm = -0.1,
} = {}) {
  const supabase = getSupabase()
  const items = await fetchGenerationsForBatch(supabase, generationIds)
  const withSvg = await loadOrderSvgs(items, { allowPlaceholder: true })

  if (!withSvg.length) {
    throw new Error('Aucune génération valide dans la sélection.')
  }

  let week = null
  if (weekKey) {
    const { data, error } = await supabase
      .from('mini_nous_production_weeks')
      .select('*')
      .eq('week_key', weekKey)
      .single()
    if (error) throw new Error(error.message)
    week = data
  }

  const labelKey = week?.week_key ?? `selection-${new Date().toISOString().slice(0, 10)}`
  const { sheetWidthMm, sheetHeightMm, placements } = layoutOrdersOnSheet(withSvg, {})
  const svg = buildBatchSvg({ sheetWidthMm, sheetHeightMm, placements, weekKey: labelKey, kerfMm })

  const result = {
    weekKey: labelKey,
    weekId: week?.id ?? null,
    generationCount: generationIds.length,
    placementCount: placements.length,
    skippedCount: items.filter(i => !i.hasLaserSvg).length,
    svg,
  }

  if (dryRun) return { ...result, uploaded: false }

  if (week) {
    const { url, key, builtAt } = await uploadBatchSvg({ weekId: week.id, weekKey: week.week_key, svg })
    await markGenerationsFabricated(supabase, {
      generationIds: generationIdsFromPlacements(placements),
      weekId: week.id,
      batchR2Key: key,
    })
    return { ...result, uploaded: true, batchSvgUrl: url, batchR2Key: key, builtAt }
  }

  const { url, key, builtAt } = await uploadSelectionBatchSvg({ batchKey: labelKey, svg })
  await markGenerationsFabricated(supabase, {
    generationIds: generationIdsFromPlacements(placements),
    weekId: week?.id ?? null,
    batchR2Key: key,
  })
  return { ...result, uploaded: true, batchSvgUrl: url, batchR2Key: key, builtAt }
}

export async function uploadBatchSvg({ weekId, weekKey, svg, env = process.env }) {
  const supabase = getSupabase()
  const base64 = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  const version = Date.now()

  const { url, key } = await uploadPipelineAssetToR2(
    {
      generationId: `week-${weekKey.replace(/-/g, '')}`,
      assetType: 'batch_planche',
      base64,
      version,
      cacheControl: 'public, max-age=300',
    },
    env,
  )

  const builtAt = new Date(version).toISOString()

  await supabase
    .from('mini_nous_production_weeks')
    .update({
      batch_svg_url: url,
      batch_r2_key: key,
      status: 'in_production',
      updated_at: new Date().toISOString(),
    })
    .eq('id', weekId)

  return { url, key, builtAt }
}

export async function buildWeekBatch({ weekKey, dryRun = false, kerfMm = -0.1 } = {}) {
  const { week, orders, totalFaces } = await fetchWeekOrders(weekKey)
  const withSvg = await loadOrderSvgs(orders, { allowPlaceholder: true })

  if (!withSvg.length) {
    throw new Error('Aucune commande dans cette édition.')
  }

  const { sheetWidthMm, sheetHeightMm, placements } = layoutOrdersOnSheet(withSvg, {})
  const svg = buildBatchSvg({ sheetWidthMm, sheetHeightMm, placements, weekKey: week.week_key, kerfMm })

  const result = {
    weekKey: week.week_key,
    weekId: week.id,
    orderCount: orders.length,
    totalFaces,
    placementCount: placements.length,
    skippedOrders: orders.filter(o => !o.hasLaserSvg).length,
    capacity: week.capacity ?? 100,
    svg,
  }

  if (dryRun) return { ...result, uploaded: false }

  const { url, key, builtAt } = await uploadBatchSvg({ weekId: week.id, weekKey: week.week_key, svg })
  await markGenerationsFabricated(getSupabase(), {
    generationIds: generationIdsFromPlacements(placements),
    weekId: week.id,
    batchR2Key: key,
  })
  return { ...result, uploaded: true, batchSvgUrl: url, batchR2Key: key, builtAt }
}

export async function listProductionWeeks(supabase, { limit = 24 } = {}) {
  await getOrCreateCurrentWeek(supabase)
  const { data, error } = await supabase
    .from('mini_nous_production_weeks')
    .select('*')
    .order('ship_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}
