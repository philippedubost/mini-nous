import { useEffect, useState } from 'react'

function isSvgUrl(url) {
  return /\.svg(\?|$)/i.test(url ?? '')
    || (url ?? '').includes('image/svg')
    || (url ?? '').startsWith('data:image/svg')
}

function LoupeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
      <path d="M11 8v6M8 11h6" strokeWidth="2" />
    </svg>
  )
}

export function ImageWithZoom({ src, alt, label, className = '', imgClassName = 'w-full h-full object-contain', disabled }) {
  const [open, setOpen] = useState(false)

  if (!src) return null

  const openLightbox = e => {
    e.stopPropagation()
    e.preventDefault()
    setOpen(true)
  }

  return (
    <>
      <div
        className={`relative group/zoom cursor-zoom-in ${className}`}
        onClick={disabled ? undefined : openLightbox}
        onKeyDown={disabled ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') openLightbox(e) }}
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        aria-label={disabled ? undefined : `Agrandir : ${label ?? alt ?? 'image'}`}
      >
        <img src={src} alt={alt ?? label ?? ''} className={imgClassName} draggable={false} />
        {!disabled && (
          <button
            type="button"
            aria-label="Agrandir"
            onClick={openLightbox}
            className="absolute top-2 right-2 w-14 h-14 rounded-xl bg-stone-950/75 text-stone-200
              flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover/zoom:opacity-100
              hover:bg-amber-500 hover:text-stone-950 transition-all shadow-lg border border-stone-700/80"
          >
            <LoupeIcon />
          </button>
        )}
      </div>
      {open && (
        <ImageLightbox
          src={src}
          title={label ?? alt}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

export default function ImageLightbox({ src, title, onClose, images, initialIndex = 0 }) {
  const list = images?.length ? images : [{ src, title }]
  const [index, setIndex] = useState(initialIndex)

  const current = list[index] ?? list[0]
  const whiteCanvas = isSvgUrl(current.src)

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && list.length > 1) setIndex(i => (i - 1 + list.length) % list.length)
      if (e.key === 'ArrowRight' && list.length > 1) setIndex(i => (i + 1) % list.length)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, list.length])

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.title ?? 'Aperçu image'}
    >
      <div
        className="absolute inset-0 bg-cover bg-center scale-110 blur-3xl brightness-[0.4] saturate-125"
        style={{ backgroundImage: `url("${current.src}")` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-stone-950/55" aria-hidden />

      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 w-11 h-11 rounded-xl bg-stone-950/70 text-stone-100
          hover:bg-stone-800 text-2xl leading-none shadow-lg border border-stone-600/50"
        aria-label="Fermer"
      >
        ×
      </button>

      {current.title && (
        <p className="absolute top-5 left-4 right-16 z-20 text-sm font-medium text-stone-100 truncate drop-shadow-md">
          {current.title}
        </p>
      )}

      <div
        className="relative z-10 flex-1 flex items-center justify-center w-full h-full min-h-0 p-2 sm:p-4"
        onClick={e => e.stopPropagation()}
      >
        <div
          className={`w-full h-full flex items-center justify-center ${
            whiteCanvas ? 'bg-white/95 rounded-xl shadow-2xl p-4 sm:p-8 max-w-[100vw] max-h-[100vh]' : ''
          }`}
        >
          <img
            src={current.src}
            alt={current.title ?? ''}
            draggable={false}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {list.length > 1 && (
        <div
          className="relative z-20 flex items-center justify-center gap-3 py-4 shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setIndex(i => (i - 1 + list.length) % list.length)}
            className="px-4 py-2 rounded-xl bg-stone-950/70 text-stone-100 hover:bg-stone-800 text-sm border border-stone-600/50"
          >
            ← Précédent
          </button>
          <span className="text-xs text-stone-300 tabular-nums">{index + 1} / {list.length}</span>
          <button
            type="button"
            onClick={() => setIndex(i => (i + 1) % list.length)}
            className="px-4 py-2 rounded-xl bg-stone-950/70 text-stone-100 hover:bg-stone-800 text-sm border border-stone-600/50"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}
