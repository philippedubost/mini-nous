/** Parcours studio client : v1 → ajustement auto v2 → révision équipe v3. */

export function getLineartVersion(metadata) {
  const v = Number(metadata?.lineart_version)
  if (v >= 1 && v <= 3) return v
  const regen = Number(metadata?.regen_count) || 0
  return Math.min(regen + 1, 3)
}

export function getStudioCaps(metadata, workflowStatus, admin = false, lineartVersionsCount = 0) {
  const lineartVersion = getLineartVersion(metadata)
  const autoUsed = !!metadata?.auto_regen_used
  const manualUsed = !!metadata?.manual_revision_used
  const pickRequired = !!metadata?.version_pick_required
  const multiVersionPick = workflowStatus === 'pending_validation' && lineartVersionsCount >= 2
  const showVersionPicker = multiVersionPick || (pickRequired && lineartVersion >= 3)

  if (admin) {
    return {
      lineartVersion,
      canValidate: workflowStatus === 'pending_validation' || workflowStatus === 'approved',
      canAutoAdjust: false,
      canManualAdjust: false,
      showVersionPicker,
      revisionPending: workflowStatus === 'revision_requested',
    }
  }

  return {
    lineartVersion,
    canValidate: workflowStatus === 'pending_validation' && lineartVersion >= 1,
    canAutoAdjust: lineartVersion === 1 && !autoUsed && workflowStatus === 'pending_validation',
    canManualAdjust: lineartVersion === 2 && !manualUsed && workflowStatus === 'pending_validation',
    showVersionPicker,
    revisionPending: workflowStatus === 'revision_requested',
  }
}

export async function loadLineartVersions(supabase, generationId, publicUrl) {
  if (!generationId) return []
  const { data, error } = await supabase
    .from('mini_nous_asset_versions')
    .select('id, version, image_url, is_selected, source, created_at')
    .eq('generation_id', generationId)
    .eq('asset_type', 'step2')
    .is('deleted_at', null)
    .order('version', { ascending: true })
  if (error) throw new Error(error.message)

  return (data ?? []).map((row, i) => ({
    versionId: row.id,
    studioVersion: i + 1,
    dbVersion: row.version,
    url: publicUrl(row.image_url),
    isSelected: row.is_selected,
    source: row.source,
  }))
}
