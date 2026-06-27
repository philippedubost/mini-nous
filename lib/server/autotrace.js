import { writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

export function parseBase64Image(data) {
  const match = data.match(/^data:[\w+./-]+;base64,(.+)$/)
  const raw = match ? match[1] : data
  return Buffer.from(raw, 'base64')
}

export function runAutotrace(inputPath, outputPath, opts = {}) {
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

/** Trace un buffer PNG → SVG string (autotrace CLI). */
export async function tracePngBuffer(pngBuffer, opts = {}) {
  const id = randomUUID()
  const inputPath = join(tmpdir(), `mini-nous-trace-${id}.png`)
  const outputPath = join(tmpdir(), `mini-nous-trace-${id}.svg`)

  try {
    await writeFile(inputPath, pngBuffer)
    await runAutotrace(inputPath, outputPath, opts)
    return await readFile(outputPath, 'utf8')
  } finally {
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}
