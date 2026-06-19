/** Détecte les erreurs réseau Supabase (DNS, fetch, timeout). */
export function isSupabaseNetworkError(err) {
  let current = err
  for (let depth = 0; depth < 5 && current; depth++) {
    const msg = String(current.message || current || '').toLowerCase()
    const name = String(current.name || '').toLowerCase()
    const code = current.cause?.code || current.code || ''

    if (
      msg.includes('fetch failed')
      || msg.includes('enotfound')
      || msg.includes('econnrefused')
      || msg.includes('etimedout')
      || msg.includes('network')
      || msg.includes('getaddrinfo')
      || name === 'typeerror' && msg.includes('fetch')
      || code === 'ENOTFOUND'
      || code === 'ECONNREFUSED'
      || code === 'ETIMEDOUT'
    ) {
      return true
    }
    current = current.cause
  }
  return false
}

export function supabaseNetworkErrorMessage() {
  return 'Supabase injoignable — vérifiez SUPABASE_URL et VITE_SUPABASE_URL dans .env (Dashboard → Project Settings → API).'
}

export function rethrowSupabaseError(error, context = 'Supabase') {
  if (!error) return
  const err = new Error(error.message || `${context} error`)
  err.cause = error
  throw err
}
