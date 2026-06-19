import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..')

function parseEnvFile(filePath, { override = true } = {}) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    const key = trimmed.slice(0, i).trim()
    const val = trimmed.slice(i + 1).trim()
    if (override || !process.env[key]) process.env[key] = val
  }
}

/** Charge .env / .env.local / env — les fichiers écrasent les variables shell existantes. */
export function loadEnv() {
  parseEnvFile(join(rootDir, '.env'))
  parseEnvFile(join(rootDir, '.env.local'))
  parseEnvFile(join(rootDir, 'env'))
}
