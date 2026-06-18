import { useState } from 'react'
import {
  loadSettings, saveSettings, resetSettings,
  RESOLUTIONS, ASPECT_RATIOS, IMAGE_INPUT_OPTIONS, STEP_LABELS,
} from '../lib/settings'

function GlobalFormatFields({ resolution, aspectRatio, onChange }) {
  return (
    <div className="rounded-lg border border-amber-700/40 bg-stone-950/50 p-3 space-y-3">
      <p className="text-xs font-semibold text-amber-500/80 uppercase tracking-wide">Format — toutes les étapes</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Résolution</label>
          <select
            className="w-full rounded-lg bg-stone-800 border border-stone-600 text-stone-100 text-sm px-3 py-2"
            value={resolution}
            onChange={e => onChange('resolution', e.target.value)}
          >
            {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Format</label>
          <select
            className="w-full rounded-lg bg-stone-800 border border-stone-600 text-stone-100 text-sm px-3 py-2"
            value={aspectRatio}
            onChange={e => onChange('aspectRatio', e.target.value)}
          >
            {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

function StepSection({ index, step, onChange, globalFormat }) {
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
          {globalFormat && (
            <GlobalFormatFields
              resolution={globalFormat.resolution}
              aspectRatio={globalFormat.aspectRatio}
              onChange={globalFormat.onChange}
            />
          )}
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
  const [local, setLocal] = useState(() => structuredClone(loadSettings()))
  const [saved, setSaved] = useState(false)

  const updateGlobal = (key, val) => setLocal(s => ({ ...s, [key]: val }))
  const updateStep = (i, step) => {
    setLocal(s => ({ ...s, steps: s.steps.map((st, idx) => idx === i ? step : st) }))
  }

  const handleSave = () => {
    saveSettings(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    const def = resetSettings()
    setLocal(def)
    saveSettings(def)
  }

  return (
    <div className="max-w-2xl space-y-4">
      {local.steps.map((step, i) => (
        <StepSection
          key={i}
          index={i}
          step={step}
          onChange={s => updateStep(i, s)}
          globalFormat={i === 0 ? {
            resolution: local.resolution,
            aspectRatio: local.aspectRatio,
            onChange: updateGlobal,
          } : null}
        />
      ))}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold"
        >
          {saved ? 'Enregistré ✓' : 'Sauvegarder'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-stone-200"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
