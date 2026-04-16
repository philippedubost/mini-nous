import { useRef, useState, useCallback, useEffect } from 'react'
import { detectPersons, drawBoxes } from '../lib/faceDetect'

const THRESHOLD_DEFAULT = 0.4

export default function Upload({ onReady }) {
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [count, setCount] = useState(3)
  const [threshold, setThreshold] = useState(THRESHOLD_DEFAULT)
  const [detecting, setDetecting] = useState(false)
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

  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    detectionRef.current = null
    setPreview(URL.createObjectURL(f))
    runDetection(f, threshold)
  }, [threshold, runDetection])

  // Re-run detection when threshold slider changes (debounced 400ms)
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

  const dec = () => setCount(n => Math.max(1, n - 1))
  const inc = () => setCount(n => Math.min(10, n + 1))

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-stone-600 rounded-xl p-4 text-center cursor-pointer hover:border-amber-500 transition-colors"
        onClick={() => inputRef.current?.click()}
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
          <div className="py-8 text-stone-400">
            <div className="text-4xl mb-2">📷</div>
            <p>Déposer une photo de groupe</p>
            <p className="text-sm mt-1 text-stone-500">ou cliquer pour choisir</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {/* Person counter */}
      <div className="bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-300">Personnes</span>
            {detecting && (
              <span className="text-[10px] text-amber-400/70 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                détection…
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={dec}
              className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-lg flex items-center justify-center">
              −
            </button>
            <span className="text-xl font-bold text-amber-400 tabular-nums w-6 text-center">{count}</span>
            <button onClick={inc}
              className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-lg flex items-center justify-center">
              +
            </button>
          </div>
        </div>

        {/* Sensitivity slider — only shown once a file is loaded */}
        {file && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Sensibilité détection</span>
              <span className="tabular-nums text-stone-400">{Math.round(threshold * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-600">
              <span>Large (+ faux positifs)</span>
              <span>Strict (− détections)</span>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <button className="text-xs text-stone-500 hover:text-stone-300 underline w-full text-center"
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
          Changer la photo
        </button>
      )}

      <button
        disabled={!file}
        onClick={() => onReady(file, count)}
        className="w-full py-3 rounded-xl font-semibold transition-colors bg-amber-500 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-500 disabled:cursor-not-allowed text-stone-950"
      >
        Lancer la génération
      </button>
    </div>
  )
}
