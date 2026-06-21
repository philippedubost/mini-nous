export default function StudioWorkspace({
  sourcePhotoUrl,
  lineartUrl,
  busy,
  statusMsg,
  phase,
  lineartVersion = 1,
  processingSteps,
  activeStep,
  children,
}) {
  if (!sourcePhotoUrl) return null

  return (
    <div className="customer-card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-[#2C1F14]">Votre studio</p>
        {busy && <span className="customer-badge">Traitement en cours…</span>}
        {lineartUrl && !busy && (
          <span className="customer-badge customer-badge-green">Tracé v{lineartVersion} prêt</span>
        )}
      </div>

      <div className="customer-studio-grid">
        <div>
          <p className="text-xs customer-muted mb-2">Photo uploadée</p>
          <div className="customer-photo-frame">
            <img src={sourcePhotoUrl} alt="Votre photo de groupe" />
          </div>
        </div>

        <div>
          <p className="text-xs customer-muted mb-2">
            {lineartUrl ? `Tracé proposé · v${lineartVersion}` : 'Traitement'}
          </p>
          {lineartUrl ? (
            <div className="customer-photo-frame customer-photo-frame-lineart">
              <img src={lineartUrl} alt="Tracé line art" />
            </div>
          ) : phase === 'awaiting_payment' ? (
            <div className="customer-photo-frame flex-col gap-4 py-10">
              <div className="customer-spinner" aria-hidden />
              <p className="text-sm font-medium text-[#C0684A] text-center px-4">Confirmation du paiement…</p>
              <p className="text-xs customer-muted text-center px-4">Le traitement démarre dès validation Stripe.</p>
            </div>
          ) : (
            <div className="customer-photo-frame flex-col gap-4 py-10">
              <div className="customer-spinner" aria-hidden />
              <p className="text-sm font-medium text-[#C0684A] text-center px-4">
                {statusMsg || 'Traitement en cours…'}
              </p>
              <p className="text-xs customer-muted text-center px-4">
                Comptez entre 2 et 5 minutes — ne fermez pas cette page.
              </p>
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
          )}
        </div>
      </div>

      {children}
    </div>
  )
}
