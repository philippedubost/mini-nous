import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..')

export function loadEnv() {
  const envPath = join(rootDir, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    const key = trimmed.slice(0, i).trim()
    const val = trimmed.slice(i + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

export function parseArgs(argv) {
  const args = { week: null, kerf: Number(process.env.BATCH_KERF_MM) || -0.1, dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--week' && argv[i + 1]) { args.week = argv[++i]; continue }
    if (argv[i] === '--kerf' && argv[i + 1]) { args.kerf = Number(argv[++i]); continue }
    if (argv[i] === '--dry-run') args.dryRun = true
  }
  return args
}
