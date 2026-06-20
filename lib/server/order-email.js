import { getSupabase } from './supabase.js'
import { getSiteUrl } from './stripe-client.js'
import { loadOrderContext } from './order-workflow.js'
import { publicAssetUrl } from './asset-url.js'

function formatShipDate(shipDate) {
  if (!shipDate) return null
  return new Date(`${shipDate}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildConfirmationHtml({
  customerName, packLabel, faceCount, shipLabel, orderUrl, studioUrl, sourcePhotoUrl,
}) {
  const greeting = customerName ? `Bonjour ${escapeHtml(customerName)},` : 'Bonjour,'
  const photoBlock = sourcePhotoUrl
    ? `<p style="margin:20px 0;text-align:center">
        <img src="${escapeHtml(sourcePhotoUrl)}" alt="Votre photo"
          style="max-width:100%;max-height:220px;border-radius:16px;display:inline-block;box-shadow:0 4px 16px rgba(44,31,20,.1)"/>
      </p>`
    : ''
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Merci pour votre commande — le paiement est bien confirmé.</p>
  ${photoBlock}
  <p style="background:#faf7f2;border-radius:12px;padding:16px">
    <strong>${escapeHtml(packLabel)}</strong><br/>
    ${faceCount} figurine${faceCount > 1 ? 's' : ''} · échelle 1/10<br/>
    ${shipLabel ? `Livraison prévue ${escapeHtml(shipLabel)}` : ''}
  </p>
  <p style="font-size:15px;color:#2c1f14;margin:20px 0">
    <strong>Commande en cours de création dans le studio</strong><br/>
    <span style="color:#6b5d52;font-size:14px">Validez le tracé ou demandez des ajustements personnage par personnage.</span>
  </p>
  <p><a href="${escapeHtml(studioUrl)}" style="display:inline-block;background:#c0684a;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600">Ouvrir le studio →</a></p>
  <p style="font-size:14px;color:#6b5d52"><a href="${escapeHtml(orderUrl)}" style="color:#c0684a">Suivre ma commande</a></p>
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
  const { data: orderRow } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, generation_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderRow?.metadata?.confirmation_email_sent_at) {
    return { skipped: true, reason: 'already_sent' }
  }

  const { sourcePhotoUrl: rawPhoto } = orderRow
    ? await loadOrderContext(supabase, orderRow)
    : { sourcePhotoUrl: null }
  const sourcePhotoUrl = publicAssetUrl(req, rawPhoto ?? orderRow?.metadata?.paywall_source_url)

  const site = getSiteUrl(req)
  const orderUrl = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`
  const studioUrl = `${site}/pipeline/studio?order=${encodeURIComponent(accessToken)}&auto=1`
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
        sourcePhotoUrl,
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
        ...(orderRow?.metadata ?? {}),
        confirmation_email_sent_at: sentAt,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}

function dualPreviewHtml(sourcePhotoUrl, previewUrl) {
  if (!sourcePhotoUrl && !previewUrl) return ''
  const imgStyle = 'max-width:48%;max-height:200px;border-radius:16px;display:inline-block;vertical-align:top;box-shadow:0 4px 16px rgba(44,31,20,.1)'
  const photo = sourcePhotoUrl
    ? `<img src="${escapeHtml(sourcePhotoUrl)}" alt="Photo" style="${imgStyle}"/>`
    : ''
  const line = previewUrl
    ? `<img src="${escapeHtml(previewUrl)}" alt="Tracé" style="${imgStyle}"/>`
    : ''
  return `<p style="margin:20px 0;text-align:center;line-height:0">${photo}${photo && line ? '&nbsp;' : ''}${line}</p>`
}

function buildLineartReadyHtml({
  packLabel, faceCount, orderUrl, studioUrl, sourcePhotoUrl, previewUrl,
}) {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>Bonne nouvelle — le tracé de vos figurines est prêt à valider.</p>
  ${dualPreviewHtml(sourcePhotoUrl, previewUrl)}
  <p style="background:#faf7f2;border-radius:12px;padding:16px">
    <strong>${escapeHtml(packLabel)}</strong><br/>
    ${faceCount} figurine${faceCount > 1 ? 's' : ''} · tracé v1
  </p>
  <p style="font-size:15px;color:#2c1f14;margin:20px 0">
    Validez chaque personnage, ou regénérez avec vos retours personnage par personnage.
  </p>
  <p><a href="${escapeHtml(studioUrl)}" style="display:inline-block;background:#c0684a;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600">Valider dans le studio →</a></p>
  <p style="font-size:14px;color:#6b5d52"><a href="${escapeHtml(orderUrl)}" style="color:#c0684a">Suivre ma commande</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Les MiniNous · Nantes</p>
</body>
</html>`
}

export async function sendLineartReadyEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, sourcePhotoUrl, previewUrl,
}) {
  if (!email || !accessToken || !previewUrl) {
    return { skipped: true, reason: 'missing_email_token_or_preview' }
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>'
  if (!apiKey) {
    console.log('[order-email] RESEND_API_KEY absent — e-mail tracé non envoyé')
    return { skipped: true, reason: 'no_resend_key' }
  }

  const supabase = getSupabase()
  const { data: orderRow } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata')
    .eq('id', orderId)
    .maybeSingle()

  if (orderRow?.metadata?.lineart_email_sent_at) {
    return { skipped: true, reason: 'already_sent' }
  }

  const site = getSiteUrl(req)
  const orderUrl = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`
  const studioUrl = `${site}/pipeline/studio?order=${encodeURIComponent(accessToken)}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Votre tracé MiniNous est prêt — à valider',
      html: buildLineartReadyHtml({
        packLabel: packLabel || 'MiniNous',
        faceCount: faceCount || 2,
        orderUrl,
        studioUrl,
        sourcePhotoUrl,
        previewUrl,
      }),
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[order-email lineart]', body)
    return { ok: false, error: body.message || `HTTP ${res.status}` }
  }

  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(orderRow?.metadata ?? {}),
        lineart_email_sent_at: sentAt,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}
