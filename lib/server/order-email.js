import { getSupabase } from './supabase.js'
import { getSiteUrl } from './stripe-client.js'

function formatShipDate(shipDate) {
  if (!shipDate) return null
  return new Date(`${shipDate}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function buildConfirmationHtml({ customerName, packLabel, faceCount, shipLabel, orderUrl, studioUrl }) {
  const greeting = customerName ? `Bonjour ${customerName},` : 'Bonjour,'
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Merci pour votre commande — le paiement est bien confirmé.</p>
  <p style="background:#faf7f2;border-radius:12px;padding:16px">
    <strong>${packLabel}</strong><br/>
    ${faceCount} figurine${faceCount > 1 ? 's' : ''} · échelle 1/10<br/>
    ${shipLabel ? `Livraison prévue ${shipLabel}` : ''}
  </p>
  <p><a href="${orderUrl}" style="display:inline-block;background:#c0684a;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600">Suivre ma commande</a></p>
  <p style="font-size:14px;color:#6b5d52">Prochaine étape : envoyez votre photo de groupe.</p>
  <p><a href="${studioUrl}" style="color:#c0684a">Envoyer ma photo →</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Conservez cet e-mail pour retrouver votre commande.<br/>Les MiniNous · Nantes</p>
</body>
</html>`
}

export async function sendOrderConfirmationEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, shipDate, customerName,
}) {
  if (!email || !accessToken) return { skipped: true, reason: 'missing_email_or_token' }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>'
  if (!apiKey) {
    console.log('[order-email] RESEND_API_KEY absent — e-mail non envoyé')
    return { skipped: true, reason: 'no_resend_key' }
  }

  const supabase = getSupabase()
  const { data: order } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata')
    .eq('id', orderId)
    .maybeSingle()

  if (order?.metadata?.confirmation_email_sent_at) {
    return { skipped: true, reason: 'already_sent' }
  }

  const site = getSiteUrl(req)
  const orderUrl = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`
  const studioUrl = `${site}/pipeline/studio?order=${encodeURIComponent(accessToken)}`
  const shipLabel = formatShipDate(shipDate)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Votre commande Les MiniNous est confirmée',
      html: buildConfirmationHtml({
        customerName,
        packLabel: packLabel || 'MiniNous',
        faceCount: faceCount || 2,
        shipLabel,
        orderUrl,
        studioUrl,
      }),
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[order-email]', body)
    return { ok: false, error: body.message || `HTTP ${res.status}` }
  }

  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(order?.metadata ?? {}),
        confirmation_email_sent_at: sentAt,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}
