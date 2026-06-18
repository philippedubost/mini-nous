import { getOrderByToken, linkOrderToGeneration } from '../../server/orders.js'
import { getSupabase } from '../../server/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const token = req.query?.token
      if (!token) return res.status(400).json({ error: 'token requis' })

      const order = await getOrderByToken(token)
      if (!order) return res.status(404).json({ error: 'Commande introuvable' })
      if (order.status !== 'paid') {
        return res.status(402).json({ error: 'Paiement non confirmé', status: order.status })
      }

      return res.status(200).json({
        order: {
          id: order.id,
          packType: order.pack_type,
          faceCount: order.face_count,
          email: order.email,
          customerName: order.customer_name,
          generationId: order.generation_id,
          shipDate: order.week?.ship_date,
          cutoffAt: order.week?.cutoff_at,
        },
      })
    }

    if (req.method === 'PATCH') {
      const { token, generationId } = req.body ?? {}
      if (!token || !generationId) {
        return res.status(400).json({ error: 'token et generationId requis' })
      }

      const order = await getOrderByToken(token)
      if (!order) return res.status(404).json({ error: 'Commande introuvable' })
      if (order.status !== 'paid') return res.status(402).json({ error: 'Commande non payée' })

      await linkOrderToGeneration(order.id, generationId)
      return res.status(200).json({ ok: true, orderId: order.id, generationId })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[orders]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
