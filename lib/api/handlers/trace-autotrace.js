import { writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

function parseBase64(data) {
  const match = data.match(/^data:[\w+./-]+;base64,(.+)$/)
  const raw = match ? match[1] : data
  return Buffer.from(raw, 'base64')
}

function runAutotrace(inputPath, outputPath, opts) {
  return new Promise((resolve, reject) => {
    const args = [
      inputPath,
      '-centerline',
      '-output-format', 'svg',
      '-output-file', outputPath,
      '-color-count', '2',
      '-despeckle-level', String(opts.despeckleLevel ?? 0),
      '-filter-iterations', String(opts.filterIterations ?? 0),
      '-error-threshold', String(opts.errorThreshold ?? 2),
      '-line-threshold', String(opts.lineThreshold ?? 1),
      '-corner-threshold', String(opts.cornerThreshold ?? 60),
    ]

    const proc = spawn('autotrace', args, { shell: process.platform === 'win32' })
    let stderr = ''
    proc.stderr.on('data', c => { stderr += c.toString() })
    proc.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error('autotrace introuvable — installez-le localement (MSYS2, Linux: autotrace)'))
      } else {
        reject(err)
      }
    })
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `autotrace exit ${code}`))
    })
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { base64, opts = {} } = req.body ?? {}
  if (!base64) return res.status(400).json({ error: 'base64 requis' })

  const id = randomUUID()
  const inputPath = join(tmpdir(), `mini-nous-trace-${id}.png`)
  const outputPath = join(tmpdir(), `mini-nous-trace-${id}.svg`)

  try {
    await writeFile(inputPath, parseBase64(base64))
    await runAutotrace(inputPath, outputPath, opts)
    const svg = await readFile(outputPath, 'utf8')
    return res.status(200).json({ svg, engine: 'autotrace' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Trace failed'
    const code = msg.includes('introuvable') ? 501 : 500
    return res.status(code).json({ error: msg })
  } finally {
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}
