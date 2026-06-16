import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:http'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MIME = {
  '.html': 'text/html',
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
  if (path === '/') path = '/index.html'
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

export function startGateway({ port, apiPort, vitePort }) {
  const server = createServer((req, res) => {
    const path = req.url?.split('?')[0] || ''
    if (path.startsWith('/api/')) return proxy(req, res, apiPort)
    if (path.startsWith('/pipeline')) return proxy(req, res, vitePort)
    return serveStatic(req, res)
  })

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}
