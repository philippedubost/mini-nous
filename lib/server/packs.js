/** Offres « Édition du Mardi » — prix en centimes EUR */
export const EXTRA_PERSON_CENTS = 450
export const EXTRA_PERSON_CENTS_TRIO = 200
export const FRIDAY_DELIVERY_CENTS = 400
export const MAX_FACES = 8

function extraPersonCents(faceCount, extraCount) {
  if (Number(faceCount) === 3 && extraCount > 0) return EXTRA_PERSON_CENTS_TRIO
  return EXTRA_PERSON_CENTS
}

export const PACKS = {
  solo: {
    id: 'solo',
    label: 'Mode Solo',
    faceCount: 1,
    priceCents: 1390,
    shippingCents: 700,
    description: '1 personnage',
  },
  duo: {
    id: 'duo',
    label: 'Pack Duo',
    faceCount: 2,
    priceCents: 1990,
    shippingCents: 700,
    description: '2 personnages',
  },
  famille: {
    id: 'famille',
    label: 'Pack Famille',
    faceCount: 4,
    priceCents: 2990,
    shippingCents: 0,
    description: '4 personnages · 🎁 port offert',
  },
  grande_famille: {
    id: 'grande_famille',
    label: 'Pack Grande Famille',
    faceCount: 8,
    priceCents: 4490,
    shippingCents: 0,
    description: '8 personnages · 🎁 port offert',
  },
}

export function getPack(packType) {
  const pack = PACKS[packType]
  if (!pack) throw new Error(`Pack inconnu : ${packType}`)
  return pack
}

/** pack_type en base — 'solo' nécessite migration 20260620140000 ; repli temporaire sur duo. */
export function packTypeForDatabase(packId) {
  return packId === 'solo' ? 'duo' : packId
}

export function packList({ catalog = true } = {}) {
  const all = Object.values(PACKS).sort((a, b) => a.faceCount - b.faceCount)
  if (catalog) return all.filter(p => p.id !== 'solo')
  return all
}

/** Tarif dynamique : pack de base + personnages supplémentaires (2 € pour la 3e pers., sinon 4,50 €). */
export function computeQuote(faceCount) {
  const n = Number(faceCount)
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, reason: 'invalid', faceCount: n }
  }
  if (n > MAX_FACES) {
    return { ok: false, reason: 'too_many', faceCount: n, maxFaces: MAX_FACES }
  }

  const sorted = packList({ catalog: false }).sort((a, b) => a.faceCount - b.faceCount)
  let basePack = sorted[0]
  for (const p of sorted) {
    if (p.faceCount <= n) basePack = p
  }

  const extraCount = Math.max(0, n - basePack.faceCount)
  const unitCents = extraPersonCents(n, extraCount)
  const productCents = basePack.priceCents + extraCount * unitCents
  const shippingCents = basePack.shippingCents
  const totalCents = productCents + shippingCents

  return {
    ok: true,
    faceCount: n,
    basePack,
    extraCount,
    extraPersonCents: unitCents,
    extraPersonEur: (unitCents / 100).toFixed(2),
    productCents,
    shippingCents,
    totalCents,
    totalEur: (totalCents / 100).toFixed(2),
    label: extraCount > 0 ? `${basePack.label} + ${extraCount} pers.` : basePack.label,
  }
}

export function orderTotalCents(quote, { fridayDelivery = false } = {}) {
  const express = fridayDelivery ? FRIDAY_DELIVERY_CENTS : 0
  return quote.totalCents + express
}
