import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:http'
import { handleApiRequest } from './lib/vercel-req.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function proxy(req, res, port) {
  const opts = {
    hostname: '127.0.0.1',
    port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${port}` },
  }
  const upstream = httpRequest(opts, up => {
    res.writeHead(up.statusCode, up.headers)
    up.pipe(res)
  })
  upstream.on('error', err => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end(`Proxy error: ${err.message}`)
    }
  })
  req.pipe(upstream)
}

function serveStatic(req, res) {
  let path = req.url?.split('?')[0] || '/'
  if (path === '/' || path === '/mes-figurines') path = '/index.html'
  const filePath = join(root, path.replace(/^\//, ''))
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const ext = extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(filePath))
}

function isViteDevAsset(path) {
  if (path === '/index.html' || path === '/admin.html') return true
  if (path.startsWith('/assets/')) return true
  if (path.startsWith('/src/')) return true
  if (path.startsWith('/@')) return true
  if (path.startsWith('/node_modules/')) return true
  return false
}

function proxySpa(req, res, vitePort, { stripPrefix, spaFile }) {
  const raw = req.url?.split('?')[0] || '/'
  const query = req.url?.includes('?') ? `?${req.url.split('?')[1]}` : ''
  let rest = raw
  if (stripPrefix && raw.startsWith(stripPrefix)) {
    rest = raw.slice(stripPrefix.length) || '/'
  }
  const hasExt = extname(rest) && extname(rest) !== ''
  req.url = hasExt ? `${rest}${query}` : `${spaFile}${query}`
  return proxy(req, res, vitePort)
}

export function startGateway({ port, vitePort, apiRoutes, devReload = false }) {
  async function resolveHandler(name) {
    if (devReload) {
      const { routes } = await import(
        `${pathToFileURL(join(root, 'lib/api/router.js')).href}?r=${Date.now()}`
      )
      return routes[name]
    }
    return apiRoutes[name]
  }

  const server = createServer(async (req, res) => {
    const path = req.url?.split('?')[0] || ''
    if (path.startsWith('/api/')) {
      try {
        const match = path.match(/^\/api\/([^/?]+)/)
        const handler = match ? await resolveHandler(match[1]) : null
        if (!handler) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Unknown API: ${match?.[1] ?? path}` }))
          return
        }
        await handleApiRequest(req, res, handler)
      } catch (err) {
        console.error('[api]', err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || 'Server error' }))
        }
      }
      return
    }
    if (path.startsWith('/admin')) {
      return proxySpa(req, res, vitePort, { stripPrefix: '/admin', spaFile: '/admin.html' })
    }
    if (path.startsWith('/pipeline')) {
      return proxySpa(req, res, vitePort, { stripPrefix: '/pipeline', spaFile: '/index.html' })
    }
    if (isViteDevAsset(path)) {
      return proxy(req, res, vitePort)
    }
    return serveStatic(req, res)
  })

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}
