import { useState, useEffect } from 'react'
import LineartVersionPicker from './LineartVersionPicker'
import { ImageWithZoom } from './ImageLightbox'

const ADJUSTMENT_ISSUES = [
  { id: 'cheveux', label: 'Cheveux' },
  { id: 'habits', label: 'Habits' },
  { id: 'expression', label: 'Expression du visage' },
  { id: 'age_jeune', label: 'Trop jeune' },
  { id: 'age_vieux', label: 'Trop âgé' },
  { id: 'proportions', label: 'Proportions' },
  { id: 'posture', label: 'Posture' },
]

function emptyChars(faceCount) {
  return Array.from({ length: faceCount }, (_, i) => ({
    index: i,
    label: `Pers. ${i + 1}`,
    issues: [],
    freeText: '',
  }))
}

export default function CharacterReviewPanel({
  faceCount,
  lineartVersion = 1,
  lineartUrl,
  studio = {},
  lineartVersions = [],
  selectedVersionId,
  disabled,
  onAutoAdjust,
  onManualRevision,
  onSelectVersion,
  onValidate,
  validateBusy,
}) {
  const [mode, setMode] = useState('choice')
  const [chars, setChars] = useState(() => emptyChars(faceCount))
  const [submitError, setSubmitError] = useState(null)

  const { canAutoAdjust, canManualAdjust, showVersionPicker } = studio

  useEffect(() => {
    setChars(emptyChars(faceCount))
    setMode('choice')
    setSubmitError(null)
  }, [faceCount, lineartVersion])

  const toggleIssue = (ci, issue) => {
    setChars(prev => prev.map((c, i) => {
      if (i !== ci) return c
      const has = c.issues.includes(issue)
      return { ...c, issues: has ? c.issues.filter(x => x !== issue) : [...c.issues, issue] }
    }))
  }

  const filledFeedback = chars.filter(c => c.issues.length || c.freeText.trim())

  const submitAdjust = () => {
    if (!filledFeedback.length) {
      setSubmitError('Cochez au moins un point à revoir ou précisez une remarque.')
      return
    }
    setSubmitError(null)
    if (canManualAdjust) onManualRevision?.(chars)
    else onAutoAdjust?.(chars)
  }

  const versionHint = lineartVersion === 1
    ? 'Première version — ajustement automatique possible une fois pour générer le tracé v2.'
    : lineartVersion === 2
      ? showVersionPicker
        ? 'Comparez le tracé v1 et v2, puis validez votre préférée.'
        : 'Deuxième version — un dernier ajustement possible, repris à la main par notre équipe (24 h).'
      : 'Choisissez la version préférée parmi les tracés disponibles.'

  if (mode === 'choice') {
    return (
      <div className="customer-card-muted !p-5 space-y-4">
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold text-[#2C1F14]">
            Tracé v{lineartVersion} prêt
          </p>
          <p className="text-xs customer-muted">{versionHint}</p>
        </div>

        {showVersionPicker && lineartVersions.length > 0 && (
          <LineartVersionPicker
            versions={lineartVersions}
            selectedVersionId={selectedVersionId}
            onSelect={onSelectVersion}
            disabled={disabled || validateBusy}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onValidate}
            disabled={disabled || validateBusy || (showVersionPicker && !selectedVersionId)}
            className="customer-btn-clay w-full"
          >
            {validateBusy ? 'Validation…' : '✓ Valider'}
          </button>
          {(canAutoAdjust || canManualAdjust) && (
            <button
              type="button"
              onClick={() => setMode('adjust')}
              disabled={disabled || validateBusy}
              className="customer-btn-ghost w-full"
            >
              Ajuster
            </button>
          )}
        </div>

        {canManualAdjust && (
          <p className="text-xs customer-muted text-center">
            Dernier ajustement — reprise manuelle par l&apos;équipe MiniNous sous 24 h.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="customer-card-muted !p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm text-[#2C1F14]">
            {canManualAdjust ? 'Dernier ajustement — révision équipe' : 'Ajuster le tracé v1'}
          </h3>
          <p className="text-xs customer-muted mt-1">
            {canManualAdjust
              ? 'Cochez ce qui doit être revu. Notre équipe reprendra le tracé à la main (tracé v3 sous 24 h).'
              : 'Vos retours seront compilés pour regénérer automatiquement le tracé v2.'}
          </p>
          <p className="text-xs font-medium text-[#7A5C38] mt-2">
            Les personnages 1, 2, 3… sont rangés de <strong>gauche à droite</strong> sur le tracé.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setMode('choice'); setSubmitError(null) }}
          className="text-xs customer-link shrink-0"
        >
          ← Retour
        </button>
      </div>

      {lineartUrl && (
        <div className="relative customer-photo-frame customer-photo-frame-lineart mx-auto max-w-md">
          <ImageWithZoom
            src={lineartUrl}
            alt="Tracé à ajuster"
            label={`Tracé v${lineartVersion}`}
            imgClassName="w-full h-auto"
            className="w-full"
          />
          <div className="absolute inset-x-0 bottom-[10%] flex justify-around px-[10%] pointer-events-none">
            {Array.from({ length: faceCount }, (_, i) => (
              <span
                key={i}
                className="w-7 h-7 rounded-full bg-[#C0684A] text-white text-sm font-bold flex items-center justify-center shadow-lg border-2 border-white/90"
                aria-hidden
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="customer-person-row customer-adjust-table">
        {chars.map((c, ci) => (
          <div key={c.index} className="customer-person-col">
            <p className="text-xs font-bold text-[#C0684A] text-center">{ci + 1}</p>
            <p className="text-[10px] customer-muted text-center mb-2">Pers. {ci + 1}</p>
            <p className="text-[10px] font-semibold text-[#7A5C38] mb-1.5">À revoir…</p>
            <div className="space-y-1.5">
              {ADJUSTMENT_ISSUES.map(({ id, label }) => (
                <label
                  key={id}
                  className="flex items-start gap-2 text-[11px] text-[#2C1F14] cursor-pointer leading-tight"
                >
                  <input
                    type="checkbox"
                    className="accent-[#C0684A] mt-0.5 shrink-0"
                    checked={c.issues.includes(id)}
                    disabled={disabled}
                    onChange={() => toggleIssue(ci, id)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label className="block mt-3">
              <span className="text-[10px] font-semibold text-[#7A5C38]">Autre remarque</span>
              <textarea
                value={c.freeText}
                disabled={disabled}
                onChange={e => setChars(prev => prev.map((x, i) => i === ci ? { ...x, freeText: e.target.value } : x))}
                rows={2}
                placeholder="Précisez si besoin…"
                className="customer-input text-xs !py-2 resize-none mt-1 w-full"
              />
            </label>
          </div>
        ))}
      </div>

      {submitError && <p className="text-xs text-[#8A4030]">{submitError}</p>}

      <button
        type="button"
        disabled={disabled}
        onClick={submitAdjust}
        className="customer-btn-clay w-full"
      >
        {canManualAdjust
          ? '↻ Envoyer à l\'équipe MiniNous (24 h)'
          : '↻ Regénérer le tracé v2'}
      </button>
    </div>
  )
}

export { emptyChars }
