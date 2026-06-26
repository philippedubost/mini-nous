/** Actions menu contextuel selon la colonne Kanban /server. */
export const CONTEXT_ACTIONS_BY_COLUMN = {
  photo_payment: [{ id: 'launch_trace_v1', label: 'Lancer Tracé v1' }],
  order_step1: [{ id: 'launch_trace_v1', label: 'Relancer Tracé v1' }],
  step1_done_step2: [{ id: 'launch_trace_v1', label: 'Relancer génération' }],
  trace_v1: [{ id: 'validate_trace', label: 'Valider ce tracé' }],
  trace_v2: [{ id: 'validate_trace', label: 'Valider ce tracé' }],
  trace_v3: [{ id: 'validate_trace', label: 'Valider ce tracé' }],
  validated_fabrication: [{ id: 'fabrication_done', label: 'Fabrication finie' }],
  fabricated: [{ id: 'mark_shipped', label: 'Enveloppe Expédiée' }],
  shipped: [{ id: 'mark_received', label: 'Enveloppe Reçue' }],
}

export const DELETE_ACTION = { id: 'delete', label: 'Supprimer', danger: true }

export const OPEN_ADMIN_ACTION = { id: 'open_admin', label: 'Voir page commande admin' }
export const OPEN_CLIENT_ACTION = { id: 'open_client', label: 'Voir page commande client' }

export function clientOrderUrl(order) {
  if (!order?.accessToken) return null
  return `/pipeline/commande?order=${encodeURIComponent(order.accessToken)}`
}

export function contextActionsForColumn(column, order = null) {
  const specific = CONTEXT_ACTIONS_BY_COLUMN[column] ?? []
  const nav = []
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
