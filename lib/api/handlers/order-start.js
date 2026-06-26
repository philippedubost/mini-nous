import { startPaywallOrder, updatePaywallOrder } from '../../server/paywall-order.js'
import { publicAssetUrl } from '../../server/asset-url.js'
import { getJsonBody } from '../prepare-req.js'
import { trackFunnelEvent } from '../../server/funnel.js'

function draftResponse(req, result) {
  return {
    accessToken: result.accessToken,
    orderId: result.order.id,
    generationId: result.generationId,
    sourcePhotoUrl: publicAssetUrl(req, result.sourcePhotoUrl),
    links: result.links,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const body = getJsonBody(req)

    if (req.method === 'POST') {
      const {
        faceCount, packType, childCount, photoBase64,
        giftDelivery, giftRecipientName, giftMessage,
      } = body
      if (!photoBase64) {
        return res.status(400).json({ error: 'photoBase64 requis' })
      }
      if (faceCount == null) {
        return res.status(400).json({ error: 'faceCount requis' })
      }

      const result = await startPaywallOrder(req, process.env, {
        faceCount,
        packType,
        childCount,
        photoBase64,
        giftDelivery,
        giftRecipientName,
        giftMessage,
      })

      trackFunnelEvent('photo_uploaded', {
        orderId: result.order.id,
        faceCount: result.order.face_count,
        weekKey: result.week?.week_key ?? null,
      }).catch(() => {})

      return res.status(201).json(draftResponse(req, result))
    }

    if (req.method === 'PATCH') {
      const {
        accessToken, faceCount, childCount, photoBase64,
        giftDelivery, giftRecipientName, giftMessage,
      } = body
      if (!accessToken) {
        return res.status(400).json({ error: 'accessToken requis' })
      }

      const result = await updatePaywallOrder(req, process.env, {
        accessToken,
        faceCount,
        childCount,
        photoBase64,
        giftDelivery,
        giftRecipientName,
        giftMessage,
      })

      return res.status(200).json(draftResponse(req, result))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const isSoldOut = e.message?.includes('complète') || e.message?.includes('Édition')
    const status = isSoldOut ? 409 : (e.status || 500)
    if (status >= 500) console.error('[order-start]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur', soldOut: isSoldOut || undefined })
  }
}
