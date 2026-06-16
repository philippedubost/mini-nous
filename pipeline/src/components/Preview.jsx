export default function Preview({ laserSvg }) {
  if (!laserSvg) return null

  return (
    <div className="rounded-xl border border-amber-700/50 bg-stone-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
        <span className="font-medium text-stone-200 text-sm">SVG laser</span>
        <span className="text-xs text-stone-500">découpe (rouge) + gravure (noir)</span>
      </div>
      <div className="p-4 bg-white">
        <img src={laserSvg} alt="SVG laser fusionné" className="w-full block" />
      </div>
      <div className="px-4 py-3 border-t border-stone-800">
        <a
          href={laserSvg}
          download="mini-nous-laser.svg"
          className="inline-block text-xs bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          ⬇ Télécharger SVG
        </a>
      </div>
    </div>
  )
}
