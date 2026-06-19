import ffmpegPath from 'ffmpeg-static'
import { spawnSync } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'images', 'MiniNous.mp4')
const outMp4 = join(root, 'images', 'mininous-atelier.mp4')
const outWebm = join(root, 'images', 'mininous-atelier.webm')

function run(args) {
  const r = spawnSync(ffmpegPath, args, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`)
}

async function main() {
  await stat(src)
  console.log('Optimizing', src)

  run([
    '-y', '-i', src,
    '-an',
    '-vf', 'scale=min(1280\\,iw):-2',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    outMp4,
  ])

  run([
    '-y', '-i', src,
    '-an',
    '-vf', 'scale=min(1280\\,iw):-2',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33',
    '-row-mt', '1',
    outWebm,
  ])

  const [a, b] = await Promise.all([stat(outMp4), stat(outWebm)])
  console.log('Done:', outMp4, `${(a.size / 1024 / 1024).toFixed(2)} MB`)
  console.log('Done:', outWebm, `${(b.size / 1024 / 1024).toFixed(2)} MB`)
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
