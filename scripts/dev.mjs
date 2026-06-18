import { createServer } from 'node:net'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { startGateway } from './gateway.mjs'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const rootDir = join(scriptsDir, '..')
const PORT = Number(process.env.PORT) || 3333
const VITE_PORT = Number(process.env.VITE_PORT) || 3400

function isFree(port) {
  return new Promise(resolve => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)))
  })
}

function loadEnv() {
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

async function waitForVite(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/pipeline/`)
      if (res.ok) return
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`Vite interne : pas de réponse sur 127.0.0.1:${port}`)
}

async function requirePort(port, label) {
  if (await isFree(port)) return
  throw new Error(`${label} : le port ${port} est déjà utilisé. Arrêtez l'autre serveur (Ctrl+C) puis relancez.`)
}

async function loadApiRoutes() {
  const { routes } = await import(pathToFileURL(join(rootDir, 'lib/api/router.js')).href)
  return routes
}

async function main() {
  loadEnv()

  try {
    const ws = (await import('ws')).default
    if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws
  } catch { /* ws optionnel */ }

  await requirePort(PORT, 'Gateway')
  await requirePort(VITE_PORT, 'Vite (interne)')

  const apiRoutes = await loadApiRoutes()
  console.log(`  API routes: ${Object.keys(apiRoutes).sort().join(', ')}`)

  const vite = spawn('npx', ['vite', '--logLevel', 'error'], {
    cwd: join(rootDir, 'pipeline'),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_PORT: String(VITE_PORT),
      MINI_NOUS_API_PORT: String(PORT),
    },
  })

  vite.on('exit', code => process.exit(code ?? 0))

  await waitForVite(VITE_PORT)

  await startGateway({ port: PORT, vitePort: VITE_PORT, apiRoutes })

  console.log('')
  console.log(`  Mini-Nous → http://localhost:${PORT}`)
  console.log(`    /              landing`)
  console.log(`    /pipeline/     générateur + labo + admin`)
  console.log('')

  const shutdown = () => { vite.kill(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
