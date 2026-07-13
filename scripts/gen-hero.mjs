import sharp from 'sharp'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/gen-hero.mjs <source-image>')
  process.exit(1)
}

const outDir = join(root, 'images')
const heronew = join(outDir, 'heronew.webp')
const zoom = join(outDir, 'heronewZoom.webp')

const base = sharp(src).rotate()

// Hero 4/5 — crop centré (enveloppe + figurines visibles mobile & desktop)
await base.clone()
  .resize(1200, 1500, { fit: 'cover', position: 'centre' })
  .webp({ quality: 84, effort: 6 })
  .toFile(heronew)

// Variante zoom — crop centré serré
await base.clone()
  .resize(900, 900, { fit: 'cover', position: 'centre' })
  .webp({ quality: 84, effort: 6 })
  .toFile(zoom)

for (const f of [heronew, zoom]) {
  const s = statSync(f)
  console.log(`✓ ${f.replace(root + '/', '')} — ${Math.round(s.size / 1024)} KB`)
}
