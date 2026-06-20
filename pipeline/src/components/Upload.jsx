import { useRef, useState, useCallback, useEffect } from 'react'
import { detectPersons, drawBoxes } from '../lib/faceDetect'
import { compressImageFile } from '../lib/compressImage'

const THRESHOLD_DEFAULT = 0.4

export default function Upload({ onReady, initialFaceCount, lockedCount = false, theme = 'dark' }) {
  const light = theme === 'light'
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [count, setCount] = useState(initialFaceCount ?? 3)
  const [threshold, setThreshold] = useState(THRESHOLD_DEFAULT)
  const [detecting, setDetecting] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const inputRef = useRef(null)
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const detectionRef = useRef(null)
  const debounceRef = useRef(null)

  const redrawBoxes = useCallback(() => {
    if (!canvasRef.current || !imgRef.current || !detectionRef.current) return
    const { boxes, naturalWidth, naturalHeight } = detectionRef.current
    if (!boxes.length) { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); return }
    const r = imgRef.current.getBoundingClientRect()
    drawBoxes(canvasRef.current, boxes, naturalWidth, naturalHeight, r.width, r.height)
  }, [])

  const runDetection = useCallback(async (f, thresh) => {
    if (!f) return
    setDetecting(true)
    try {
      const result = await detectPersons(f, thresh)
      detectionRef.current = result
      setCount(result.count > 0 ? result.count : prev => prev)
      requestAnimationFrame(() => redrawBoxes())
    } catch {
      // silently fail — user keeps manual count
    } finally {
      setDetecting(false)
    }
  }, [redrawBoxes])

  const handleFile = useCallback(async (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setPreparing(true)
    setFileError(null)
    try {
      const prepared = await compressImageFile(f)
      setFile(prepared)
      detectionRef.current = null
      setPreview(URL.createObjectURL(prepared))
      await runDetection(prepared, threshold)
    } catch (err) {
      setFileError(err.message || 'Impossible de traiter cette image.')
      setFile(null)
      setPreview(null)
    } finally {
      setPreparing(false)
    }
  }, [threshold, runDetection])

  useEffect(() => {
    if (!file) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runDetection(file, threshold), 400)
    return () => clearTimeout(debounceRef.current)
  }, [threshold, file, runDetection])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  useEffect(() => {
    if (initialFaceCount != null) setCount(initialFaceCount)
  }, [initialFaceCount])

  const dec = () => { if (!lockedCount) setCount(n => Math.max(1, n - 1)) }
  const inc = () => { if (!lockedCount) setCount(n => Math.min(10, n + 1)) }
  const busy = preparing || detecting

  const dropClass = light
    ? 'customer-dropzone'
    : 'border-2 border-dashed border-stone-600 rounded-xl p-4 text-center cursor-pointer hover:border-amber-500 transition-colors'

  const panelClass = light
    ? 'customer-upload-panel'
    : 'bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 space-y-3'

  return (
    <div className="space-y-4">
      <div
        className={dropClass}
        onClick={() => !preparing && inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
      >
        {preview ? (
          <div className="relative inline-block w-full max-w-sm">
            <img
              ref={imgRef}
              src={preview}
              alt="preview"
              className="rounded-lg w-full object-contain max-h-64"
              onLoad={redrawBoxes}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        ) : (
          <div className={`py-8 ${light ? 'customer-muted' : 'text-stone-400'}`}>
            <div className="text-4xl mb-2">{preparing ? '⏳' : '📷'}</div>
            <p>{preparing ? 'Compression de la photo…' : 'Déposer une photo de groupe'}</p>
            <p className={`text-sm mt-1 ${light ? 'customer-muted' : 'text-stone-500'}`}>
              ou cliquer pour choisir · compressé auto si &gt; 3 Mo
            </p>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" disabled={preparing}
          onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {fileError && (
        <p className={`text-sm text-center ${light ? 'text-red-600' : 'text-red-400'}`}>{fileError}</p>
      )}

      <div className={panelClass}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${light ? 'text-[#2C1F14]' : 'text-stone-300'}`}>Personnes</span>
            {(detecting || preparing) && (
              <span className={`text-[10px] flex items-center gap-1 ${light ? 'text-[#C0684A]' : 'text-amber-400/70'}`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse inline-block ${light ? 'bg-[#C0684A]' : 'bg-amber-400'}`} />
                {preparing ? 'compression…' : 'détection…'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={dec} disabled={lockedCount}
              className={`w-8 h-8 rounded-lg font-bold text-lg flex items-center justify-center disabled:opacity-40 ${
                light ? 'bg-[#F5EDE0] hover:bg-[#FAF0EB] text-[#2C1F14]' : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
              }`}>
              −
            </button>
            <span className={`text-xl font-bold tabular-nums w-6 text-center ${light ? 'text-[#C0684A]' : 'text-amber-400'}`}>{count}</span>
            <button type="button" onClick={inc} disabled={lockedCount}
              className={`w-8 h-8 rounded-lg font-bold text-lg flex items-center justify-center disabled:opacity-40 ${
                light ? 'bg-[#F5EDE0] hover:bg-[#FAF0EB] text-[#2C1F14]' : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
              }`}>
              +
            </button>
          </div>
        </div>

        {file && (
          <div className="space-y-1.5">
            <div className={`flex items-center justify-between text-xs ${light ? 'customer-muted' : 'text-stone-500'}`}>
              <span>Sensibilité détection</span>
              <span className="tabular-nums">{Math.round(threshold * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className={`w-full cursor-pointer ${light ? 'accent-[#C0684A]' : 'accent-amber-500'}`}
            />
            <div className={`flex justify-between text-[10px] ${light ? 'customer-muted' : 'text-stone-600'}`}>
              <span>Large (+ faux positifs)</span>
              <span>Strict (− détections)</span>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <button type="button"
          className={`text-xs underline w-full text-center ${light ? 'customer-link' : 'text-stone-500 hover:text-stone-300'}`}
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
          Changer la photo
        </button>
      )}

      <button
        type="button"
        disabled={!file || busy}
        onClick={() => onReady(file, count)}
        className={light
          ? 'customer-btn-clay w-full disabled:opacity-50'
          : 'w-full py-3 rounded-xl font-semibold transition-colors bg-amber-500 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-500 disabled:cursor-not-allowed text-stone-950'}
      >
        Lancer la génération
      </button>
    </div>
  )
}
