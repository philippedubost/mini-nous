const DEFAULT_ADMIN_EMAILS = ['pdubost@gmail.com']
const DEFAULT_ADMIN_PASSWORD = 'admininous'

export function normalizeEmail(email) {
  const raw = String(email || '').trim().toLowerCase()
  const angle = raw.match(/<([^>]+)>/)
  return (angle ? angle[1] : raw).trim()
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
}

export function isAdminPassword(value) {
  return value === getAdminPassword()
}

export function hasAdminHeader(req) {
  const h = req?.headers?.['x-mininous-admin'] || req?.headers?.['X-MiniNous-Admin']
  return isAdminPassword(h)
}

/** E-mails avec droits admin compte / studio. */
export function getAdminEmails() {
  const set = new Set(DEFAULT_ADMIN_EMAILS.map(normalizeEmail))
  if (process.env.ADMIN_EMAIL) set.add(normalizeEmail(process.env.ADMIN_EMAIL))
  return [...set]
}

export function isAdminEmail(email) {
  if (!email) return false
  return getAdminEmails().includes(normalizeEmail(email))
}

export function hasAdminAccess(req, authUser = null) {
  if (hasAdminHeader(req)) return true
  return isAdminEmail(authUser?.email)
}

/** Auth worker /server et /api/studio-generate (Bearer ou en-tête admin). */
export function isWorkerAuthorized(req) {
  if (hasAdminHeader(req)) return true
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) return false
  const token = auth.slice(7).trim()
  if (isAdminPassword(token)) return true
  const studioSecret = process.env.STUDIO_GENERATE_SECRET
  return !!(studioSecret && token === studioSecret)
}
