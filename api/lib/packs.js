/** Offres « Édition du Mardi » — prix en centimes EUR */
export const EXTRA_PERSON_CENTS = 450
export const MAX_FACES = 8

export const PACKS = {
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

export function packList() {
  return Object.values(PACKS)
}

/** Tarif dynamique : pack de base + personnages supplémentaires à 4,50 €. */
export function computeQuote(faceCount) {
  const n = Number(faceCount)
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, reason: 'invalid', faceCount: n }
  }
  if (n > MAX_FACES) {
    return { ok: false, reason: 'too_many', faceCount: n, maxFaces: MAX_FACES }
  }

  const sorted = packList().sort((a, b) => a.faceCount - b.faceCount)
  let basePack = sorted[0]
  for (const p of sorted) {
    if (p.faceCount <= n) basePack = p
  }

  const extraCount = Math.max(0, n - basePack.faceCount)
  const productCents = basePack.priceCents + extraCount * EXTRA_PERSON_CENTS
  const shippingCents = basePack.shippingCents
  const totalCents = productCents + shippingCents

  return {
    ok: true,
    faceCount: n,
    basePack,
    extraCount,
    extraPersonCents: EXTRA_PERSON_CENTS,
    extraPersonEur: (EXTRA_PERSON_CENTS / 100).toFixed(2),
    productCents,
    shippingCents,
    totalCents,
    totalEur: (totalCents / 100).toFixed(2),
    label: extraCount > 0 ? `${basePack.label} + ${extraCount} pers.` : basePack.label,
  }
}
