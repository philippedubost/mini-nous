import { useState } from 'react'
import ImageLightbox from './ImageLightbox'

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const SOURCE_LABELS = {
  pipeline: 'Pipeline',
  admin_rerun: 'Relance admin',
  admin_extraction: 'Extraction admin',
  admin_laser_regen: 'Regénération SVG',
  admin_laser_studio: 'Studio SVG',
  admin_laser_bulk: 'Regénération bulk',
  lab_trace: 'Labo trace',
}

function isSvgUrl(url) {
  return /\.svg(\?|$)/i.test(url ?? '')
    || (url ?? '').includes('image/svg')
    || (url ?? '').startsWith('data:image/svg')
}

function LoupeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
      <path d="M11 8v6M8 11h6" strokeWidth="2" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export default function VersionGallery({
  versions, selectedId, onSelect, onDelete, disabled, assetLabel,
}) {
  const [lightbox, setLightbox] = useState(null)

  if (!versions?.length) {
    return <p className="text-xs text-stone-600 py-2">Aucune version enregistrée.</p>
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const slides = sorted
    .filter(v => v.image_url)
    .map(v => ({
      src: v.image_url,
      title: `${assetLabel ?? v.label ?? v.asset_type} — v${v.version}`,
    }))

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {sorted.map(v => {
          const isSelected = v.id === selectedId || (v.is_selected && !selectedId)
          const slideIndex = slides.findIndex(s => s.src === v.image_url)

          return (
            <div
              key={v.id}
              className={`shrink-0 w-36 rounded-xl border-2 overflow-hidden transition-all ${
                isSelected
                  ? 'border-amber-500 ring-2 ring-amber-500/30'
                  : 'border-stone-700 hover:border-stone-500 opacity-80 hover:opacity-100'
              } ${disabled ? 'opacity-50' : ''}`}
            >
              <div className="relative group/zoom aspect-[4/3] bg-white">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(v.id)}
                  className="absolute inset-0 w-full h-full disabled:cursor-wait"
                >
                  {v.image_url
                    ? <img src={v.image_url} alt="" className="w-full h-full object-contain pointer-events-none" />
                    : <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">—</div>
                  }
                </button>
                {v.image_url && !disabled && (
                  <>
                    <button
                      type="button"
                      aria-label="Mode théâtre"
                      onClick={e => {
                        e.stopPropagation()
                        setLightbox({ index: slideIndex >= 0 ? slideIndex : 0 })
                      }}
                      className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-lg bg-stone-950/75 text-stone-200
                        flex items-center justify-center opacity-0 group-hover/zoom:opacity-100
                        focus:opacity-100 hover:bg-amber-500 hover:text-stone-950 transition-all shadow-lg border border-stone-700/80"
                    >
                      <LoupeIcon />
                    </button>
                    {onDelete && (
                      <button
                        type="button"
                        aria-label="Supprimer cette version"
                        onClick={e => {
                          e.stopPropagation()
                          onDelete(v.id, v.version)
                        }}
                        className="absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-lg bg-stone-950/75 text-stone-200
                          flex items-center justify-center opacity-0 group-hover/zoom:opacity-100
                          focus:opacity-100 hover:bg-red-600 hover:text-white transition-all shadow-lg border border-stone-700/80"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(v.id)}
                className="w-full p-2 bg-stone-900 space-y-0.5 text-left disabled:cursor-wait"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-stone-200">v{v.version}</span>
                  {isSelected && (
                    <span className="text-[9px] uppercase tracking-wide text-amber-400 font-semibold">active</span>
                  )}
                </div>
                <p className="text-[10px] text-stone-500">{SOURCE_LABELS[v.source] ?? v.source}</p>
                <p className="text-[10px] text-stone-600">{formatDate(v.created_at)}</p>
                {v.image_url && (
                  <a
                    href={v.image_url}
                    download={isSvgUrl(v.image_url) ? `laser-v${v.version}.svg` : undefined}
                    onClick={e => e.stopPropagation()}
                    className="inline-block mt-1 text-[10px] text-amber-500/90 hover:text-amber-400"
                  >
                    ⬇ Télécharger
                  </a>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {lightbox && slides.length > 0 && (
        <ImageLightbox
          images={slides}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
