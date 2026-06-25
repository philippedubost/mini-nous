import { WORKFLOW_STATUS } from './order-workflow.js'
import { loadLineartVersions } from './studio-version.js'
import { selectAssetVersion } from './assets.js'
import { publicAssetUrl } from './asset-url.js'

/** Publie le tracé v3 équipe au client (choix entre v1/v2/v3). */
export async function publishTeamLineartForOrder(req, supabase, order) {
  const genId = order.generation_id
  if (!genId) throw Object.assign(new Error('generation_id requis'), { status: 400 })

  const meta = order.metadata ?? {}
  const lineartVersions = await loadLineartVersions(
    supabase,
    genId,
    (url) => publicAssetUrl(req, url),
  )
  if (lineartVersions.length < 3) {
    throw Object.assign(new Error('Au moins 3 versions step2 requises (v1, v2, v3).'), { status: 400 })
  }

  const v3 = lineartVersions[lineartVersions.length - 1]
  await selectAssetVersion(supabase, genId, v3.versionId)

  await supabase
    .from('mini_nous_revision_requests')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('order_id', order.id)
    .eq('status', 'open')

  const updatedMeta = {
    ...meta,
    lineart_version: 3,
    version_pick_required: true,
    team_lineart_published_at: new Date().toISOString(),
    selected_lineart_version_id: v3.versionId,
  }

  await supabase
    .from('mini_nous_orders')
    .update({
      workflow_status: WORKFLOW_STATUS.PENDING_VALIDATION,
      updated_at: new Date().toISOString(),
      metadata: updatedMeta,
    })
    .eq('id', order.id)

  return { lineartVersion: 3, lineartVersions }
}
