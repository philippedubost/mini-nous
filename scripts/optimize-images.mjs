import sharp from 'sharp'
import { readdir, stat } from 'node:fs/promises'
import { join, extname, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const imagesDir = join(root, 'images')

const SKIP = new Set(['.svg', '.webp'])
const CONVERT_EXT = new Set(['.jpg', '.jpeg', '.png'])

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) files.push(...await walk(p))
    else files.push(p)
  }
  return files
}

async function toWebp(src) {
  const ext = extname(src).toLowerCase()
  if (SKIP.has(ext)) return null
  if (!CONVERT_EXT.has(ext)) return null

  const dest = src.replace(/\.(jpe?g|png)$/i, '.webp')
  const info = await stat(src)
  const existing = await stat(dest).catch(() => null)
  if (existing && existing.mtimeMs >= info.mtimeMs) {
    console.log('skip (fresh)', basename(dest))
    return dest
  }

  await sharp(src)
    .webp({ quality: 82, effort: 4 })
    .toFile(dest)
  console.log('webp', basename(dest))
  return dest
}

/** Renomme les posts UGC CapCut en noms stables. */
async function normalizeSocial() {
  const socialDir = join(imagesDir, 'social')
  const files = await readdir(socialDir).catch(() => [])
  const capcut = files
    .filter(f => /^2026-06-19.*\.png$/i.test(f))
    .sort()
  for (let i = 0; i < capcut.length; i++) {
    const src = join(socialDir, capcut[i])
    const dest = join(socialDir, `ugc-${String(i + 1).padStart(2, '0')}.webp`)
    await sharp(src).webp({ quality: 82, effort: 4 }).toFile(dest)
    console.log('ugc', basename(dest))
  }
}

const files = await walk(imagesDir)
for (const f of files) await toWebp(f)
await normalizeSocial()
console.log('done')
