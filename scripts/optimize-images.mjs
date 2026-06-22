import sharp from 'sharp'
import { existsSync } from 'node:fs'
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

/** Image Open Graph 1200×630 + icône iOS pour partage WhatsApp / Facebook. */
async function generateOgShare() {
  const src = join(imagesDir, 'famille4-objet.webp')
  if (!existsSync(src)) return
  const destWebp = join(imagesDir, 'og-share.webp')
  const destJpg = join(imagesDir, 'og-share.jpg')
  await sharp(src)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .webp({ quality: 86, effort: 4 })
    .toFile(destWebp)
  console.log('og-share', basename(destWebp))
  await sharp(src)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(destJpg)
  console.log('og-share', basename(destJpg))
  const touch = join(imagesDir, 'apple-touch-icon.webp')
  await sharp(src)
    .resize(180, 180, { fit: 'cover', position: 'centre' })
    .webp({ quality: 86, effort: 4 })
    .toFile(touch)
  console.log('apple-touch-icon', basename(touch))
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
await generateOgShare()
console.log('done')
