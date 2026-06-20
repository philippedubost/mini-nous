export default function Preview({ laserSvg, theme = 'dark' }) {
  if (!laserSvg) return null
  const light = theme === 'light'

  return (
    <div className={light
      ? 'customer-card overflow-hidden !p-0'
      : 'rounded-xl border border-amber-700/50 bg-stone-900 overflow-hidden'}>
      <div className={`px-4 py-3 flex items-center justify-between ${light ? 'border-b border-[rgba(196,168,130,0.28)]' : 'border-b border-stone-800'}`}>
        <span className={`font-medium text-sm ${light ? 'text-[#2C1F14]' : 'text-stone-200'}`}>SVG laser</span>
        <span className={`text-xs ${light ? 'customer-muted' : 'text-stone-500'}`}>découpe (rouge) + gravure (noir)</span>
      </div>
      <div className="p-4 bg-white">
        <img src={laserSvg} alt="SVG laser fusionné" className="w-full block" />
      </div>
      <div className={`px-4 py-3 ${light ? '' : 'border-t border-stone-800'}`}>
        <a
          href={laserSvg}
          download="mini-nous-laser.svg"
          className={light
            ? 'customer-btn-clay !py-2 !px-4 !text-xs inline-block'
            : 'inline-block text-xs bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium px-3 py-1.5 rounded-lg transition-colors'}
        >
          Télécharger SVG
        </a>
      </div>
    </div>
  )
}
