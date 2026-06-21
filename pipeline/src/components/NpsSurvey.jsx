import { useState } from 'react'
import { submitEngagement } from '../lib/storage'

const TRUSTPILOT_URL = 'https://fr.trustpilot.com/evaluate/mininous.app'

export default function NpsSurvey({ orderToken, submitted, initialScore }) {
  const [score, setScore] = useState(initialScore ?? null)
  const [done, setDone] = useState(!!submitted)
  const [showReviews, setShowReviews] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (done) {
    return (
      <div className="customer-card-muted !p-5 text-center space-y-3">
        <p className="text-sm font-semibold text-[#2C1F14]">Merci pour votre retour !</p>
        {showReviews && (
          <a
            href={TRUSTPILOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="customer-btn-ghost text-xs !py-2 !px-4 inline-block"
          >
            Laisser un avis sur Trustpilot →
          </a>
        )}
      </div>
    )
  }

  const submit = async (value) => {
    setBusy(true)
    setError(null)
    try {
      const res = await submitEngagement(orderToken, 'nps', { score: value })
      setScore(value)
      setDone(true)
      setShowReviews(!!res.showReviewLinks)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="customer-card-muted !p-5 space-y-4">
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-[#2C1F14]">Comment s&apos;est passée votre expérience ?</p>
        <p className="text-xs customer-muted">De 1 (pas satisfait) à 5 (ravi)</p>
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => submit(n)}
            className={`w-11 h-11 rounded-xl text-lg transition-colors ${
              score === n
                ? 'bg-[#C0684A] text-white'
                : 'bg-white border border-[#E8DFD4] hover:border-[#C0684A]'
            }`}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-[#8A4030] text-center">{error}</p>}
    </div>
  )
}
