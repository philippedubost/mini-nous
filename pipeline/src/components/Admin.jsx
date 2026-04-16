import { useState } from 'react'
import { DEFAULT_PROMPTS, savePrompts, resetPrompts } from '../lib/prompts'

export default function Admin({ prompts, onChange, onClose }) {
  const [local, setLocal] = useState({ ...prompts })

  const set = (key, val) => setLocal(p => ({ ...p, [key]: val }))

  const handleSave = () => {
    savePrompts(local)
    onChange(local)
    onClose()
  }

  const handleReset = () => {
    const defaults = resetPrompts()
    setLocal(defaults)
    onChange(defaults)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-stone-900 rounded-2xl border border-stone-700 p-5 space-y-5 mt-8 mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mode admin — prompts</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200 text-2xl leading-none">×</button>
        </div>

        {[
          { key: 'prompt1', label: 'Étape 1 — Mise en scène' },
          { key: 'prompt2', label: 'Étape 2 — Line Art' },
          { key: 'prompt3', label: 'Étape 3 — Contour final' },
        ].map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <label className="text-sm font-medium text-stone-300">{label}</label>
            <textarea
              className="w-full rounded-lg bg-stone-800 border border-stone-600 text-stone-100 text-sm p-3 focus:outline-none focus:border-amber-500 resize-y min-h-24"
              value={local[key]}
              onChange={e => set(key, e.target.value)}
            />
            <p className="text-xs text-stone-500">
              Default : <span className="italic">{DEFAULT_PROMPTS[key].slice(0, 80)}…</span>
            </p>
          </div>
        ))}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold"
          >
            Sauvegarder
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-stone-700 hover:bg-stone-600 text-stone-200"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
