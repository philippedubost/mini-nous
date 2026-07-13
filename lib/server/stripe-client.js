import Stripe from 'stripe'
import { getStripeSecretKey } from './stripe-config.js'

let client = null
let clientKey = null

export function getStripe() {
  const key = getStripeSecretKey()
  if (!client || clientKey !== key) {
    client = new Stripe(key)
    clientKey = key
  }
  return client
}

const CANONICAL_SITE_URL = 'https://www.woodtribe.fr'

export function getSiteUrl(req) {
  if (process.env.VERCEL_ENV === 'production') {
    return CANONICAL_SITE_URL
  }
  const fromEnv = process.env.SITE_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host
  const proto = req?.headers?.['x-forwarded-proto'] || 'http'
  if (host) return `${proto}://${host}`
  return 'http://localhost:3333'
}
