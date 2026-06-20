import { useState } from 'react'
import { fetchRevisions, submitRevision } from '../lib/storage'

const DEFAULT_ISSUES = ['cheveux', 'visage', 'vetements', 'posture', 'proportions', 'accessoires']

const ISSUE_LABELS = {
  cheveux: 'Cheveux',
  visage: 'Visage',
  vetements: 'Vêtements',
  posture: 'Posture',
  proportions: 'Proportions',
  accessoires: 'Accessoires',
}

export default function RevisionPanel({
  token, faceCount, bearerToken, onSubmitted, disabled, variant = 'default', inline = false,
}) {
  const isCustomer = variant === 'customer'
  const [open, setOpen] = useState(inline || isCustomer)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [issueOptions] = useState(DEFAULT_ISSUES)
  const [chars, setChars] = useState(() =>
    Array.from({ length: faceCount }, (_, i) => ({
      index: i,
      label: `Pers. ${i + 1}`,
      issues: [],
      freeText: '',
    })),
  )

  const toggleIssue = (ci, issue) => {
    setChars(prev => prev.map((c, i) => {
      if (i !== ci) return c
      const has = c.issues.includes(issue)
      return {
        ...c,
        issues: has ? c.issues.filter(x => x !== issue) : [...c.issues, issue],
      }
    }))
  }

  const submit = async () => {
    const filled = chars.filter(c => c.issues.length || c.freeText.trim())
    if (!filled.length) {
      setError('Cochez ou décrivez au moins un personnage à ajuster.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await submitRevision(token, filled, bearerToken)
      setDone(true)
      onSubmitted?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={isCustomer
        ? 'customer-alert-ok text-sm'
        : 'rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-4 text-sm text-emerald-100'}>
        Votre demande a été transmise — nous reprenons le tracé et vous recontactons.
      </div>
    )
  }

  if (!open && !inline) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={isCustomer
          ? 'customer-btn-ghost w-full'
          : 'w-full py-3 rounded-xl border border-stone-600 text-stone-300 hover:border-stone-400 disabled:opacity-40 text-sm'}
      >
        Demander des modifications à l&apos;équipe
      </button>
    )
  }

  const issueBtnClass = (active) => {
    if (isCustomer) {
      return active
        ? 'text-[10px] px-2 py-1 rounded-full border bg-[#FAF0EB] border-[#C0684A] text-[#A85238] font-semibold'
        : 'text-[10px] px-2 py-1 rounded-full border border-[#C4A882] text-[#9A8F88] hover:border-[#7A5C38]'
    }
    return active
      ? 'text-[11px] px-2 py-1 rounded-full border bg-amber-500/20 border-amber-600 text-amber-200'
      : 'text-[11px] px-2 py-1 rounded-full border border-stone-700 text-stone-500 hover:border-stone-500'
  }

  return (
    <div className={isCustomer
      ? 'customer-card-muted space-y-4 !p-4'
      : 'rounded-xl border border-stone-700 bg-stone-900/50 p-4 space-y-4 text-left'}>
      <div>
        <h3 className={`font-semibold text-sm ${isCustomer ? 'text-[#2C1F14]' : 'text-stone-100'}`}>
          Ajuster personnage par personnage
        </h3>
        <p className={`text-xs mt-1 ${isCustomer ? 'customer-muted' : 'text-stone-500'}`}>
          De gauche à droite sur le tracé — cochez ce qui doit changer et précisez en commentaire.
        </p>
      </div>

      <div className={isCustomer ? 'customer-person-row' : 'flex gap-3 overflow-x-auto pb-1'}>
        {chars.map((c, ci) => (
          <div key={c.index} className={isCustomer ? 'customer-person-col' : 'rounded-lg border border-stone-800 p-3 space-y-2 min-w-[140px] flex-1'}>
            <p className={`text-xs font-bold ${isCustomer ? 'text-[#C0684A]' : 'text-amber-400'}`}>
              {ci + 1} · gauche → droite
            </p>
            <input
              type="text"
              value={c.label}
              onChange={e => setChars(prev => prev.map((x, i) => i === ci ? { ...x, label: e.target.value } : x))}
              className={isCustomer
                ? 'w-full text-xs font-semibold bg-transparent border-b border-[#C4A882] pb-1 text-[#2C1F14] outline-none focus:border-[#C0684A]'
                : 'w-full text-sm font-medium bg-transparent border-b border-stone-700 pb-1 text-stone-200 outline-none focus:border-amber-500'}
              placeholder={`Pers. ${ci + 1}`}
            />
            <div className="flex flex-wrap gap-1">
              {issueOptions.map(issue => (
                <button
                  key={issue}
                  type="button"
                  onClick={() => toggleIssue(ci, issue)}
                  className={issueBtnClass(c.issues.includes(issue))}
                >
                  {ISSUE_LABELS[issue] || issue}
                </button>
              ))}
            </div>
            <textarea
              value={c.freeText}
              onChange={e => setChars(prev => prev.map((x, i) => i === ci ? { ...x, freeText: e.target.value } : x))}
              rows={2}
              placeholder="Commentaire…"
              className={isCustomer
                ? 'customer-input text-xs !py-2 resize-none'
                : 'w-full text-xs px-3 py-2 rounded-lg bg-stone-950 border border-stone-800 text-stone-300 resize-none outline-none focus:border-amber-600'}
            />
          </div>
        ))}
      </div>

      {error && <p className={`text-xs ${isCustomer ? 'text-[#8A4030]' : 'text-red-400'}`}>{error}</p>}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={submit}
          disabled={busy || disabled}
          className={isCustomer
            ? 'customer-btn-ghost flex-1 min-w-[140px]'
            : 'flex-1 py-2.5 rounded-lg bg-stone-100 text-stone-950 text-sm font-semibold hover:bg-white disabled:opacity-50'}
        >
          {busy ? 'Envoi…' : 'Envoyer mes retours'}
        </button>
        {!inline && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`px-4 text-xs ${isCustomer ? 'customer-muted' : 'text-stone-500'}`}
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}

export async function loadRevisionOptions(token, bearerToken) {
  try {
    const { issueOptions } = await fetchRevisions(token, bearerToken)
    return issueOptions ?? DEFAULT_ISSUES
  } catch {
    return DEFAULT_ISSUES
  }
}
