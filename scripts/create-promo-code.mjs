/**
 * Crée un coupon Stripe + code promo associé.
 *
 * Usage :
 *   node scripts/create-promo-code.mjs BETATEST 100
 *   node scripts/create-promo-code.mjs LAUNCH50 50
 *   node scripts/create-promo-code.mjs REMISE10 --amount 10
 *
 * Arguments :
 *   $1  Code promo (ex. BETATEST)  — obligatoire
 *   $2  Pourcentage de remise      — obligatoire sauf si --amount est utilisé
 *   --amount <€>  Remise en euros à la place du %
 *   --max <n>     Nombre max d'utilisations (défaut : illimité)
 *   --expires YYYY-MM-DD
 *
 * Prérequis : .env à la racine avec STRIPE_SECRET_KEY ou STRIPE_SECRET_KEY_TEST
 */

import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// Charge .env manuellement (pas de dotenv requis)
const envFile = join(root, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const require = createRequire(import.meta.url)
let Stripe
try {
  Stripe = require('stripe')
} catch {
  console.error('Installez les dépendances : npm install')
  process.exit(1)
}

const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST
if (!key) {
  console.error('❌  STRIPE_SECRET_KEY (ou STRIPE_SECRET_KEY_TEST) manquant dans .env')
  process.exit(1)
}

const stripe = new Stripe(key)
const args = process.argv.slice(2)

const code = args[0]?.toUpperCase()
if (!code) {
  console.error('Usage : node scripts/create-promo-code.mjs CODE PERCENT\n       node scripts/create-promo-code.mjs CODE --amount EUR')
  process.exit(1)
}

const amountIdx = args.indexOf('--amount')
const maxIdx = args.indexOf('--max')
const expiresIdx = args.indexOf('--expires')

const percentOff = amountIdx === -1 ? parseFloat(args[1]) : null
const amountOffEur = amountIdx !== -1 ? parseFloat(args[amountIdx + 1]) : null
const maxRedemptions = maxIdx !== -1 ? parseInt(args[maxIdx + 1]) : null
const expiresAt = expiresIdx !== -1 ? args[expiresIdx + 1] : null

if (percentOff == null && amountOffEur == null) {
  console.error('Spécifiez une remise : BETATEST 100  ou  BETATEST --amount 15')
  process.exit(1)
}

// Vérifie si le code existe déjà
const existing = await stripe.promotionCodes.list({ code, limit: 1 })
if (existing.data.length > 0) {
  const p = existing.data[0]
  console.log(`⚠️   Le code "${code}" existe déjà (${p.active ? 'actif' : 'inactif'})`)
  console.log(`    Coupon : ${p.coupon.percent_off ? p.coupon.percent_off + '%' : (p.coupon.amount_off / 100).toFixed(2) + ' €'}`)
  console.log(`    Utilisations : ${p.times_redeemed}${p.max_redemptions ? '/' + p.max_redemptions : ''}`)
  process.exit(0)
}

// Crée le coupon
const couponParams = {
  duration: 'once',
  ...(percentOff != null ? { percent_off: percentOff } : {}),
  ...(amountOffEur != null ? { amount_off: Math.round(amountOffEur * 100), currency: 'eur' } : {}),
  ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
}
const coupon = await stripe.coupons.create(couponParams)

// Crée le code promo
const promoParams = {
  coupon: coupon.id,
  code,
  ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
  ...(expiresAt ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
}
const promo = await stripe.promotionCodes.create(promoParams)

const discount = percentOff != null ? `${percentOff}%` : `${amountOffEur} €`
const modeLabel = key.startsWith('sk_live') ? '🔴 LIVE' : '🟡 TEST'

console.log(`\n✅  Code promo créé (${modeLabel})`)
console.log(`    Code     : ${promo.code}`)
console.log(`    Remise   : ${discount}`)
console.log(`    Max util : ${maxRedemptions ?? 'illimité'}`)
console.log(`    Expire   : ${expiresAt ?? 'jamais'}`)
console.log(`    Coupon ID: ${coupon.id}`)
console.log(`    Promo ID : ${promo.id}\n`)
