/** Actions menu contextuel selon la colonne Kanban /server. */
export const CONTEXT_ACTIONS_BY_COLUMN = {
  photo_payment: [{ id: 'launch_trace_v1', label: 'Lancer Tracé v1' }],
  order_step1: [{ id: 'launch_trace_v1', label: 'Relancer Tracé v1' }],
  step1_done_step2: [{ id: 'launch_trace_v1', label: 'Relancer génération' }],
  trace_v1: [{ id: 'validate_trace', label: 'Valider ce tracé' }],
  trace_v2: [{ id: 'validate_trace', label: 'Valider ce tracé' }],
  trace_v3: [{ id: 'validate_trace', label: 'Valider ce tracé' }],
  validated_fabrication: [
    { id: 'launch_laser', label: 'Générer SVG laser' },
    { id: 'fabrication_done', label: 'Fabrication finie' },
  ],
  fabricated: [{ id: 'mark_shipped', label: 'Enveloppe Expédiée' }],
  shipped: [{ id: 'mark_received', label: 'Enveloppe Reçue' }],
}

export const DELETE_ACTION = { id: 'delete', label: 'Supprimer', danger: true }

export const CLEAR_ERRORS_ACTION = { id: 'clear_errors', label: 'Effacer les erreurs' }

export const OPEN_ADMIN_ACTION = { id: 'open_admin', label: 'Voir page commande admin' }
export const OPEN_CLIENT_ACTION = { id: 'open_client', label: 'Voir page commande client' }

export function clientOrderUrl(order) {
  if (!order?.accessToken) return null
  return `/pipeline/commande?order=${encodeURIComponent(order.accessToken)}`
}

export function orderHasClearableErrors(order) {
  if (!order) return false
  return !!(
    order.hasAnyError
    || order.hasFalError
    || order.hasLaserError
    || order.hasGenerationError
    || order.studioJob?.phase === 'error'
    || order.studioLaser?.phase === 'error'
    || order.generationError
    || (order.errorLog?.length ?? 0) > 0
  )
}

/** Référence lisible pour le journal moteur : email tronqué · id court. */
export function orderLogRef(orderId, cards = []) {
  const shortId = orderId?.slice(0, 8) ?? '????'
  const card = cards.find(c => c.orderId === orderId)
  if (!card?.email) return `${shortId}…`
  return `${truncateDisplayName(card.email, 22)} · ${shortId}…`
}

export const ERROR_KIND_LABELS = {
  fal: 'Erreur FAL',
  laser: 'Erreur laser',
  generation: 'Erreur génération',
  studio: 'Erreur',
}

export function errorKindLabel(kind) {
  return ERROR_KIND_LABELS[kind] ?? 'Erreur'
}

export function formatColumnErrorSummary(orders = []) {
  let fal = 0
  let laser = 0
  let gen = 0
  for (const o of orders) {
    if (!o.hasAnyError && !o.hasFalError && !o.hasLaserError && !o.hasGenerationError) continue
    const kind = o.errorKind
      ?? (o.hasLaserError ? 'laser' : o.hasFalError ? 'fal' : o.hasGenerationError ? 'generation' : 'studio')
    if (kind === 'fal') fal += 1
    else if (kind === 'laser') laser += 1
    else gen += 1
  }
  const total = fal + laser + gen
  if (!total) return null
  const parts = []
  if (fal) parts.push(`${fal} FAL`)
  if (laser) parts.push(`${laser} laser`)
  if (gen) parts.push(`${gen} autre`)
  return parts.length === 1 && total === 1
    ? parts[0]
    : `${total} err. · ${parts.join(' · ')}`
}

export function contextActionsForColumn(column, order = null) {
  const specific = [...(CONTEXT_ACTIONS_BY_COLUMN[column] ?? [])]
  const nav = []
  if (order && orderHasClearableErrors(order)) {
    specific.push(CLEAR_ERRORS_ACTION)
  }
  if (order && adminOrderDetailUrl(order)) nav.push(OPEN_ADMIN_ACTION)
  if (order && clientOrderUrl(order)) nav.push(OPEN_CLIENT_ACTION)
  return [...specific, ...nav, DELETE_ACTION]
}

export function truncateDisplayName(name, max = 16) {
  const s = String(name ?? '').trim()
  if (!s) return '—'
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function faceLabel(n) {
  const count = Number(n) || 0
  return `${count} personne${count > 1 ? 's' : ''}`
}

export function adminOrderDetailUrl(order) {
  if (order?.generationId) return `/admin/g/${order.generationId}`
  return null
}

export function formatErrorLogAt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}
