#!/usr/bin/env node
/**
 * Applique la migration solo pack_type sur Supabase.
 * Usage: SUPABASE_DB_URL="postgresql://..." node scripts/apply-solo-pack-migration.mjs
 * Ou: npx supabase db push --linked
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './lib/load-env.mjs'

loadEnv()

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/20260620140000_solo_pack_type.sql'),
  'utf8',
)

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!dbUrl) {
  console.log(`
Migration solo non appliquée — pas de SUPABASE_DB_URL / DATABASE_URL.

Collez ce SQL dans Supabase → SQL Editor :

${sql}
`)
  process.exit(1)
}

let pg
try {
  pg = await import('pg')
} catch {
  console.error('Installez pg : npm install --save-dev pg')
  console.log('\nOu exécutez le SQL manuellement dans Supabase Dashboard.\n')
  process.exit(1)
}

const client = new pg.default.Client({ connectionString: dbUrl })
try {
  await client.connect()
  await client.query(sql)
  console.log('✓ Migration solo pack_type appliquée.')
} catch (e) {
  console.error('Erreur migration:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
