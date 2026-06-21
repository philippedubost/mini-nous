import sharp from 'sharp'
import { readdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const imagesDir = join(root, 'images')

/** Tailles d’affichage landing (×2 pour retina). */
const VARIANTS = [
  { suffix: '-thumb', width: 560 },
  { suffix: '-wide-thumb', width: 960 },
]

async function generateThumbs() {
  const files = (await readdir(imagesDir)).filter((f) => /-lineart\.webp$/i.test(f))
  for (const file of files) {
    const src = join(imagesDir, file)
    const info = await stat(src)
    for (const { suffix, width } of VARIANTS) {
      const destName = file.replace(/-lineart\.webp$/i, `-lineart${suffix}.webp`)
      const dest = join(imagesDir, destName)
      const existing = await stat(dest).catch(() => null)
      if (existing && existing.mtimeMs >= info.mtimeMs) {
        console.log('skip', destName)
        continue
      }
      await sharp(src)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 90, effort: 4 })
        .toFile(dest)
      const meta = await sharp(dest).metadata()
      console.log('ok', destName, `${meta.width}×${meta.height}`)
    }
  }
}

await generateThumbs()
console.log('done')
