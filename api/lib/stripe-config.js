function isTruthy(v) {
  return v === '1' || v === 'true' || v === 'yes'
}

/** true → STRIPE_*_TEST ; false → STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (live) */
export function useStripeTestMode() {
  if (isTruthy(process.env.STRIPE_USE_TEST)) return true
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv === 'preview' || vercelEnv === 'development') return true
  return false
}

export function getStripeSecretKey() {
  if (useStripeTestMode()) {
    const key = process.env.STRIPE_SECRET_KEY_TEST
    if (!key) throw new Error('STRIPE_SECRET_KEY_TEST non configurée (mode test actif)')
    return key
  }
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY non configurée')
  return key
}

export function getStripeWebhookSecret() {
  if (useStripeTestMode()) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET_TEST
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET_TEST non configurée (mode test actif)')
    return secret
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET non configurée')
  return secret
}

export function getStripeModeLabel() {
  return useStripeTestMode() ? 'test' : 'live'
}
