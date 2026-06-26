import { getSupabase } from './supabase.js'
import { getSiteUrl } from './stripe-client.js'
import { loadOrderContext } from './order-workflow.js'
import { publicAssetUrl } from './asset-url.js'
import { customerDeliveryLabel, formatDeliveryDateFr } from './delivery-dates.js'
import { friendlyEmailSubject, parseCustomerFirstName, resolveCustomerFirstName } from './customer-name.js'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function emailGreeting(customerFirstName, customerName) {
  const fn = customerFirstName || parseCustomerFirstName(customerName)
  return fn ? `Bonjour ${escapeHtml(fn)},` : 'Bonjour,'
}

function customerOrderUrl(site, accessToken, { auto = false } = {}) {
  const base = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`
  return auto ? `${base}&auto=1` : base
}

function buildConfirmationHtml({
  customerFirstName, customerName, packLabel, faceCount, shipLabel, orderUrl, sourcePhotoUrl,
}) {
  const greeting = emailGreeting(customerFirstName, customerName)
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
    ${faceCount} figurine${faceCount > 1 ? 's' : ''}<br/>
    ${shipLabel ? `Livraison prévue ${escapeHtml(shipLabel)}` : ''}
  </p>
  <p style="font-size:15px;color:#2c1f14;margin:20px 0">
    <strong>Votre tracé est en préparation</strong><br/>
    <span style="color:#6b5d52;font-size:14px">Vous pourrez le valider ou demander des ajustements personnage par personnage dès qu&apos;il sera prêt.</span>
  </p>
  <p><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#c0684a;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600">Voir ma commande →</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Conservez cet e-mail pour retrouver votre commande.<br/>Les MiniNous · Nantes</p>
</body>
</html>`
}

export async function sendOrderConfirmationEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, shipDate, fridayDelivery, customerName,
  customerFirstName,
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
  const orderUrl = customerOrderUrl(site, accessToken, { auto: true })
  const shipLabel = customerDeliveryLabel(shipDate, !!fridayDelivery)
  const firstName = customerFirstName
    || resolveCustomerFirstName({ customerName, metadata: orderRow?.metadata })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: friendlyEmailSubject(firstName, 'ta commande MiniNous est confirmée ✨'),
      html: buildConfirmationHtml({
        customerFirstName: firstName,
        customerName,
        packLabel: packLabel || 'MiniNous',
        faceCount: faceCount || 2,
        shipLabel,
        orderUrl,
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

function trustpilotReviewBlockHtml(orderUrl) {
  const reviewUrl = `${orderUrl.replace(/#.*$/, '')}#avis`
  const stars = [1, 2, 3, 4, 5].map(n => (
    `<a href="${escapeHtml(reviewUrl)}" style="text-decoration:none;font-size:30px;color:#c0684a;margin:0 3px;line-height:1" title="${n} étoile${n > 1 ? 's' : ''}">★</a>`
  )).join('')
  return `<div style="margin:28px 0;text-align:center;background:#faf7f2;border-radius:16px;padding:20px 16px">
    <p style="font-size:14px;font-weight:600;color:#2c1f14;margin:0 0 12px">Comment s'est passée votre expérience ?</p>
    <p style="margin:0 0 14px;line-height:1">${stars}</p>
    <p style="font-size:13px;color:#6b5d52;margin:0;line-height:1.5">
      Aidez-nous à faire connaître les MiniNous en laissant un avis rapide sur Trustpilot 🙏
    </p>
  </div>`
}

function dualPreviewHtml(sourcePhotoUrl, previewUrl, { highlightLineart = false } = {}) {
  if (!sourcePhotoUrl && !previewUrl) return ''
  const imgStyle = 'max-width:48%;max-height:200px;border-radius:16px;display:inline-block;vertical-align:top;box-shadow:0 4px 16px rgba(44,31,20,.1)'
  const lineStyle = highlightLineart
    ? `${imgStyle};border:3px solid #c0684a`
    : imgStyle
  const photo = sourcePhotoUrl
    ? `<img src="${escapeHtml(sourcePhotoUrl)}" alt="Photo" style="${imgStyle}"/>`
    : ''
  const line = previewUrl
    ? `<div style="display:inline-block;max-width:48%;vertical-align:top;text-align:center">
        <img src="${escapeHtml(previewUrl)}" alt="Tracé validé" style="${lineStyle}"/>
        ${highlightLineart ? '<p style="font-size:11px;font-weight:600;color:#c0684a;margin:6px 0 0">Tracé validé</p>' : ''}
      </div>`
    : ''
  return `<p style="margin:20px 0;text-align:center;line-height:1.4">${photo}${photo && line ? '&nbsp;' : ''}${line}</p>`
}

function buildLineartReadyHtml({
  customerFirstName, customerName, packLabel, faceCount, orderUrl, sourcePhotoUrl, previewUrl, lineartVersion = 1,
}) {
  const greeting = emailGreeting(customerFirstName, customerName)
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Bonne nouvelle — le tracé de vos figurines est prêt à valider.</p>
  ${dualPreviewHtml(sourcePhotoUrl, previewUrl)}
  <p style="background:#faf7f2;border-radius:12px;padding:16px">
    <strong>${escapeHtml(packLabel)}</strong><br/>
    ${faceCount} figurine${faceCount > 1 ? 's' : ''} · tracé v${lineartVersion}
  </p>
  <p style="font-size:15px;color:#2c1f14;margin:20px 0">
    Validez le tracé ou ajustez personnage par personnage depuis votre page commande.
  </p>
  <p><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#c0684a;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600">Valider mon tracé →</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Les MiniNous · Nantes</p>
</body>
</html>`
}

function buildValidatedHtml({
  customerFirstName, customerName, packLabel, faceCount, orderUrl, previewUrl, sourcePhotoUrl, lineartVersion = 1,
}) {
  const greeting = emailGreeting(customerFirstName, customerName)
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Merci — votre tracé v${lineartVersion} est validé.</p>
  ${dualPreviewHtml(sourcePhotoUrl, previewUrl)}
  <p style="background:#ebf4ec;border-radius:12px;padding:16px;border:1px solid rgba(74,138,82,.2)">
    <strong style="color:#2d5a34">Prêt à fabriquer</strong><br/>
    ${escapeHtml(packLabel)} · ${faceCount} figurine${faceCount > 1 ? 's' : ''}<br/>
    <span style="color:#4a8a52;font-size:14px">Vos figurines entrent en file d'impression à Nantes.</span>
  </p>
  <p style="font-size:14px;color:#6b5d52"><a href="${escapeHtml(orderUrl)}" style="color:#c0684a">Suivre ma commande</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Les MiniNous · Nantes</p>
</body>
</html>`
}

function buildFabricationCompleteHtml({
  customerFirstName, customerName, packLabel, faceCount, orderUrl, previewUrl, sourcePhotoUrl, lineartVersion = 1, shipLabel,
}) {
  const greeting = emailGreeting(customerFirstName, customerName)
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Bonne nouvelle — la fabrication de vos MiniNous est terminée à l'atelier.</p>
  ${dualPreviewHtml(sourcePhotoUrl, previewUrl)}
  <p style="background:#f3eef8;border-radius:12px;padding:16px;border:1px solid rgba(124,58,237,.15)">
    <strong style="color:#5b21b6">Fabrication terminée</strong><br/>
    ${escapeHtml(packLabel)} · ${faceCount} figurine${faceCount > 1 ? 's' : ''} · tracé v${lineartVersion}<br/>
    <span style="color:#6b5d52;font-size:14px">Votre colis sera expédié très prochainement${shipLabel ? ` — livraison prévue ${escapeHtml(shipLabel)}` : ''}.</span>
  </p>
  <p style="font-size:14px;color:#6b5d52"><a href="${escapeHtml(orderUrl)}" style="color:#c0684a">Suivre ma commande</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Les MiniNous · Nantes</p>
</body>
</html>`
}

function buildShippedHtml({
  customerFirstName, customerName, packLabel, faceCount, orderUrl, previewUrl, sourcePhotoUrl, lineartVersion = 1,
  loyaltyCouponCode,
}) {
  const greeting = emailGreeting(customerFirstName, customerName)
  const couponBlock = loyaltyCouponCode
    ? `<p style="background:#ebf4ec;border-radius:12px;padding:16px;border:1px solid rgba(74,138,82,.2);margin:20px 0">
        <strong style="color:#2d5a34">−10 % sur votre prochaine commande</strong><br/>
        <span style="font-family:monospace;font-size:15px;font-weight:700;color:#2c1f14">${escapeHtml(loyaltyCouponCode)}</span><br/>
        <span style="color:#6b5d52;font-size:13px">Code unique · valable 6 mois · à saisir au paiement Stripe</span>
      </p>`
    : ''
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Vos MiniNous sont en route — le colis a quitté notre atelier à Nantes.</p>
  ${dualPreviewHtml(sourcePhotoUrl, previewUrl, { highlightLineart: true })}
  <p style="background:#faf7f2;border-radius:12px;padding:16px">
    <strong>${escapeHtml(packLabel)}</strong><br/>
    ${faceCount} figurine${faceCount > 1 ? 's' : ''} · tracé v${lineartVersion} validé<br/>
    <span style="color:#6b5d52;font-size:14px">Merci pour votre confiance — profitez bien de vos figurines !</span>
  </p>
  ${couponBlock}
  ${trustpilotReviewBlockHtml(orderUrl)}
  <p style="font-size:14px;color:#6b5d52"><a href="${escapeHtml(orderUrl)}" style="color:#c0684a">Voir ma commande</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Les MiniNous · Nantes</p>
</body>
</html>`
}

function buildVersionPickHtml({
  customerFirstName, customerName, packLabel, faceCount, orderUrl, versions,
}) {
  const greeting = emailGreeting(customerFirstName, customerName)
  const thumbs = (versions ?? []).map(v => v.url
    ? `<div style="display:inline-block;width:30%;max-width:140px;margin:1%;text-align:center;vertical-align:top">
        <img src="${escapeHtml(v.url)}" alt="Tracé v${v.studioVersion}"
          style="width:100%;border-radius:12px;border:2px solid ${v.isSelected ? '#c0684a' : '#e8dfd4'}"/>
        <p style="font-size:12px;font-weight:600;margin:6px 0 0">Tracé v${v.studioVersion}</p>
      </div>`
    : '').join('')
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Notre équipe a finalisé votre tracé v3 — choisissez la version que vous préférez.</p>
  <div style="margin:20px 0;text-align:center;line-height:0">${thumbs}</div>
  <p style="background:#faf7f2;border-radius:12px;padding:16px">
    <strong>${escapeHtml(packLabel)}</strong><br/>
    ${faceCount} figurine${faceCount > 1 ? 's' : ''}
  </p>
  <p style="font-size:15px;color:#2c1f14;margin:20px 0">
    Comparez les tracés v1, v2 et v3 sur votre page commande, puis validez votre préférée.
  </p>
  <p><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#c0684a;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600">Choisir mon tracé →</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Les MiniNous · Nantes</p>
</body>
</html>`
}

function buildRevisionAckHtml({ customerFirstName, customerName, packLabel, orderUrl }) {
  const greeting = emailGreeting(customerFirstName, customerName)
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#2c1f14;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;color:#c0684a">Les MiniNous</p>
  <p>${greeting}</p>
  <p>Nous avons bien reçu vos ajustements pour le tracé v2.</p>
  <p style="background:#faf7f2;border-radius:12px;padding:16px">
    <strong>${escapeHtml(packLabel)}</strong><br/>
    Notre équipe reprend le tracé à la main — réponse sous <strong>24 h</strong>.
  </p>
  <p style="font-size:14px;color:#6b5d52"><a href="${escapeHtml(orderUrl)}" style="color:#c0684a">Suivre ma commande</a></p>
  <p style="font-size:12px;color:#9a8b7e;margin-top:32px">Les MiniNous · Nantes</p>
</body>
</html>`
}

async function sendResendEmail({ apiKey, from, to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`)
  return body
}

function lineartEmailAlreadySent(metadata, version) {
  const sent = metadata?.lineart_emails_sent ?? {}
  return !!sent[`v${version}`]
}

function markLineartEmailSent(metadata, version) {
  const sent = { ...(metadata?.lineart_emails_sent ?? {}), [`v${version}`]: new Date().toISOString() }
  return sent
}

export async function sendLineartReadyEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, sourcePhotoUrl, previewUrl, lineartVersion = 1,
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
    .select('id, metadata, customer_name')
    .eq('id', orderId)
    .maybeSingle()

  const v = lineartVersion || 1
  if (v !== 1) {
    return { skipped: true, reason: 'only_v1_emails' }
  }
  if (lineartEmailAlreadySent(orderRow?.metadata, v)) {
    return { skipped: true, reason: 'already_sent' }
  }

  const firstName = resolveCustomerFirstName(orderRow ?? {})
  const site = getSiteUrl(req)
  const orderUrl = customerOrderUrl(site, accessToken)

  const body = await sendResendEmail({
    apiKey,
    from,
    to: [email],
    subject: v === 1
      ? friendlyEmailSubject(firstName, 'besoin de ta validation pour tes MiniNous 🔍')
      : friendlyEmailSubject(firstName, `ton tracé v${v} est prêt — à valider 🔍`),
    html: buildLineartReadyHtml({
      customerFirstName: firstName,
      customerName: orderRow?.customer_name,
      packLabel: packLabel || 'MiniNous',
      faceCount: faceCount || 2,
      orderUrl,
      sourcePhotoUrl,
      previewUrl,
      lineartVersion: v,
    }),
  })

  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(orderRow?.metadata ?? {}),
        lineart_emails_sent: markLineartEmailSent(orderRow?.metadata, v),
        ...(v === 1 && !orderRow?.metadata?.lineart_email_sent_at
          ? { lineart_email_sent_at: sentAt }
          : {}),
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}

export async function sendDesignValidatedEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, previewUrl, sourcePhotoUrl,
  lineartVersion = 1, customerName,
}) {
  if (!email || !accessToken) return { skipped: true, reason: 'missing_email_or_token' }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>'
  if (!apiKey) return { skipped: true, reason: 'no_resend_key' }

  const supabase = getSupabase()
  const { data: orderRow } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, customer_name')
    .eq('id', orderId)
    .maybeSingle()

  if (orderRow?.metadata?.validated_email_sent_at) {
    return { skipped: true, reason: 'already_sent' }
  }

  const firstName = resolveCustomerFirstName({
    customerName,
    metadata: orderRow?.metadata,
    customer_name: orderRow?.customer_name,
  })
  const site = getSiteUrl(req)
  const orderUrl = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`

  const body = await sendResendEmail({
    apiKey,
    from,
    to: [email],
    subject: friendlyEmailSubject(firstName, 'tracé validé — on lance la fabrication 🎉'),
    html: buildValidatedHtml({
      customerFirstName: firstName,
      customerName: customerName ?? orderRow?.customer_name,
      packLabel: packLabel || 'MiniNous',
      faceCount: faceCount || 2,
      orderUrl,
      previewUrl,
      sourcePhotoUrl,
      lineartVersion,
      customerName,
    }),
  })

  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(orderRow?.metadata ?? {}),
        validated_email_sent_at: sentAt,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}

export async function sendVersionPickEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, lineartVersions,
}) {
  if (!email || !accessToken) return { skipped: true, reason: 'missing_email_or_token' }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>'
  if (!apiKey) return { skipped: true, reason: 'no_resend_key' }

  const supabase = getSupabase()
  const { data: orderRow } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, customer_name')
    .eq('id', orderId)
    .maybeSingle()

  if (orderRow?.metadata?.version_pick_email_sent_at) {
    return { skipped: true, reason: 'already_sent' }
  }

  const firstName = resolveCustomerFirstName(orderRow ?? {})
  const site = getSiteUrl(req)
  const orderUrl = customerOrderUrl(site, accessToken)

  const body = await sendResendEmail({
    apiKey,
    from,
    to: [email],
    subject: friendlyEmailSubject(firstName, 'choisis ta version préférée 🎨'),
    html: buildVersionPickHtml({
      customerFirstName: firstName,
      customerName: orderRow?.customer_name,
      packLabel: packLabel || 'MiniNous',
      faceCount: faceCount || 2,
      orderUrl,
      versions: lineartVersions,
    }),
  })

  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(orderRow?.metadata ?? {}),
        version_pick_email_sent_at: sentAt,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}

export async function sendRevisionAckEmail(req, {
  orderId, email, accessToken, packLabel, customerName,
}) {
  if (!email || !accessToken) return { skipped: true, reason: 'missing_email_or_token' }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>'
  if (!apiKey) return { skipped: true, reason: 'no_resend_key' }

  const supabase = getSupabase()
  const { data: orderRow } = orderId
    ? await supabase.from('mini_nous_orders').select('customer_name, metadata').eq('id', orderId).maybeSingle()
    : { data: null }
  const firstName = resolveCustomerFirstName({
    customerName,
    customer_name: orderRow?.customer_name,
    metadata: orderRow?.metadata,
  })

  const site = getSiteUrl(req)
  const orderUrl = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`

  try {
    const body = await sendResendEmail({
      apiKey,
      from,
      to: [email],
      subject: friendlyEmailSubject(firstName, 'on reprend ton tracé — 24 h max ⏳'),
      html: buildRevisionAckHtml({
        customerFirstName: firstName,
        customerName: customerName ?? orderRow?.customer_name,
        packLabel: packLabel || 'MiniNous',
        orderUrl,
      }),
    })
    return { ok: true, id: body.id }
  } catch (err) {
    console.error('[order-email revision-ack]', err)
    return { ok: false, error: err.message }
  }
}

export async function sendFabricationCompleteEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, previewUrl, sourcePhotoUrl,
  lineartVersion = 1, customerName, shipDate,
}) {
  if (!email || !accessToken) return { skipped: true, reason: 'missing_email_or_token' }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>'
  if (!apiKey) return { skipped: true, reason: 'no_resend_key' }

  const supabase = getSupabase()
  const { data: orderRow } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, customer_name')
    .eq('id', orderId)
    .maybeSingle()

  if (orderRow?.metadata?.fabrication_email_sent_at) {
    return { skipped: true, reason: 'already_sent' }
  }

  const firstName = resolveCustomerFirstName({
    customerName,
    customer_name: orderRow?.customer_name,
    metadata: orderRow?.metadata,
  })
  const site = getSiteUrl(req)
  const orderUrl = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`
  const shipLabel = formatDeliveryDateFr(shipDate)

  const body = await sendResendEmail({
    apiKey,
    from,
    to: [email],
    subject: friendlyEmailSubject(firstName, 'tes MiniNous sont prêts à l\'atelier ✂️'),
    html: buildFabricationCompleteHtml({
      customerFirstName: firstName,
      customerName: customerName ?? orderRow?.customer_name,
      packLabel: packLabel || 'MiniNous',
      faceCount: faceCount || 2,
      orderUrl,
      previewUrl,
      sourcePhotoUrl,
      lineartVersion,
      customerName,
      shipLabel,
    }),
  })

  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(orderRow?.metadata ?? {}),
        fabrication_email_sent_at: sentAt,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}

export async function sendShippedEmailIfNeeded(req, {
  orderId, email, accessToken, packLabel, faceCount, previewUrl, sourcePhotoUrl,
  lineartVersion = 1, customerName, loyaltyCouponCode,
}) {
  if (!email || !accessToken) return { skipped: true, reason: 'missing_email_or_token' }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Les MiniNous <commandes@mininous.app>'
  if (!apiKey) return { skipped: true, reason: 'no_resend_key' }

  const supabase = getSupabase()
  const { data: orderRow } = await supabase
    .from('mini_nous_orders')
    .select('id, metadata, customer_name')
    .eq('id', orderId)
    .maybeSingle()

  if (orderRow?.metadata?.shipped_email_sent_at) {
    return { skipped: true, reason: 'already_sent' }
  }

  const firstName = resolveCustomerFirstName({
    customerName,
    customer_name: orderRow?.customer_name,
    metadata: orderRow?.metadata,
  })
  const site = getSiteUrl(req)
  const orderUrl = `${site}/pipeline/commande?order=${encodeURIComponent(accessToken)}`
  const couponCode = loyaltyCouponCode ?? orderRow?.metadata?.loyalty_coupon_code

  const body = await sendResendEmail({
    apiKey,
    from,
    to: [email],
    subject: friendlyEmailSubject(firstName, 'ton colis MiniNous est en route 📦'),
    html: buildShippedHtml({
      customerFirstName: firstName,
      customerName: customerName ?? orderRow?.customer_name,
      packLabel: packLabel || 'MiniNous',
      faceCount: faceCount || 2,
      orderUrl,
      previewUrl,
      sourcePhotoUrl,
      lineartVersion,
      customerName,
      loyaltyCouponCode: couponCode,
    }),
  })

  const sentAt = new Date().toISOString()
  await supabase
    .from('mini_nous_orders')
    .update({
      metadata: {
        ...(orderRow?.metadata ?? {}),
        shipped_email_sent_at: sentAt,
      },
      updated_at: sentAt,
    })
    .eq('id', orderId)

  return { ok: true, id: body.id }
}
