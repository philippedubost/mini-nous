import { createServer } from 'node:http'
import { parse as parseUrl } from 'node:url'

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString()
      if (!raw) return resolve(undefined)
      const ct = req.headers['content-type'] || ''
      if (ct.includes('application/json')) {
        try { resolve(JSON.parse(raw)) } catch { resolve(undefined) }
      } else {
        resolve(raw)
      }
    })
    req.on('error', reject)
  })
}

export function createVercelRes(nodeRes) {
  let statusCode = 200
  return {
    setHeader(name, value) {
      nodeRes.setHeader(name, value)
    },
    status(code) {
      statusCode = code
      return this
    },
    json(data) {
      if (!nodeRes.headersSent) {
        nodeRes.statusCode = statusCode
        nodeRes.setHeader('Content-Type', 'application/json')
      }
      nodeRes.end(JSON.stringify(data))
    },
    send(data) {
      if (!nodeRes.headersSent) nodeRes.statusCode = statusCode
      nodeRes.end(data)
    },
    end(data) {
      if (!nodeRes.headersSent) nodeRes.statusCode = statusCode
      nodeRes.end(data)
    },
  }
}

export async function handleApiRequest(nodeReq, nodeRes, handler) {
  const url = parseUrl(nodeReq.url, true)
  const body = await readBody(nodeReq)
  const req = {
    method: nodeReq.method,
    headers: nodeReq.headers,
    query: url.query,
    body,
  }
  const res = createVercelRes(nodeRes)
  await handler(req, res)
}

export function startApiServer({ port, routes }) {
  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      const url = parseUrl(nodeReq.url, true)
      const match = url.pathname?.match(/^\/api\/([^/?]+)/)
      if (!match) {
        nodeRes.writeHead(404, { 'Content-Type': 'application/json' })
        nodeRes.end(JSON.stringify({ error: 'Not found' }))
        return
      }
      const handler = routes[match[1]]
      if (!handler) {
        nodeRes.writeHead(404, { 'Content-Type': 'application/json' })
        nodeRes.end(JSON.stringify({ error: `Unknown API: ${match[1]}` }))
        return
      }
      await handleApiRequest(nodeReq, nodeRes, handler)
    } catch (err) {
      console.error('[api]', err)
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(500, { 'Content-Type': 'application/json' })
        nodeRes.end(JSON.stringify({ error: err.message || 'Server error' }))
      }
    }
  })

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}
