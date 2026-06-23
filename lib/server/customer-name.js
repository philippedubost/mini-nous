/** Extrait le prénom depuis le nom complet Stripe (ex. « Marie Dupont » → « Marie »). */
export function parseCustomerFirstName(fullName) {
  const trimmed = String(fullName ?? '').trim()
  if (!trimmed) return null
  const parts = trimmed.split(/\s+/).filter(Boolean)
  return parts[0] || null
}

/** Prénom stocké en metadata ou dérivé du nom complet. */
export function resolveCustomerFirstName({ customer_name, customerName, metadata } = {}) {
  const stored = metadata?.customer_first_name
  if (stored?.trim()) return stored.trim()
  return parseCustomerFirstName(customer_name ?? customerName)
}

/** Sujet d'e-mail personnalisé : « Dimitri, besoin de ta validation… » */
export function friendlyEmailSubject(firstName, body) {
  const fn = firstName?.trim()
  if (!fn) return body
  return `${fn}, ${body}`
}
