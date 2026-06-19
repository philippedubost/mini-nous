import dns from 'node:dns/promises'
import { loadEnv } from './load-env.mjs'

let reachabilityChecked = false
let supabaseReachable = true

export function isSupabaseReachable() {
  return supabaseReachable
}

/** Test DNS une fois au démarrage ; évite les fetch Supabase inutiles en local. */
export async function warnIfSupabaseUnreachable() {
  loadEnv()
  const raw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!raw) {
    supabaseReachable = false
    reachabilityChecked = true
    console.warn('  ⚠ Supabase : SUPABASE_URL / VITE_SUPABASE_URL absent — API DB indisponible')
    return
  }

  let host
  try {
    host = new URL(raw).hostname
  } catch {
    supabaseReachable = false
    reachabilityChecked = true
    console.warn('  ⚠ Supabase : SUPABASE_URL invalide —', raw)
    return
  }

  try {
    await dns.lookup(host)
    supabaseReachable = true
  } catch (err) {
    supabaseReachable = false
    console.warn('')
    console.warn(`  ⚠ Supabase injoignable (${host} — ${err.code || err.message})`)
    console.warn('    Corrigez SUPABASE_URL dans .env (Dashboard → Project Settings → API).')
    console.warn('    La landing utilisera des données hors-ligne ; /pipeline/ nécessite Supabase.')
    console.warn('')
  }

  reachabilityChecked = true
}

export async function ensureSupabaseReachabilityChecked() {
  if (!reachabilityChecked) await warnIfSupabaseUnreachable()
  return supabaseReachable
}
