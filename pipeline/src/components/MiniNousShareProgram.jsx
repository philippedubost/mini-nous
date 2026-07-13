import { useState } from 'react'
import { submitEngagement } from '../lib/storage'

export default function MiniNousShareProgram({ orderToken, submitted }) {
  const [postUrl, setPostUrl] = useState('')
  const [done, setDone] = useState(!!submitted)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (done) {
    return (
      <div className="customer-card-muted !p-5 space-y-2 text-center">
        <p className="text-sm font-semibold text-[#2C1F14]">#WoodTribe</p>
        <p className="text-xs customer-muted">
          {message || 'Merci ! Nous vérifions votre publication et vous enverrons un code −20 % sous 48 h.'}
        </p>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await submitEngagement(orderToken, 'mininous_share', { postUrl: postUrl.trim() })
      setMessage(res.message)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="customer-card-muted !p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#2C1F14]">Partagez vos figurines — #WoodTribe</p>
        <p className="text-xs customer-muted leading-relaxed">
          Publiez une photo de vos figurines sur Instagram ou Facebook avec #WoodTribe,
          puis collez le lien ici pour recevoir <strong>−20 %</strong> sur votre prochaine commande.
        </p>
      </div>
      <input
        type="url"
        required
        value={postUrl}
        onChange={e => setPostUrl(e.target.value)}
        placeholder="https://instagram.com/p/…"
        className="customer-input w-full text-sm"
        disabled={busy}
      />
      {error && <p className="text-xs text-[#8A4030]">{error}</p>}
      <button type="submit" disabled={busy} className="customer-btn-clay w-full">
        {busy ? 'Envoi…' : 'Envoyer mon lien →'}
      </button>
    </form>
  )
}
