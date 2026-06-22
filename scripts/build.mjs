import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')
const pipelineDist = join(root, 'pipeline', 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

cpSync(join(root, 'index.html'), join(dist, 'index.html'))
for (const f of ['robots.txt', 'sitemap.xml']) {
  const src = join(root, f)
  if (existsSync(src)) cpSync(src, join(dist, f))
}
if (existsSync(join(root, 'images'))) {
  cpSync(join(root, 'images'), join(dist, 'images'), { recursive: true })
}

execSync('npm run build', { cwd: join(root, 'pipeline'), stdio: 'inherit', shell: true })

mkdirSync(join(dist, 'pipeline'), { recursive: true })
mkdirSync(join(dist, 'admin'), { recursive: true })

if (existsSync(join(pipelineDist, 'assets'))) {
  cpSync(join(pipelineDist, 'assets'), join(dist, 'assets'), { recursive: true })
}
cpSync(join(pipelineDist, 'index.html'), join(dist, 'pipeline', 'index.html'))
cpSync(join(pipelineDist, 'admin.html'), join(dist, 'admin', 'index.html'))

console.log('✓ dist/ prêt (landing + pipeline + admin)')
