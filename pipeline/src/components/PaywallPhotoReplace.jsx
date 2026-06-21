import { useRef, useState } from 'react'
import { compressImageFile } from '../lib/compressImage'
import { replacePaywallPhoto } from '../lib/storage'

function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
    reader.readAsDataURL(file)
  })
}

export default function PaywallPhotoReplace({ orderToken, canReplace, replaced, onUpdated }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleFile = async (file) => {
    if (!file?.type.startsWith('image/')) return
    setBusy(true)
    setError(null)
    setSuccess(false)
    try {
      const prepared = await compressImageFile(file)
      const photoBase64 = await fileToDataUri(prepared)
      const { order } = await replacePaywallPhoto(orderToken, photoBase64)
      setSuccess(true)
      onUpdated?.(order)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (!canReplace && !replaced) return null

  return (
    <div className="space-y-2 pt-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy || !canReplace}
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {canReplace && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="customer-btn-ghost w-full text-sm"
          >
            {busy ? 'Enregistrement…' : 'Changer la photo (1 fois)'}
          </button>
          <p className="text-xs customer-muted text-center">
            Une seule modification possible avant le paiement.
          </p>
        </>
      )}

      {replaced && !canReplace && (
        <p className="text-xs customer-muted text-center">
          Photo modifiée — plus de changement possible avant le paiement.
        </p>
      )}

      {success && (
        <p className="text-xs text-[#4A8A52] text-center">Nouvelle photo enregistrée.</p>
      )}

      {error && (
        <p className="text-xs text-[#8A4030] text-center">{error}</p>
      )}
    </div>
  )
}
