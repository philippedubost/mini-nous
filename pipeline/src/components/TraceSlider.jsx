export default function TraceSlider({ id, label, hint, value, onChange, min, max, step }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-stone-300">{label}</label>
        <span className="text-xs tabular-nums text-stone-500">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
      {hint && <p className="text-[10px] text-stone-600 leading-snug">{hint}</p>}
    </div>
  )
}
