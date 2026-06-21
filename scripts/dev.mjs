import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { startGateway } from './gateway.mjs'
import { loadEnv } from './lib/load-env.mjs'
import { warnIfSupabaseUnreachable, isSupabaseReachable } from './lib/supabase-check.mjs'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const rootDir = join(scriptsDir, '..')
const pipelineDir = join(rootDir, 'pipeline')
const PORT = Number(process.env.PORT) || 3333
const VITE_PORT = Number(process.env.VITE_PORT) || 3400

function isFree(port) {
  return new Promise(resolve => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)))
  })
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} failed (exit ${code})`))
    })
  })
}

async function ensurePipelineDeps() {
  const vitePkg = join(pipelineDir, 'node_modules', 'vite', 'package.json')
  if (existsSync(vitePkg)) return
  console.log('  Dépendances pipeline manquantes — npm install dans pipeline/…')
  await runCommand('npm', ['install'], pipelineDir)
}

async function waitForVite(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
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
  await warnIfSupabaseUnreachable()
  if (!isSupabaseReachable()) {
    process.env.SUPABASE_REACHABLE = '0'
  }
  await ensurePipelineDeps()

  try {
    const ws = (await import('ws')).default
    if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws
  } catch { /* ws optionnel */ }

  await requirePort(PORT, 'Gateway')
  await requirePort(VITE_PORT, 'Vite (interne)')

  const apiRoutes = await loadApiRoutes()
  console.log(`  API routes: ${Object.keys(apiRoutes).sort().join(', ')}`)

  const vite = spawn('npm', ['run', 'dev'], {
    cwd: pipelineDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_PORT: String(VITE_PORT),
      MINI_NOUS_API_PORT: String(PORT),
      SUPABASE_REACHABLE: process.env.SUPABASE_REACHABLE || '1',
    },
  })

  vite.on('exit', code => process.exit(code ?? 0))

  await waitForVite(VITE_PORT)

  await startGateway({ port: PORT, vitePort: VITE_PORT, apiRoutes, devReload: true })

  console.log('')
  console.log(`  Mini-Nous → http://localhost:${PORT}`)
  console.log(`    /              landing`)
  console.log(`    /pipeline/     studio client + compte`)
  console.log(`    /admin/        admin + carte produit`)
  console.log('')

  const shutdown = () => { vite.kill(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
