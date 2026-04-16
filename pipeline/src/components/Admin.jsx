import { useState } from 'react'
import {
  DEFAULT_SETTINGS, saveSettings, resetSettings,
  RESOLUTIONS, ASPECT_RATIOS, IMAGE_INPUT_OPTIONS, STEP_LABELS,
} from '../lib/settings'

function StepSection({ index, step, onChange }) {
  const [open, setOpen] = useState(index === 0)
  const label = STEP_LABELS[index + 1]

  const set = (key, val) => onChange({ ...step, [key]: val })

  const toggleInput = (id) => {
    const next = step.imageInputs.includes(id)
      ? step.imageInputs.filter(x => x !== id)
      : [...step.imageInputs, id]
    set('imageInputs', next)
  }

  return (
    <div className="border border-stone-700 rounded-xl overflow-hidden">
      <button
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
          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Prompt</label>
            <textarea
              className="w-full rounded-lg bg-stone-800 border border-stone-600 text-stone-100 text-sm p-3 focus:outline-none focus:border-amber-500 resize-y min-h-28 font-mono"
              value={step.prompt}
              onChange={e => set('prompt', e.target.value)}
            />
          </div>

          {/* Resolution + Aspect ratio */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Résolution</label>
              <select
                className="w-full rounded-lg bg-stone-800 border border-stone-600 text-stone-100 text-sm px-3 py-2 focus:outline-none focus:border-amber-500"
                value={step.resolution}
                onChange={e => set('resolution', e.target.value)}
              >
                {RESOLUTIONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Format</label>
              <select
                className="w-full rounded-lg bg-stone-800 border border-stone-600 text-stone-100 text-sm px-3 py-2 focus:outline-none focus:border-amber-500"
                value={step.aspectRatio}
                onChange={e => set('aspectRatio', e.target.value)}
              >
                {ASPECT_RATIOS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Image inputs */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Images en entrée</label>
            <div className="space-y-1.5">
              {IMAGE_INPUT_OPTIONS.map(opt => (
                <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={step.imageInputs.includes(opt.id)}
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

export default function Admin({ settings, onChange, onClose }) {
  const [local, setLocal] = useState(() => structuredClone(settings))

  const updateStep = (i, step) => {
    setLocal(s => ({ steps: s.steps.map((st, idx) => idx === i ? step : st) }))
  }

  const handleSave = () => {
    saveSettings(local)
    onChange(local)
    onClose()
  }

  const handleReset = () => {
    const def = resetSettings()
    setLocal(def)
    onChange(def)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-stone-900 rounded-2xl border border-stone-700 p-5 space-y-4 mt-8 mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Admin — paramètres pipeline</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200 text-2xl leading-none">×</button>
        </div>

        {local.steps.map((step, i) => (
          <StepSection key={i} index={i} step={step} onChange={s => updateStep(i, s)} />
        ))}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold"
          >
            Sauvegarder
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-stone-200"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
