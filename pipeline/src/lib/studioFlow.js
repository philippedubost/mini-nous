/** Étapes du parcours studio client (post-paiement). */

export const STUDIO_FLOW_STEPS = [
  { key: 1, label: 'Création', hint: 'Transformation de votre photo en tracé atelier' },
  { key: 2, label: 'Validation', hint: 'Validez ou ajustez le tracé proposé' },
  { key: 3, label: 'Version finale', hint: 'Choisissez votre version préférée' },
]

export function studioFlowStep({ order, lineartUrl, busy, phase }) {
  if (!order?.isPaid) return 0

  const ws = order.workflowStatus
  const version = order.lineartVersion ?? 1

  if (['approved', 'in_production', 'shipped'].includes(ws)) return 3
  if (ws === 'revision_requested') return 2
  if (ws === 'pending_validation' && lineartUrl) {
    if (order.studio?.showVersionPicker && version >= 3) return 3
    return 2
  }
  if (busy || ws === 'in_studio' || phase === 'upload' || !lineartUrl) return 1
  if (lineartUrl && phase === 'review') return 2
  return 1
}

export function canShowStudioReview({ order, lineartUrl }) {
  if (!order?.isPaid || !lineartUrl || order.isAdminView) return false
  return order.workflowStatus === 'pending_validation'
}

export function resolveStudioCaps(order) {
  const lineartVersion = order?.lineartVersion ?? 1
  const ws = order?.workflowStatus
  const studio = order?.studio ?? {}
  return {
    ...studio,
    canAutoAdjust: studio.canAutoAdjust
      ?? (lineartVersion === 1 && ws === 'pending_validation' && !studio.revisionPending),
    canManualAdjust: studio.canManualAdjust
      ?? (lineartVersion === 2 && ws === 'pending_validation'),
    showVersionPicker: studio.showVersionPicker
      ?? (lineartVersion >= 3 && ws === 'pending_validation'),
  }
}
