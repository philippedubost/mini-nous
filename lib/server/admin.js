const DEFAULT_ADMIN_EMAILS = ['pdubost@gmail.com']

function normalizeEmail(email) {
  const raw = String(email || '').trim().toLowerCase()
  const angle = raw.match(/<([^>]+)>/)
  return (angle ? angle[1] : raw).trim()
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
