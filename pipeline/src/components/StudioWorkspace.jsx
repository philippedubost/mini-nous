import { useEffect, useState } from 'react'
import { ImageWithZoom } from './ImageLightbox'

const PROGRESS_DURATION_MS = 4 * 60 * 1000
const PROGRESS_CAP = 94

/** Avance vite au début, ralentit vers ~94 % à 4 min (placeholder, pas le vrai statut). */
function logProgressPct(elapsedMs) {
  const t = Math.min(1, elapsedMs / PROGRESS_DURATION_MS)
  return Math.log10(1 + 9 * t) * PROGRESS_CAP
}

function ProcessingProgressBar({ active }) {
  const [pct, setPct] = useState(0)

  useEffect(() => {
    if (!active) {
      setPct(0)
      return undefined
    }
    const start = Date.now()
    const tick = () => setPct(logProgressPct(Date.now() - start))
    tick()
    const id = setInterval(tick, 120)
    return () => clearInterval(id)
  }, [active])

  if (!active) return null

  return (
    <div className="w-full max-w-[240px]" aria-hidden>
      <div className="customer-progress-track h-2">
        <div
          className="customer-progress-fill"
          style={{ width: `${pct}%`, transition: 'width 0.4s ease-out' }}
        />
      </div>
    </div>
  )
}

export default function StudioWorkspace({
  sourcePhotoUrl,
  lineartUrl,
  busy,
  statusMsg,
  phase,
  lineartVersion = 1,
  workflowStatus,
  processingSteps,
  activeStep,
  embedMode = false,
  children,
}) {
  if (!sourcePhotoUrl) return null

  const showProcessing = busy && phase !== 'awaiting_payment'
  const isValidated = ['approved', 'in_production', 'shipped'].includes(workflowStatus)
  const lineartLabel = isValidated
    ? `Tracé validé · v${lineartVersion}`
    : `Tracé proposé · v${lineartVersion}`

  return (
    <div className="customer-card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-[#2C1F14]">
          {embedMode ? 'Validation du tracé' : 'Votre studio'}
        </p>
        {busy && <span className="customer-badge">Traitement en cours…</span>}
        {lineartUrl && !busy && (
          <span className="customer-badge customer-badge-green">Tracé v{lineartVersion} prêt</span>
        )}
      </div>

      <div className="customer-studio-grid">
        <div>
          <p className="text-xs customer-muted mb-2">Photo uploadée</p>
          <div className="customer-photo-frame">
            <ImageWithZoom
              src={sourcePhotoUrl}
              alt="Votre photo de groupe"
              label="Votre photo"
              imgClassName="w-full h-auto"
            />
          </div>
        </div>

        <div>
          <p className="text-xs customer-muted mb-2">
            {lineartUrl ? lineartLabel : 'Traitement'}
          </p>
          {lineartUrl ? (
            <div className="customer-photo-frame customer-photo-frame-lineart">
              <ImageWithZoom
                src={lineartUrl}
                alt="Tracé line art"
                label={`Tracé v${lineartVersion}`}
                imgClassName="w-full h-auto"
              />
            </div>
          ) : phase === 'awaiting_payment' ? (
            <div className="customer-photo-frame flex-col gap-4 py-10">
              <div className="customer-spinner" aria-hidden />
              <p className="text-sm font-medium text-[#C0684A] text-center px-4">Confirmation du paiement…</p>
              <p className="text-xs customer-muted text-center px-4">Le traitement démarre dès validation Stripe.</p>
            </div>
          ) : showProcessing ? (
            <div className="customer-photo-frame flex-col gap-4 py-10">
              <div className="customer-spinner" aria-hidden />
              <p className="text-sm font-medium text-[#C0684A] text-center px-4">
                {statusMsg || 'Traitement en cours…'}
              </p>
              <p className="text-xs customer-muted text-center px-4">
                Environ 4 minutes — vous pouvez quitter cette page. Un e-mail vous préviendra quand votre tracé sera prêt.
              </p>
              <ProcessingProgressBar active={showProcessing} />
              {processingSteps?.length > 0 && (
                <ol className="text-xs customer-muted space-y-1.5 w-full max-w-[220px]">
                  {processingSteps.map((s, i) => (
                    <li key={s.key} className={i <= activeStep ? 'text-[#C0684A] font-semibold' : ''}>
                      {i <= activeStep ? '●' : '○'} {s.label}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div className="customer-photo-frame flex-col gap-4 py-10">
              <p className="text-sm customer-muted text-center px-4">
                Votre tracé apparaîtra ici une fois le traitement terminé.
              </p>
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  )
}
