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
import { WORKFLOW_STATUS, loadOrderContext } from '../../server/order-workflow.js'
import { sanitizeRevisionCharacters } from '../../server/revision-characters.js'
import {
  sendLineartReadyEmailIfNeeded,
  sendDesignValidatedEmailIfNeeded,
  sendVersionPickEmailIfNeeded,
} from '../../server/order-email.js'
import { publicAssetUrl } from '../../server/asset-url.js'
import { getLineartVersion } from '../../server/studio-version.js'
import { selectAssetVersion } from '../../server/assets.js'
import { publishTeamLineartForOrder } from '../../server/studio-publish.js'

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
        token, generationId, action, faceCount, characters, approvedPersons,
        lineartVersion: bodyLineartVersion, versionId,
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

        const { previewUrl: rawPreview, sourcePhotoUrl: rawPhoto } = await loadOrderContext(supabase, order)
        sendLineartReadyEmailIfNeeded(req, {
          orderId: order.id,
          email: order.email,
          accessToken: order.access_token,
          packLabel: meta.pack_label,
          faceCount: order.face_count,
          sourcePhotoUrl: publicAssetUrl(req, rawPhoto ?? meta.paywall_source_url),
          previewUrl: publicAssetUrl(req, rawPreview),
          lineartVersion: nextVersion,
        }).catch(err => console.error('[order-email lineart]', err))

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

        const lineartVersion = getLineartVersion(meta)
        const validatedAt = new Date().toISOString()

        await supabase
          .from('mini_nous_orders')
          .update({
            workflow_status: WORKFLOW_STATUS.APPROVED,
            updated_at: validatedAt,
            metadata: {
              ...meta,
              validated_at: validatedAt,
              validated_lineart_version: lineartVersion,
              approved_persons: Array.isArray(approvedPersons) ? approvedPersons : null,
              version_pick_required: false,
            },
          })
          .eq('id', order.id)

        const { previewUrl: rawPreview, sourcePhotoUrl: rawPhoto } = await loadOrderContext(supabase, order)
        sendDesignValidatedEmailIfNeeded(req, {
          orderId: order.id,
          email: order.email,
          accessToken: order.access_token,
          packLabel: meta.pack_label,
          faceCount: order.face_count,
          previewUrl: publicAssetUrl(req, rawPreview),
          sourcePhotoUrl: publicAssetUrl(req, rawPhoto ?? meta.paywall_source_url),
          lineartVersion,
          customerName: order.customer_name,
        }).catch(err => console.error('[order-email validated]', err))

        return res.status(200).json({ ok: true, workflowStatus: WORKFLOW_STATUS.APPROVED })
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
