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

/** Normalize body + rawBody for unified router (Stripe webhook needs raw bytes). */
export async function prepareRequest(req) {
  if (req.rawBody != null) {
    if (req.body == null && req.rawBody.length) {
      const ct = req.headers['content-type'] || ''
      if (ct.includes('application/json')) {
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
  } else if (req.body != null && typeof req.body === 'object') {
    req.rawBody = Buffer.from(JSON.stringify(req.body))
    return
  } else {
    req.rawBody = await readRawBody(req)
  }

  const ct = req.headers['content-type'] || ''
  if (ct.includes('application/json') && req.rawBody.length) {
    try {
      req.body = JSON.parse(req.rawBody.toString('utf8'))
    } catch {
      req.body = undefined
    }
  }
}
