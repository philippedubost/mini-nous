/** Date de réception client (mardi = expédition + 4 j ; vendredi express = jour d'expédition). */

export function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatDeliveryDateFr(ymd) {
  if (!ymd) return null
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export function customerDeliveryYmd(shipDate, fridayDelivery) {
  if (!shipDate) return null
  if (fridayDelivery) return shipDate
  return addDaysYmd(shipDate, 4)
}

export function customerDeliveryLabel(shipDate, fridayDelivery) {
  return formatDeliveryDateFr(customerDeliveryYmd(shipDate, fridayDelivery))
}
