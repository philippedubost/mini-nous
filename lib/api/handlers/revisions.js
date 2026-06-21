import { getAuthUser } from '../../server/auth.js'
import { getSupabase } from '../../server/supabase.js'
import { requirePaidOrderByToken } from '../../server/order-access.js'
import { WORKFLOW_STATUS } from '../../server/order-workflow.js'
import { getSiteUrl } from '../../server/stripe-client.js'
import { sanitizeRevisionCharacters, ISSUE_OPTIONS } from '../../server/revision-characters.js'
import { getLineartVersion } from '../../server/studio-version.js'
import { sendRevisionAckEmail } from '../../server/order-email.js'

async function notifyRevisionSubmitted({ order, characters, siteUrl }) {
  const apiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1]
  if (!apiKey || !adminEmail) return

  const summary = (characters ?? [])
    .map(c => `Pers. ${c.index + 1} (${c.label || '—'}): ${(c.issues ?? []).join(', ') || '—'}${c.freeText ? ` — ${c.freeText}` : ''}`)
    .join('\n')

  const due = order.metadata?.revision_due_at
    ? new Date(order.metadata.revision_due_at).toLocaleString('fr-FR')
    : 'sous 24 h'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>',
      to: [adminEmail],
      subject: `[MiniNous] Révision manuelle v2→v3 · ${order.metadata?.pack_label || order.pack_type}`,
      text: `Commande ${order.id}\nClient: ${order.email}\nÉchéance: ${due}\n\n${summary}\n\n${siteUrl}/pipeline/commande?order=${order.access_token}`,
    }),
  }).catch(err => console.error('[revision-email]', err))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const token = req.query?.token || req.body?.token
    if (!token) return res.status(400).json({ error: 'token requis' })

    const authUser = await getAuthUser(req)
    const order = await requirePaidOrderByToken(token, authUser)
    const supabase = getSupabase()
    const meta = order.metadata ?? {}

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('mini_nous_revision_requests')
        .select('*')
        .eq('order_id', order.id)
        .order('submitted_at', { ascending: false })
        .limit(5)
      if (error) throw new Error(error.message)
      return res.status(200).json({ revisions: data ?? [], issueOptions: ISSUE_OPTIONS })
    }

    if (req.method === 'POST') {
      const currentVersion = getLineartVersion(meta)
      if (currentVersion !== 2 || meta.manual_revision_used) {
        return res.status(409).json({
          error: 'Révision équipe disponible uniquement après le tracé v2, une seule fois.',
        })
      }

      const { characters } = req.body ?? {}
      if (!Array.isArray(characters) || !characters.length) {
        return res.status(400).json({ error: 'characters requis (tableau non vide)' })
      }

      const sanitized = sanitizeRevisionCharacters(characters)
      if (!sanitized.length) {
        return res.status(400).json({ error: 'characters requis (au moins un retour)' })
      }

      const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      const { data: revision, error } = await supabase
        .from('mini_nous_revision_requests')
        .insert({
          order_id: order.id,
          generation_id: order.generation_id,
          status: 'open',
          characters: sanitized,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      await supabase
        .from('mini_nous_orders')
        .update({
          workflow_status: WORKFLOW_STATUS.REVISION_REQUESTED,
          updated_at: new Date().toISOString(),
          metadata: {
            ...meta,
            manual_revision_used: true,
            revision_due_at: dueAt,
            last_manual_revision_feedback: sanitized,
          },
        })
        .eq('id', order.id)

      notifyRevisionSubmitted({
        order: { ...order, metadata: { ...meta, revision_due_at: dueAt } },
        characters: sanitized,
        siteUrl: getSiteUrl(req),
      }).catch(() => {})

      sendRevisionAckEmail(req, {
        orderId: order.id,
        email: order.email,
        accessToken: order.access_token,
        packLabel: meta.pack_label,
      }).catch(err => console.error('[revision-ack]', err))

      return res.status(201).json({ revision, revisionDueAt: dueAt })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const status = e.status || 500
    if (status >= 500) console.error('[revisions]', e)
    return res.status(status).json({ error: e.message || 'Erreur serveur' })
  }
}
