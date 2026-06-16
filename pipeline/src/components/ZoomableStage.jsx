import { useCallback, useRef, useState } from 'react'

function LoupeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function ZoomControls({ scale, onZoomIn, onZoomOut, onReset }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onZoomOut} className="w-6 h-6 rounded bg-stone-800 text-stone-300 text-sm hover:bg-stone-700">−</button>
      <span className="text-[10px] tabular-nums text-stone-500 w-10 text-center">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={onZoomIn} className="w-6 h-6 rounded bg-stone-800 text-stone-300 text-sm hover:bg-stone-700">+</button>
      <button type="button" onClick={onReset} className="px-1.5 h-6 rounded bg-stone-800 text-stone-400 text-[10px] hover:bg-stone-700">Ajuster</button>
    </div>
  )
}

function ZoomViewport({ children, scale, pan, onScaleChange, onPanChange, className = '' }) {
  const ref = useRef(null)
  const dragging = useRef(null)

  const onWheel = useCallback(e => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    onScaleChange(s => Math.min(8, Math.max(0.25, s * delta)))
  }, [onScaleChange])

  const onPointerDown = e => {
    if (e.button !== 0) return
    dragging.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = e => {
    if (!dragging.current) return
    onPanChange({
      x: e.clientX - dragging.current.x,
      y: e.clientY - dragging.current.y,
    })
  }

  const onPointerUp = () => { dragging.current = null }

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-white rounded-lg border border-stone-700 touch-none select-none ${className}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{ cursor: dragging.current ? 'grabbing' : 'grab', minHeight: '180px' }}
    >
      <div
        className="origin-top-left w-full h-full flex items-center justify-center p-2"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}

function StageModal({ title, onClose, children }) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/92 flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 border-b border-stone-800 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-stone-200">{title}</p>
        <div className="flex items-center gap-3">
          <ZoomControls
            scale={scale}
            onZoomIn={() => setScale(s => Math.min(12, s + 0.25))}
            onZoomOut={() => setScale(s => Math.max(0.25, s - 0.25))}
            onReset={() => { setScale(1); setPan({ x: 0, y: 0 }) }}
          />
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-stone-800 text-stone-200 text-xl">×</button>
        </div>
      </div>
      <div className="flex-1 p-4 min-h-0" onClick={e => e.stopPropagation()}>
        <ZoomViewport
          scale={scale}
          pan={pan}
          onScaleChange={setScale}
          onPanChange={setPan}
          className="w-full h-full min-h-[60vh]"
        >
          {children}
        </ZoomViewport>
      </div>
    </div>
  )
}

export default function ZoomableStage({ label, children, empty, className = '' }) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fullscreen, setFullscreen] = useState(false)

  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }) }

  if (empty) {
    return (
      <div className={`space-y-2 ${className}`}>
        <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">{label}</p>
        <div className="aspect-[4/3] rounded-lg border border-dashed border-stone-700 flex items-center justify-center text-center p-4 bg-stone-950/30">
          {empty}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">{label}</p>
          <div className="flex items-center gap-2">
            <ZoomControls
              scale={scale}
              onZoomIn={() => setScale(s => Math.min(8, s + 0.25))}
              onZoomOut={() => setScale(s => Math.max(0.25, s - 0.25))}
              onReset={reset}
            />
            <button
              type="button"
              aria-label="Plein écran"
              onClick={() => setFullscreen(true)}
              className="w-6 h-6 rounded bg-stone-800 text-stone-300 flex items-center justify-center hover:bg-amber-500 hover:text-stone-950"
            >
              <LoupeIcon />
            </button>
          </div>
        </div>
        <ZoomViewport
          scale={scale}
          pan={pan}
          onScaleChange={setScale}
          onPanChange={setPan}
        >
          {children}
        </ZoomViewport>
        <p className="text-[9px] text-stone-600">Molette = zoom · glisser = déplacer</p>
      </div>

      {fullscreen && (
        <StageModal title={label} onClose={() => setFullscreen(false)}>
          {children}
        </StageModal>
      )}
    </>
  )
}
