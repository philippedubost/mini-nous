import { getSupabase } from './supabase.js'

export function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization
  if (!h?.startsWith('Bearer ')) return null
  return h.slice(7).trim()
}

export async function getAuthUser(req) {
  const token = getBearerToken(req)
  if (!token) return null

  const supabase = getSupabase()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function requireAuthUser(req) {
  const user = await getAuthUser(req)
  if (!user) throw Object.assign(new Error('Connexion requise'), { status: 401 })
  return user
}
