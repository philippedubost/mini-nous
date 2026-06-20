async function readStream(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

function readNodeBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readRawBody(req) {
  if (typeof req[Symbol.asyncIterator] === 'function') {
    return readStream(req)
  }
  if (typeof req.on === 'function') {
    return readNodeBody(req)
  }
  return Buffer.alloc(0)
}

/** Corps JSON normalisé (objet), y compris si req.body est encore une string. */
export function getJsonBody(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  if (req.rawBody?.length) {
    try {
      return JSON.parse(req.rawBody.toString('utf8'))
    } catch {
      return {}
    }
  }
  return {}
}

/** Normalize body + rawBody for unified router (Stripe webhook needs raw bytes). */
export async function prepareRequest(req) {
  if (req.rawBody != null) {
    if (req.body == null && req.rawBody.length) {
      const ct = req.headers['content-type'] || ''
      if (ct.includes('application/json') || req.rawBody[0] === 0x7b) {
        try {
          req.body = JSON.parse(req.rawBody.toString('utf8'))
        } catch {
          req.body = undefined
        }
      }
    }
    return
  }

  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body
  } else if (typeof req.body === 'string') {
    req.rawBody = Buffer.from(req.body)
    const ct = req.headers['content-type'] || ''
    if (ct.includes('application/json') || req.body.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(req.body)
      } catch {
        req.body = undefined
      }
    }
  } else if (req.body != null && typeof req.body === 'object') {
    req.rawBody = Buffer.from(JSON.stringify(req.body))
    return
  } else {
    req.rawBody = await readRawBody(req)
  }

  const ct = req.headers['content-type'] || ''
  if (req.body == null && req.rawBody.length && (ct.includes('application/json') || req.rawBody[0] === 0x7b)) {
    try {
      req.body = JSON.parse(req.rawBody.toString('utf8'))
    } catch {
      req.body = undefined
    }
  }
}
