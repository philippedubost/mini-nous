#!/usr/bin/env node
/**
 * Mega SVG Batch Maker — planche laser 100×100 cm
 * Usage: npm run batch -- [--week 2026-06-20] [--kerf -0.1] [--dry-run]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildWeekBatch } from '../../lib/server/batch.js'
import { loadEnv, parseArgs } from './lib/env.mjs'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../../output')

async function main() {
  loadEnv()
  const args = parseArgs(process.argv)

  console.log('[batch] Chargement commandes…')
  const result = await buildWeekBatch({
    weekKey: args.week || undefined,
    dryRun: args.dryRun,
    kerfMm: args.kerf,
  })

  console.log(`[batch] Semaine ${result.weekKey} · ${result.orderCount} commande(s) · ${result.totalFaces} personnage(s)`)
  if (result.totalFaces > result.capacity) {
    console.warn(`[batch] ATTENTION : ${result.totalFaces} persos > capacité ${result.capacity}`)
  }
  if (result.skippedOrders) {
    console.warn(`[batch] ${result.skippedOrders} commande(s) sans laser_merged`)
  }

  mkdirSync(outDir, { recursive: true })
  const localPath = join(outDir, `batch-${result.weekKey}.svg`)
  writeFileSync(localPath, result.svg, 'utf8')
  console.log(`[batch] SVG local → ${localPath}`)
  console.log(`[batch] ${result.placementCount} planche(s) client`)

  if (args.dryRun) {
    console.log('[batch] --dry-run : pas d\'upload R2')
    return
  }

  if (result.batchSvgUrl) {
    console.log(`[batch] Upload R2 → ${result.batchSvgUrl}`)
  }
}

main().catch(err => {
  console.error('[batch]', err.message || err)
  process.exit(1)
})
