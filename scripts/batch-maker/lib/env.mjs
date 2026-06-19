import { loadEnv } from '../../lib/load-env.mjs'

export { loadEnv }

export function parseArgs(argv) {
  const args = { week: null, kerf: Number(process.env.BATCH_KERF_MM) || -0.1, dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--week' && argv[i + 1]) { args.week = argv[++i]; continue }
    if (argv[i] === '--kerf' && argv[i + 1]) { args.kerf = Number(argv[++i]); continue }
    if (argv[i] === '--dry-run') args.dryRun = true
  }
  return args
}
