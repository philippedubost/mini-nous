import { getAuthUser, requireAuthUser } from '../../server/auth.js'
import { hasAdminAccess } from '../../server/admin.js'
import { getJsonBody } from '../prepare-req.js'
import {
  buildOrderResponse,
  claimOrdersByEmail,
  listAllPaidOrders,
  listOrdersForUser,
} from '../../server/order-access.js'
import { createAdminUserOrder } from '../../server/orders.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MiniNous-Admin')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const user = await getAuthUser(req)
    const admin = hasAdminAccess(req, user)

    if (req.method === 'POST') {
      const { action, faceCount, fromOrderId } = getJsonBody(req)
      if (action === 'claim') {
        const authUser = await requireAuthUser(req)
        const result = await claimOrdersByEmail(authUser.id, authUser.email)
        return res.status(200).json(result)
      }
      if (action === 'create_order') {
        if (!admin) {
          return res.status(403).json({ error: 'Réservé aux administrateurs' })
        }
        const { order, accessToken } = await createAdminUserOrder({
          userId: user?.id ?? null,
          email: user?.email ?? 'admin@mininous.app',
          faceCount,
          fromOrderId: fromOrderId ?? null,
        })
        return res.status(201).json({
          order: await buildOrderResponse(req, order, user),
          accessToken,
        })
      }
      return res.status(400).json({ error: `action inconnue${action ? `: ${action}` : ''}` })
    }

    if (req.method === 'GET') {
      if (!user && !admin) {
        return res.status(401).json({ error: 'Connexion requise' })
      }
      const rows = admin
        ? await listAllPaidOrders()
        : await listOrdersForUser(user.id)
      const orders = await Promise.all(rows.map(o => buildOrderResponse(req, o, user)))
      return res.status(200).json({
        user: {
          id: user?.id ?? null,
          email: user?.email ?? (admin ? 'admin@mininous.app' : null),
          isAdmin: admin,
        },
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
