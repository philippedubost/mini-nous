import { getOrderByToken, linkOrderToGeneration } from '../../server/orders.js'
import { getSupabase } from '../../server/supabase.js'
import { getAuthUser } from '../../server/auth.js'
import { hasAdminAccess } from '../../server/admin.js'
import { getJsonBody } from '../prepare-req.js'
import {
  buildOrderResponse,
  requireOrderByToken,
  requirePaidOrderByToken,
} from '../../server/order-access.js'
import { WORKFLOW_STATUS, loadOrderContext, isOrderEditable } from '../../server/order-workflow.js'
import { sanitizeRevisionCharacters } from '../../server/revision-characters.js'
import { publicAssetUrl } from '../../server/asset-url.js'
import { getLineartVersion, loadLineartVersions } from '../../server/studio-version.js'
import { selectAssetVersion } from '../../server/assets.js'
import { publishTeamLineartForOrder } from '../../server/studio-publish.js'
import { queueStudioGenerate } from '../../server/studio-generate.js'
import { computeQuote, MAX_FACES, packTypeForDatabase } from '../../server/packs.js'
import { formatShippingAddress } from '../../server/shipping.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const token = req.query?.token
      if (!token) return res.status(400).json({ error: 'token requis' })

      const authUser = await getAuthUser(req)
      const order = await requireOrderByToken(token, authUser)
      return res.status(200).json({ order: await buildOrderResponse(req, order, authUser) })
    }

    if (req.method === 'PATCH') {
      const {
        token, generationId, action, faceCount, childCount, characters, approvedPersons,
        lineartVersion: bodyLineartVersion, versionId, shippingAddress: bodyShippingAddress,
      } = getJsonBody(req)
      if (!token) return res.status(400).json({ error: 'token requis' })

      const authUser = await getAuthUser(req)
      const order = await requirePaidOrderByToken(token, authUser)
      const supabase = getSupabase()
      const admin = hasAdminAccess(req, authUser)
      const meta = order.metadata ?? {}

      if (action === 'link_generation' || (!action && generationId)) {
        if (!generationId) {
          return res.status(400).json({ error: 'generationId requis' })
        }
        await linkOrderToGeneration(order.id, generationId)
        return res.status(200).json({ ok: true, orderId: order.id, generationId })
      }

      if (action === 'pending_validation') {
        const nextVersion = Number(bodyLineartVersion) || getLineartVersion(meta) || 1
        await supabase
          .from('mini_nous_orders')
          .update({
            workflow_status: WORKFLOW_STATUS.PENDING_VALIDATION,
            updated_at: new Date().toISOString(),
            metadata: {
              ...meta,
              lineart_version: nextVersion,
            },
          })
          .eq('id', order.id)

        return res.status(200).json({
          ok: true,
          workflowStatus: WORKFLOW_STATUS.PENDING_VALIDATION,
          lineartVersion: nextVersion,
        })
      }

      if (action === 'validate') {
        if (!order.generation_id) {
          return res.status(400).json({ error: 'Aucun design à valider' })
        }
        const fc = Number(order.face_count) || 1
        if (Array.isArray(approvedPersons)) {
          const ok = approvedPersons.filter(n => Number.isInteger(n) && n >= 0 && n < fc)
          if (ok.length < fc) {
            return res.status(400).json({
              error: `Validez les ${fc} personnage${fc > 1 ? 's' : ''} avant de confirmer le tracé`,
            })
          }
        }

        const versions = order.generation_id
          ? await loadLineartVersions(
            supabase,
            order.generation_id,
            (url) => publicAssetUrl(req, url),
          )
          : []

        let validatedStudioVersion = getLineartVersion(meta)

        if (versionId && order.generation_id) {
          await selectAssetVersion(supabase, order.generation_id, versionId)
          const match = versions.find(v => v.versionId === versionId)
          if (match) validatedStudioVersion = match.studioVersion
        } else if (versions.length > 0) {
          const selected = versions.find(v => v.isSelected)
          if (selected) validatedStudioVersion = selected.studioVersion
        }

        const validatedAt = new Date().toISOString()
        const resolvedVersionId = versionId
          || versions.find(v => v.studioVersion === validatedStudioVersion)?.versionId
          || meta.selected_lineart_version_id
          || null

        await supabase
          .from('mini_nous_orders')
          .update({
            workflow_status: WORKFLOW_STATUS.APPROVED,
            updated_at: validatedAt,
            metadata: {
              ...meta,
              validated_at: validatedAt,
              validated_lineart_version: validatedStudioVersion,
              lineart_version: validatedStudioVersion,
              selected_lineart_version_id: resolvedVersionId,
              approved_persons: Array.isArray(approvedPersons) ? approvedPersons : null,
              version_pick_required: false,
            },
          })
          .eq('id', order.id)

        return res.status(200).json({ ok: true, workflowStatus: WORKFLOW_STATUS.APPROVED })
      }

      if (action === 'update_composition') {
        const fc = Number(faceCount)
        const cc = childCount != null ? Number(childCount) : Number(meta.child_count) || 0
        if (!Number.isFinite(fc) || fc < 1 || fc > MAX_FACES) {
          return res.status(400).json({ error: `Nombre de figurines invalide (1–${MAX_FACES})` })
        }
        if (!Number.isFinite(cc) || cc < 0 || cc > fc) {
          return res.status(400).json({ error: 'Nombre d\'enfants invalide' })
        }

        const { generation, previewUrl } = await loadOrderContext(supabase, order)
        const editable = admin || isOrderEditable({
          workflowStatus: order.workflow_status,
          generation,
          week: order.week,
        })
        if (!editable) {
          return res.status(409).json({ error: 'Commande non modifiable' })
        }
        if (!admin && previewUrl) {
          return res.status(409).json({ error: 'La composition ne peut plus être modifiée une fois le tracé généré.' })
        }

        const quote = computeQuote(fc)
        if (!quote.ok) {
          return res.status(400).json({ error: 'Nombre de personnages invalide' })
        }

        const now = new Date().toISOString()
        await supabase
          .from('mini_nous_orders')
          .update({
            face_count: fc,
            pack_type: packTypeForDatabase(quote.basePack.id),
            updated_at: now,
            metadata: {
              ...meta,
              child_count: cc,
              pack_label: quote.label,
              base_pack: quote.basePack.id,
              extra_count: quote.extraCount,
            },
          })
          .eq('id', order.id)

        const generationId = order.generation_id ?? meta.draft_generation_id
        if (generationId && !generation?.fabricated_at) {
          await supabase
            .from('mini_nous_generations')
            .update({ face_count: fc, updated_at: now })
            .eq('id', generationId)
        }

        const updated = await getOrderByToken(token)
        return res.status(200).json({
          ok: true,
          faceCount: fc,
          childCount: cc,
          order: await buildOrderResponse(req, updated, authUser),
        })
      }

      if (action === 'update_shipping') {
        if (order.workflow_status === WORKFLOW_STATUS.SHIPPED) {
          return res.status(409).json({ error: 'Adresse non modifiable après expédition.' })
        }
        const formatted = formatShippingAddress(bodyShippingAddress)
        if (!formatted) {
          return res.status(400).json({ error: 'Adresse invalide — rue, ville et code postal requis.' })
        }
        const now = new Date().toISOString()
        await supabase
          .from('mini_nous_orders')
          .update({
            metadata: { ...meta, shipping_address: formatted },
            updated_at: now,
          })
          .eq('id', order.id)
        const updated = await getOrderByToken(token)
        return res.status(200).json({
          ok: true,
          order: await buildOrderResponse(req, updated, authUser),
        })
      }

      if (action === 'update_face_count') {
        if (!admin) {
          return res.status(403).json({ error: 'Réservé aux administrateurs' })
        }
        const fc = Number(faceCount)
        if (!Number.isFinite(fc) || fc < 1 || fc > 32) {
          return res.status(400).json({ error: 'faceCount invalide (1–32)' })
        }
        await supabase
          .from('mini_nous_orders')
          .update({ face_count: fc, updated_at: new Date().toISOString() })
          .eq('id', order.id)
        return res.status(200).json({ ok: true, faceCount: fc })
      }

      if (action === 'regen') {
        const currentVersion = getLineartVersion(meta)
        if (!admin && (currentVersion !== 1 || meta.auto_regen_used)) {
          return res.status(409).json({
            error: 'Ajustement automatique déjà utilisé — validez le tracé v2 ou demandez une révision équipe.',
          })
        }
        const feedback = sanitizeRevisionCharacters(characters)
        if (!admin && !feedback.length) {
          return res.status(400).json({ error: 'Retours personnage requis pour regénérer' })
        }

        await supabase
          .from('mini_nous_orders')
          .update({
            metadata: {
              ...meta,
              auto_regen_used: true,
              last_regen_feedback: feedback,
              last_regen_at: new Date().toISOString(),
              regen_count: (Number(meta.regen_count) || 0) + 1,
            },
            workflow_status: WORKFLOW_STATUS.IN_STUDIO,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)

        queueStudioGenerate(order.id, { mode: 'regen', feedback }).catch(err => {
          console.error('[studio-generate regen]', err)
        })

        return res.status(200).json({ ok: true, autoRegen: true })
      }

      if (action === 'select_lineart') {
        if (!order.generation_id || !versionId) {
          return res.status(400).json({ error: 'generationId et versionId requis' })
        }
        await selectAssetVersion(supabase, order.generation_id, versionId)
        await supabase
          .from('mini_nous_orders')
          .update({
            metadata: {
              ...meta,
              selected_lineart_version_id: versionId,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
        return res.status(200).json({ ok: true })
      }

      if (action === 'publish_team_lineart') {
        if (!admin) {
          return res.status(403).json({ error: 'Réservé aux administrateurs' })
        }
        const result = await publishTeamLineartForOrder(req, supabase, order)
        return res.status(200).json({ ok: true, ...result })
      }

      return res.status(400).json({ error: 'action inconnue' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[orders]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
