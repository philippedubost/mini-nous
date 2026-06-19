import { requireAuthUser } from '../../server/auth.js'
import {
  buildOrderResponse,
  claimOrdersByEmail,
  listOrdersForUser,
} from '../../server/order-access.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const user = await requireAuthUser(req)

    if (req.method === 'POST') {
      const { action } = req.body ?? {}
      if (action === 'claim') {
        const result = await claimOrdersByEmail(user.id, user.email)
        return res.status(200).json(result)
      }
      return res.status(400).json({ error: 'action inconnue' })
    }

    if (req.method === 'GET') {
      const rows = await listOrdersForUser(user.id)
      const orders = await Promise.all(rows.map(o => buildOrderResponse(req, o)))
      return res.status(200).json({
        user: { id: user.id, email: user.email },
        orders,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[me]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
