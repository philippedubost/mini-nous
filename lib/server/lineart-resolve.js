import { loadLineartVersions } from './studio-version.js'
import { loadOrderContext } from './order-workflow.js'

/** URL du tracé validé pour fabrication (ou sélection courante). */
export async function resolveValidatedLineartUrl(supabase, order, publicUrl) {
  const generationId = order?.generation_id ?? order?.metadata?.draft_generation_id
  if (!generationId) {
    const { previewUrl } = await loadOrderContext(supabase, order)
    return publicUrl(previewUrl)
  }

  const versions = await loadLineartVersions(supabase, generationId, publicUrl)
  if (!versions.length) {
    const { data: step } = await supabase
      .from('mini_nous_generation_steps')
      .select('image_url, fal_url')
      .eq('generation_id', generationId)
      .eq('asset_type', 'step2')
      .maybeSingle()
    const step2Url = step?.image_url || step?.fal_url
    if (step2Url) return publicUrl(step2Url)

    const { previewUrl } = await loadOrderContext(supabase, order)
    return publicUrl(previewUrl)
  }

  const validatedStudioVersion = Number(order?.metadata?.validated_lineart_version)
  if (validatedStudioVersion >= 1) {
    const match = versions.find(v => v.studioVersion === validatedStudioVersion)
    if (match?.url) return match.url
  }

  const selected = versions.find(v => v.isSelected) ?? versions[versions.length - 1]
  return selected?.url ?? null
}
