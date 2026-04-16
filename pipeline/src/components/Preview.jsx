export default function Preview({ outline, gravure, overlay }) {
  const layers = [
    { url: outline, label: 'Contour découpe',  sub: 'noir sur blanc',           dl: 'outline.png',  border: 'border-stone-700' },
    { url: gravure, label: 'Gravure',           sub: 'lignes intérieures',       dl: 'gravure.png',  border: 'border-stone-700' },
    { url: overlay, label: 'Overlay',           sub: 'rouge = découpe · bleu = gravure', dl: 'overlay.png', border: 'border-amber-700/50' },
  ]

  return (
    <div className="space-y-4">
      {layers.map(({ url, label, sub, dl, border }) => (
        <div key={dl} className={`rounded-xl border ${border} bg-stone-900 overflow-hidden`}>
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <span className="font-medium text-stone-200 text-sm">{label}</span>
            <span className="text-xs text-stone-500">{sub}</span>
          </div>
          <img src={url} alt={label} className="w-full block" />
          <div className="px-4 py-3 border-t border-stone-800">
            <a href={url} download={dl}
              className="inline-block text-xs bg-stone-700 hover:bg-stone-600 text-stone-200 font-medium px-3 py-1.5 rounded-lg transition-colors">
              ⬇ {dl}
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
