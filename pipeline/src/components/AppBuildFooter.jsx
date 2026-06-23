import { BUILD_INFO } from '../lib/buildInfo.generated.js'

export function formatBuildFooterLine(info = BUILD_INFO) {
  if (!info?.version) return null
  const when = info.committedAtLabel || info.committedAt || '—'
  return `v${info.version} · ${when}`
}

export default function AppBuildFooter({ variant = 'light' }) {
  const line = formatBuildFooterLine()
  if (!line) return null

  return (
    <footer className={`app-build-footer app-build-footer--${variant}`} aria-label="Version de l'application">
      <span>Les MiniNous</span>
      <span className="app-build-footer-sep" aria-hidden> · </span>
      <span>{line}</span>
    </footer>
  )
}
