/** Frais de port — France métropolitaine + options. */
export const BASE_PORT_CENTS = 700
export const FREE_PORT_MIN_FACES = 4
export const INTERNATIONAL_SURCHARGE_CENTS = 1200

export const SHIPPING_ZONES = {
  FR: 'fr',
  INTERNATIONAL: 'international',
}

export function normalizeShippingZone(zone) {
  const z = String(zone || 'fr').toLowerCase()
  return z === SHIPPING_ZONES.INTERNATIONAL ? SHIPPING_ZONES.INTERNATIONAL : SHIPPING_ZONES.FR
}

export function computePortCents(faceCount, shippingZone = SHIPPING_ZONES.FR) {
  const n = Number(faceCount) || 1
  let port = n >= FREE_PORT_MIN_FACES ? 0 : BASE_PORT_CENTS
  if (normalizeShippingZone(shippingZone) === SHIPPING_ZONES.INTERNATIONAL) {
    port += INTERNATIONAL_SURCHARGE_CENTS
  }
  return port
}

export function formatShippingAddress(addr) {
  if (!addr || typeof addr !== 'object') return null
  const line1 = addr.line1?.trim()
  const city = addr.city?.trim()
  const postalCode = addr.postalCode?.trim()
  if (!line1 || !city || !postalCode) return null
  return {
    name: addr.name?.trim() || null,
    line1,
    line2: addr.line2?.trim() || null,
    city,
    postalCode,
    country: (addr.country || 'FR').toUpperCase(),
    phone: addr.phone?.trim() || null,
  }
}

export function shippingAddressFromStripeDetails(details) {
  if (!details?.address) return null
  return formatShippingAddress({
    name: details.name,
    line1: details.address.line1,
    line2: details.address.line2,
    city: details.address.city,
    postalCode: details.address.postal_code,
    country: details.address.country,
    phone: details.phone,
  })
}
