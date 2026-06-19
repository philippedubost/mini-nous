import { useState } from 'react'
import { fetchRevisions, submitRevision } from '../lib/storage'

const DEFAULT_ISSUES = ['cheveux', 'visage', 'vetements', 'posture', 'proportions', 'accessoires']

const ISSUE_LABELS = {
  cheveux: 'Cheveux / coiffure',
  visage: 'Visage',
  vetements: 'Vêtements',
  posture: 'Posture',
  proportions: 'Proportions',
  accessoires: 'Accessoires',
}

export default function RevisionPanel({ token, faceCount, bearerToken, onSubmitted, disabled }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [issueOptions] = useState(DEFAULT_ISSUES)
  const [chars, setChars] = useState(() =>
    Array.from({ length: faceCount }, (_, i) => ({
      index: i,
      label: `Personnage ${i + 1}`,
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
      setError('Décrivez au moins un personnage à ajuster.')
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
      <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-4 text-sm text-emerald-100">
        Votre demande a été transmise à l&apos;équipe MiniNous. Nous reprenons le design et vous recontactons.
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl border border-stone-600 text-stone-300 hover:border-stone-400 disabled:opacity-40 text-sm"
      >
        Demander des modifications à l&apos;équipe
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-4 space-y-4 text-left">
      <div>
        <h3 className="font-semibold text-stone-100">Suggestions par personnage</h3>
        <p className="text-xs text-stone-500 mt-1">
          Cochez ce qui doit être ajusté — notre équipe reprendra le tracé avant fabrication.
        </p>
      </div>

      {chars.map((c, ci) => (
        <div key={c.index} className="rounded-lg border border-stone-800 p-3 space-y-2">
          <input
            type="text"
            value={c.label}
            onChange={e => setChars(prev => prev.map((x, i) => i === ci ? { ...x, label: e.target.value } : x))}
            className="w-full text-sm font-medium bg-transparent border-b border-stone-700 pb-1 text-stone-200 outline-none focus:border-amber-500"
            placeholder={`Personnage ${ci + 1}`}
          />
          <div className="flex flex-wrap gap-1.5">
            {issueOptions.map(issue => (
              <button
                key={issue}
                type="button"
                onClick={() => toggleIssue(ci, issue)}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  c.issues.includes(issue)
                    ? 'bg-amber-500/20 border-amber-600 text-amber-200'
                    : 'border-stone-700 text-stone-500 hover:border-stone-500'
                }`}
              >
                {ISSUE_LABELS[issue] || issue}
              </button>
            ))}
          </div>
          <textarea
            value={c.freeText}
            onChange={e => setChars(prev => prev.map((x, i) => i === ci ? { ...x, freeText: e.target.value } : x))}
            rows={2}
            placeholder="Précisions libres…"
            className="w-full text-xs px-3 py-2 rounded-lg bg-stone-950 border border-stone-800 text-stone-300 resize-none outline-none focus:border-amber-600"
          />
        </div>
      ))}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || disabled}
          className="flex-1 py-2.5 rounded-lg bg-stone-100 text-stone-950 text-sm font-semibold hover:bg-white disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Soumettre aux équipes MiniNous'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 text-xs text-stone-500">
          Annuler
        </button>
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
