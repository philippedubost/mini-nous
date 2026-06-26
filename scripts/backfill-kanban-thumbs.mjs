#!/usr/bin/env node
/**
 * Génère les vignettes Kanban (kanban_thumb_url) pour toutes les commandes existantes.
 * Usage: npm run thumbs:kanban
 */
import { loadEnv } from './lib/load-env.mjs'
import { getSupabase } from '../lib/server/supabase.js'
import { backfillOrderKanbanThumb } from '../lib/server/kanban-thumb.js'

loadEnv()

const env = process.env
const supabase = getSupabase(env)

const PAGE = 200
let offset = 0
let ok = 0
let skipped = 0
let failed = 0

console.log('Génération vignettes Kanban…')

while (true) {
  const { data, error } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, generation_id, status')
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE - 1)

  if (error) throw new Error(error.message)
  if (!data?.length) break

  for (const order of data) {
    try {
      const result = await backfillOrderKanbanThumb(env, supabase, order)
      if (result.ok) {
        ok += 1
        console.log('✓', order.id.slice(0, 8), result.url?.slice(-40))
      } else if (result.skipped) {
        skipped += 1
      } else {
        failed += 1
        console.warn('✗', order.id.slice(0, 8), result.error || result.reason)
      }
    } catch (err) {
      failed += 1
      console.warn('✗', order.id.slice(0, 8), err.message)
    }
  }

  offset += data.length
  if (data.length < PAGE) break
}

console.log(`Terminé — ${ok} créées, ${skipped} ignorées, ${failed} échecs`)
