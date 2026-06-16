import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

cpSync(join(root, 'index.html'), join(dist, 'index.html'))
if (existsSync(join(root, 'images'))) {
  cpSync(join(root, 'images'), join(dist, 'images'), { recursive: true })
}

execSync('npm run build', { cwd: join(root, 'pipeline'), stdio: 'inherit', shell: true })
cpSync(join(root, 'pipeline', 'dist'), join(dist, 'pipeline'), { recursive: true })

console.log('✓ dist/ prêt (landing + pipeline)')
