/** Fusionne le board API avec des colonnes optimistes (lancement tracé). */
export function mergeBoardOptimistic(
  { columns, byColumn, columnTotals, allCards },
  overrides,
) {
  if (!overrides || !Object.keys(overrides).length) {
    return { byColumn, columnTotals, allCards }
  }

  const sourceCards = allCards?.length
    ? allCards
    : Object.values(byColumn ?? {}).flat()

  const cards = sourceCards.map(card => {
    const ov = overrides[card.orderId]
    if (!ov) return card
    return {
      ...card,
      column: ov.column,
      _processing: !!ov.processing,
      needsTick: ov.processing ? true : card.needsTick,
      needsQueue: ov.processing ? false : card.needsQueue,
    }
  })

  const nextByColumn = Object.fromEntries((columns ?? []).map(c => [c.key, []]))
  const nextTotals = Object.fromEntries(
    (columns ?? []).map(c => [c.key, { orders: 0, faces: 0, errors: 0, blocked24h: 0 }]),
  )

  for (const card of cards) {
    if (!nextByColumn[card.column]) continue
    nextByColumn[card.column].push(card)
    nextTotals[card.column].orders += 1
    nextTotals[card.column].faces += Number(card.faceCount) || 0
    if (card.hasAnyError) nextTotals[card.column].errors += 1
    if (card.isBlocked24h) nextTotals[card.column].blocked24h += 1
  }

  return { byColumn: nextByColumn, columnTotals: nextTotals, allCards: cards }
}

export function optimisticFromMotorResult(result) {
  if (!result || result.error || result.phase === 'error') return null
  if (result.phase === 'done' || result.lineartVersion) {
    return { column: 'trace_v1', processing: false }
  }
  if (result.phase === 'step2') {
    return { column: 'step1_done_step2', processing: true }
  }
  return { column: 'order_step1', processing: true }
}
