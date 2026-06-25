import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = join(root, '..', '..', '..', '.cursor', 'projects', 'c-Users-pdubo-Documents-Github-mini-nous', 'assets')
const outDir = join(root, 'images', 'fondateurs')
mkdirSync(outDir, { recursive: true })

const SOURCES = [
  ['c__Users_pdubo_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-15806481-f88c-491b-b709-6acffb2afa97.png', 'fondateurs-01.webp'],
  ['c__Users_pdubo_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-83bf5550-6033-48ec-82b5-e389d257201b.png', 'fondateurs-02.webp'],
  ['c__Users_pdubo_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-2acbfb0f-2cff-497c-9a26-0a4fe647d311.png', 'fondateurs-03.webp'],
  ['c__Users_pdubo_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_Both-a4d94452-acbd-4c52-aec0-a498318c6e42.png', 'fondateurs-04.webp'],
]

for (const [srcName, destName] of SOURCES) {
  const src = join(assetsDir, srcName)
  const dest = join(outDir, destName)
  const meta = await sharp(src).metadata()
  const pipeline = sharp(src).rotate()
  const maxSide = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (maxSide > 1400) {
    pipeline.resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
  }
  await pipeline.webp({ quality: 82, effort: 4 }).toFile(dest)
  const out = await sharp(dest).metadata()
  console.log(`${destName} · ${out.width}×${out.height}`)
}
