import { createClient } from '@supabase/supabase-js'

export function getSupabase(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase non configuré (SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
  }

  return createClient(url, key, { auth: { persistSession: false } })
}

export const ASSET_META = {
  source:  { step_index: 0, label: 'Photo source' },
  ref:     { step_index: 0, label: 'Référence line art' },
  step1:   { step_index: 1, label: 'Mise en scène' },
  step2:   { step_index: 2, label: 'Line art' },
  outline: { step_index: 3, label: 'Contour' },
  gravure: { step_index: 3, label: 'Gravure' },
  overlay: { step_index: 3, label: 'Overlay' },
}
