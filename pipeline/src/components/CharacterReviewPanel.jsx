import { useState, useEffect } from 'react'

const DEFAULT_ISSUES = ['cheveux', 'visage', 'vetements', 'posture', 'proportions', 'accessoires']

const ISSUE_LABELS = {
  cheveux: 'Cheveux',
  visage: 'Visage',
  vetements: 'Vêtements',
  posture: 'Posture',
  proportions: 'Proportions',
  accessoires: 'Accessoires',
}

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
  disabled,
  regenRemaining,
  onRegen,
  personOk,
  onPersonOkChange,
  onValidate,
  validateDisabled,
  validateBusy,
}) {
  const [chars, setChars] = useState(() => emptyChars(faceCount))
  const [regenError, setRegenError] = useState(null)

  useEffect(() => {
    setChars(emptyChars(faceCount))
  }, [faceCount])

  const toggleIssue = (ci, issue) => {
    setChars(prev => prev.map((c, i) => {
      if (i !== ci) return c
      const has = c.issues.includes(issue)
      return { ...c, issues: has ? c.issues.filter(x => x !== issue) : [...c.issues, issue] }
    }))
  }

  const filledFeedback = chars.filter(c => c.issues.length || c.freeText.trim())
  const allValidated = faceCount > 0 && Array.from({ length: faceCount }, (_, i) => personOk[i]).every(Boolean)

  const handleRegen = () => {
    if (!filledFeedback.length) {
      setRegenError('Cochez ou commentez au moins un personnage à corriger.')
      return
    }
    setRegenError(null)
    onRegen?.(chars)
  }

  const issueBtn = (active) => active
    ? 'text-[10px] px-2 py-1 rounded-full border bg-[#FAF0EB] border-[#C0684A] text-[#A85238] font-semibold'
    : 'text-[10px] px-2 py-1 rounded-full border border-[#C4A882] text-[#9A8F88] hover:border-[#7A5C38]'

  return (
    <div className="space-y-4">
      <div className="customer-card-muted !p-4 space-y-3">
        <p className="text-sm font-semibold text-[#2C1F14]">Valider personnage par personnage</p>
        <p className="text-xs customer-muted">Cochez chaque figurine de gauche à droite avant de valider le tracé.</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: faceCount }, (_, i) => (
            <label
              key={i}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
                personOk[i]
                  ? 'bg-[#EBF4EC] border-[#4A8A52] text-[#2d5a34]'
                  : 'bg-white border-[#C4A882] text-[#7A5C38]'
              }`}
            >
              <input
                type="checkbox"
                className="accent-[#4A8A52]"
                checked={!!personOk[i]}
                disabled={disabled}
                onChange={e => onPersonOkChange(i, e.target.checked)}
              />
              Pers. {i + 1} validé ✓
            </label>
          ))}
        </div>
        {!allValidated && (
          <p className="text-xs text-[#9A8F88]">
            {Object.values(personOk).filter(Boolean).length}/{faceCount} personnage{faceCount > 1 ? 's' : ''} validé{faceCount > 1 ? 's' : ''}
          </p>
        )}
        {onValidate && (
          <button
            type="button"
            onClick={onValidate}
            disabled={validateDisabled || validateBusy || !allValidated}
            className="customer-btn-clay w-full"
          >
            {validateBusy ? 'Validation…' : '✓ Valider ce tracé → impression'}
          </button>
        )}
      </div>

      <div className="customer-card-muted !p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-sm text-[#2C1F14]">Retours pour regénérer (v2, v3…)</h3>
          <p className="text-xs customer-muted mt-1">
            De gauche à droite — ces retours sont envoyés à l&apos;IA pour la prochaine version.
          </p>
        </div>

        <div className="customer-person-row">
          {chars.map((c, ci) => (
            <div key={c.index} className="customer-person-col">
              <p className="text-xs font-bold text-[#C0684A]">{ci + 1} · gauche → droite</p>
              <input
                type="text"
                value={c.label}
                disabled={disabled}
                onChange={e => setChars(prev => prev.map((x, i) => i === ci ? { ...x, label: e.target.value } : x))}
                className="w-full text-xs font-semibold bg-transparent border-b border-[#C4A882] pb-1 text-[#2C1F14] outline-none focus:border-[#C0684A]"
                placeholder={`Pers. ${ci + 1}`}
              />
              <div className="flex flex-wrap gap-1">
                {DEFAULT_ISSUES.map(issue => (
                  <button
                    key={issue}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleIssue(ci, issue)}
                    className={issueBtn(c.issues.includes(issue))}
                  >
                    {ISSUE_LABELS[issue]}
                  </button>
                ))}
              </div>
              <textarea
                value={c.freeText}
                disabled={disabled}
                onChange={e => setChars(prev => prev.map((x, i) => i === ci ? { ...x, freeText: e.target.value } : x))}
                rows={2}
                placeholder="Commentaire…"
                className="customer-input text-xs !py-2 resize-none"
              />
            </div>
          ))}
        </div>

        {regenError && <p className="text-xs text-[#8A4030]">{regenError}</p>}

        {(regenRemaining == null || regenRemaining > 0) && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleRegen}
            className="customer-btn-ghost w-full"
          >
            {regenRemaining == null
              ? '↻ Regénérer avec mes retours'
              : `↻ Regénérer avec mes retours (${regenRemaining} restante${regenRemaining > 1 ? 's' : ''})`}
          </button>
        )}
      </div>
    </div>
  )
}

export { emptyChars }
