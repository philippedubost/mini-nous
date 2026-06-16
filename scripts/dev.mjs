import { createServer } from 'node:net'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { startApiServer } from './lib/vercel-req.mjs'
import { startGateway } from './gateway.mjs'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const rootDir = join(scriptsDir, '..')

function isFree(port) {
  return new Promise(resolve => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)))
  })
}

async function getFreePort(preferred) {
  for (let p = preferred; p < preferred + 30; p++) {
    if (await isFree(p)) return p
  }
  throw new Error(`Aucun port libre à partir de ${preferred}`)
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

async function loadHandler(relPath) {
  return (await import(pathToFileURL(join(rootDir, relPath)).href)).default
}

async function main() {
  loadEnv()

  // WebSocket pour Supabase en Node < 22
  try {
    const ws = (await import('ws')).default
    if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws
  } catch { /* ws optionnel si déjà polyfillé */ }

  const PORT = await getFreePort(Number(process.env.PORT) || 3333)
  const VITE_PORT = await getFreePort(3400)
  const API_PORT = await getFreePort(3500)

  const [fal, generations, uploadR2, proxyImage, traceAutotrace] = await Promise.all([
    loadHandler('api/fal.js'),
    loadHandler('api/generations.js'),
    loadHandler('api/upload-r2.js'),
    loadHandler('api/proxy-image.js'),
    loadHandler('api/trace-autotrace.js'),
  ])

  await startApiServer({
    port: API_PORT,
    routes: {
      fal, generations, 'upload-r2': uploadR2, 'proxy-image': proxyImage, 'trace-autotrace': traceAutotrace,
    },
  })
  console.log(`[api]   http://127.0.0.1:${API_PORT}/api/`)

  const vite = spawn('npx', ['vite'], {
    cwd: join(rootDir, 'pipeline'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, MINI_NOUS_API_PORT: String(API_PORT), VITE_PORT: String(VITE_PORT) },
  })

  vite.on('exit', code => process.exit(code ?? 0))

  await new Promise(r => setTimeout(r, 1500))

  await startGateway({ port: PORT, apiPort: API_PORT, vitePort: VITE_PORT })

  console.log('')
  console.log(`  Mini-Nous → http://localhost:${PORT}`)
  console.log(`    /              landing`)
  console.log(`    /pipeline/     générateur`)
  console.log(`    /pipeline/admin admin`)
  console.log('')

  const shutdown = () => { vite.kill(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
