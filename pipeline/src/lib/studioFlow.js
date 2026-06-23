/** Étapes du parcours studio client (post-paiement). */

export const STUDIO_FLOW_STEPS = [
  { key: 1, label: 'Création', hint: 'Transformation de votre photo en tracé atelier' },
  { key: 2, label: 'Validation tracé', hint: 'Validez ou ajustez le tracé proposé' },
  { key: 3, label: 'Fabrication', hint: 'Vos figurines entrent en file d\'impression' },
  { key: 4, label: 'Expédition', hint: 'Réception de votre colis' },
  { key: 5, label: 'Surprise', emoji: '🎁', hint: 'Remises exclusives en échange d\'un avis Trustpilot ou d\'un partage' },
]

export function studioFlowStep({ order, lineartUrl, busy, phase }) {
  if (!order?.isPaid) return 0

  const ws = order.workflowStatus

  if (ws === 'shipped') return 5
  if (ws === 'in_production' || ws === 'approved') return 3
  if (ws === 'revision_requested') return 2
  if (ws === 'pending_validation' && lineartUrl) return 2
  if (busy || ws === 'in_studio' || phase === 'upload' || !lineartUrl) return 1
  if (lineartUrl && phase === 'review') return 2
  return 1
}

export function isStudioSurpriseDone(order) {
  return !!(order?.mininousShareUrl || order?.npsSubmittedAt)
}

export function canShowStudioReview({ order, lineartUrl }) {
  if (!order?.isPaid || !lineartUrl || order.isAdminView) return false
  return order.workflowStatus === 'pending_validation'
}

export function resolveStudioCaps(order) {
  const lineartVersion = order?.lineartVersion ?? 1
  const ws = order?.workflowStatus
  const studio = order?.studio ?? {}
  const versionCount = order?.lineartVersions?.length ?? 0
  return {
    ...studio,
    canAutoAdjust: studio.canAutoAdjust
      ?? (lineartVersion === 1 && ws === 'pending_validation' && !studio.revisionPending),
    canManualAdjust: studio.canManualAdjust
      ?? (lineartVersion === 2 && ws === 'pending_validation'),
    showVersionPicker: studio.showVersionPicker
      ?? (ws === 'pending_validation' && versionCount >= 2),
  }
}
