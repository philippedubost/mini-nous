import { BUILD_INFO } from '../lib/buildInfo.generated.js'

export function formatBuildFooterLine(info = BUILD_INFO) {
  if (!info?.version) return null
  const when = info.committedAtLabel || info.committedAt || '—'
  return `v${info.version} · ${when}`
}

export default function AppBuildFooter({ variant = 'light', showCommit = false }) {
  const info = BUILD_INFO
  if (!info?.version) return null

  const when = info.committedAtLabel || info.committedAt || '—'
  const commitId = info.commitId || info.version

  return (
    <footer className={`app-build-footer app-build-footer--${variant}`} aria-label="Version de l'application">
      <span>Les MiniNous</span>
      <span className="app-build-footer-sep" aria-hidden> · </span>
      {showCommit ? (
        <>
          <span>
            commit{' '}
            <code className="font-mono text-[10px] tracking-tight" title={info.fullCommitId || commitId}>
              {commitId}
            </code>
          </span>
          <span className="app-build-footer-sep" aria-hidden> · </span>
          <time dateTime={info.committedAt || undefined}>{when}</time>
        </>
      ) : (
        <span>{formatBuildFooterLine(info)}</span>
      )}
    </footer>
  )
}
