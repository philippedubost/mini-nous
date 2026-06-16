import { useCallback, useEffect, useState } from 'react'

function LoupeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
      <path d="M11 8v6M8 11h6" strokeWidth="2" />
    </svg>
  )
}

export function ImageWithZoom({ src, alt, label, className = '', imgClassName = 'w-full h-full object-contain', disabled }) {
  const [open, setOpen] = useState(false)

  if (!src) return null

  return (
    <>
      <div className={`relative group/zoom ${className}`}>
        <img src={src} alt={alt ?? label ?? ''} className={imgClassName} />
        {!disabled && (
          <button
            type="button"
            aria-label="Agrandir"
            onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-stone-950/75 text-stone-200
              flex items-center justify-center opacity-0 group-hover/zoom:opacity-100
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
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)

  const current = list[index] ?? list[0]

  const resetView = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    resetView()
  }, [index, resetView])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && list.length > 1) setIndex(i => (i - 1 + list.length) % list.length)
      if (e.key === 'ArrowRight' && list.length > 1) setIndex(i => (i + 1) % list.length)
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(4, s + 0.25))
      if (e.key === '-') setScale(s => Math.max(0.5, s - 0.25))
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, list.length])

  const onWheel = e => {
    e.preventDefault()
    setScale(s => Math.min(4, Math.max(0.5, s - e.deltaY * 0.001)))
  }

  const onPointerDown = e => {
    if (scale <= 1) return
    setDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const onPointerMove = e => {
    if (!dragging || !dragStart) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const onPointerUp = () => {
    setDragging(false)
    setDragStart(null)
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/92 flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.title ?? 'Aperçu image'}
    >
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 border-b border-stone-800 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-200 truncate">{current.title ?? 'Image'}</p>
          {list.length > 1 && (
            <p className="text-xs text-stone-500">{index + 1} / {list.length}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
            className="w-9 h-9 rounded-lg bg-stone-800 text-stone-200 hover:bg-stone-700 text-lg"
          >
            −
          </button>
          <span className="text-xs text-stone-400 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale(s => Math.min(4, s + 0.25))}
            className="w-9 h-9 rounded-lg bg-stone-800 text-stone-200 hover:bg-stone-700 text-lg"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="px-3 h-9 rounded-lg bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs"
          >
            Ajuster
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-stone-800 text-stone-200 hover:bg-stone-700 text-xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center overflow-hidden touch-none select-none"
        onClick={e => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <img
          src={current.src}
          alt={current.title ?? ''}
          draggable={false}
          className="max-w-[min(96vw,100%)] max-h-[min(82vh,100%)] object-contain transition-transform duration-75"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          onClick={e => {
            e.stopPropagation()
            if (scale === 1) setScale(2)
          }}
        />
      </div>

      {list.length > 1 && (
        <div
          className="flex items-center justify-center gap-3 py-3 border-t border-stone-800 shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setIndex(i => (i - 1 + list.length) % list.length)}
            className="px-4 py-2 rounded-lg bg-stone-800 text-stone-200 hover:bg-stone-700 text-sm"
          >
            ← Précédent
          </button>
          <button
            type="button"
            onClick={() => setIndex(i => (i + 1) % list.length)}
            className="px-4 py-2 rounded-lg bg-stone-800 text-stone-200 hover:bg-stone-700 text-sm"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}
