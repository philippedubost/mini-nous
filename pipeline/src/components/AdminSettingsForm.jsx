import { useState, useEffect, useRef } from 'react'
import {
  IMAGE_INPUT_OPTIONS, STEP_LABELS, getReferenceLineUrl,
} from '../lib/settings'
import { useSettings } from '../context/SettingsContext'

function ReferenceLineArtSection({ settings, onUpload, uploading, uploadError }) {
  const inputRef = useRef(null)
  const previewUrl = getReferenceLineUrl(settings)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await onUpload(reader.result)
      } catch {
        /* parent shows error */
      }
      if (inputRef.current) inputRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="rounded-xl border border-stone-700 bg-stone-900 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-stone-200">Référence line art</p>
        <p className="text-xs text-stone-500 mt-1">
          Image de style utilisée à l&apos;étape 2 (line art). Stockée sur R2, partagée pour toutes les générations.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="w-full sm:w-48 aspect-[4/3] rounded-lg border border-stone-700 bg-white flex items-center justify-center overflow-hidden shrink-0">
          <img
            src={previewUrl}
            alt="Référence line art"
            className="max-w-full max-h-full object-contain"
          />
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-stone-700 hover:bg-stone-600 disabled:opacity-60 text-stone-100 text-sm font-medium"
          >
            {uploading ? 'Envoi en cours…' : 'Changer l\'image'}
          </button>
          {settings.referenceLineUrl && (
            <p className="text-[11px] text-stone-500 break-all max-w-xs">
              {settings.referenceLineUrl}
            </p>
          )}
          {uploadError && (
            <p className="text-sm text-red-400">{uploadError}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StepSection({ index, step, onChange }) {
  const [open, setOpen] = useState(index === 0)
  const label = STEP_LABELS[index + 1]
  const set = (key, val) => onChange({ ...step, [key]: val })

  const toggleInput = (id) => {
    const inputs = step.imageInputs ?? []
    const next = inputs.includes(id)
      ? inputs.filter(x => x !== id)
      : [...inputs, id]
    set('imageInputs', next)
  }

  return (
    <div className="border border-stone-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-stone-800 hover:bg-stone-750 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-stone-300">
            {index + 1}
          </span>
          <span className="font-semibold text-stone-200 text-sm">{label}</span>
        </div>
        <span className="text-stone-500 text-lg leading-none">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="p-4 space-y-4 bg-stone-900">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Prompt</label>
            <textarea
              className="w-full rounded-lg bg-stone-800 border border-stone-600 text-stone-100 text-sm p-3 focus:outline-none focus:border-amber-500 resize-y min-h-28 font-mono"
              value={step.prompt ?? ''}
              onChange={e => set('prompt', e.target.value)}
            />
            {index === 0 && (
              <p className="text-[11px] text-stone-500 leading-snug">
                Utilisez « ces personnes » dans le texte — le pipeline remplace par « ces N personnes » selon le nombre de visages détectés.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Images en entrée</label>
            <div className="space-y-1.5">
              {IMAGE_INPUT_OPTIONS.map(opt => (
                <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={(step.imageInputs ?? []).includes(opt.id)}
                    onChange={() => toggleInput(opt.id)}
                    className="w-4 h-4 rounded accent-amber-500"
                  />
                  <span className="text-sm text-stone-300 group-hover:text-stone-100">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminSettingsForm() {
  const {
    settings, loading, saveSettings, resetSettings, uploadReferenceLineArt, updatedAt,
  } = useSettings()
  const [local, setLocal] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [refUploading, setRefUploading] = useState(false)
  const [refUploadError, setRefUploadError] = useState(null)

  useEffect(() => {
    if (!loading) setLocal(structuredClone(settings))
  }, [settings, loading])

  const updateStep = (i, step) => {
    setLocal(s => ({ ...s, steps: s.steps.map((st, idx) => idx === i ? step : st) }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await saveSettings(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const def = await resetSettings()
      setLocal(structuredClone(def))
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRefUpload = async (base64) => {
    setRefUploading(true)
    setRefUploadError(null)
    try {
      const merged = await uploadReferenceLineArt(base64)
      setLocal(structuredClone(merged))
    } catch (e) {
      setRefUploadError(e.message)
      throw e
    } finally {
      setRefUploading(false)
    }
  }

  if (loading || !local) {
    return <p className="text-stone-400 text-sm">Chargement des paramètres…</p>
  }

  return (
    <div className="max-w-2xl space-y-4">
      {updatedAt && (
        <p className="text-xs text-stone-500">
          Dernière mise à jour : {new Date(updatedAt).toLocaleString('fr-FR')}
        </p>
      )}

      <ReferenceLineArtSection
        settings={local}
        onUpload={handleRefUpload}
        uploading={refUploading}
        uploadError={refUploadError}
      />

      {local.steps.map((step, i) => (
        <StepSection
          key={i}
          index={i}
          step={step}
          onChange={s => updateStep(i, s)}
        />
      ))}

      {saveError && (
        <p className="text-sm text-red-400">{saveError}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold"
        >
          {saved ? 'Enregistré ✓' : saving ? 'Enregistrement…' : 'Sauvegarder les prompts'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-stone-700 hover:bg-stone-600 disabled:opacity-60 text-stone-200"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
