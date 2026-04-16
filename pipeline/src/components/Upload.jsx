import { useRef, useState, useCallback } from 'react'
import { detectFaces, drawBoxes } from '../lib/faceDetect'

export default function Upload({ onReady }) {
  const [preview, setPreview] = useState(null)
  const [faceCount, setFaceCount] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [file, setFile] = useState(null)
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const inputRef = useRef(null)
  const detectionRef = useRef(null) // { boxes, naturalWidth, naturalHeight }

  const redrawBoxes = useCallback(() => {
    if (!canvasRef.current || !imgRef.current || !detectionRef.current) return
    const { boxes, naturalWidth, naturalHeight } = detectionRef.current
    if (!boxes.length) return
    const r = imgRef.current.getBoundingClientRect()
    drawBoxes(canvasRef.current, boxes, naturalWidth, naturalHeight, r.width, r.height)
  }, [])

  const handleFile = useCallback(async (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setFaceCount(null)
    detectionRef.current = null
    const url = URL.createObjectURL(f)
    setPreview(url)
    setDetecting(true)
    try {
      const { count, boxes, naturalWidth, naturalHeight } = await detectFaces(f)
      detectionRef.current = { boxes, naturalWidth, naturalHeight }
      setFaceCount(count)
      requestAnimationFrame(() => redrawBoxes())
    } catch {
      setFaceCount(0)
    } finally {
      setDetecting(false)
    }
  }, [redrawBoxes])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-stone-600 rounded-xl p-6 text-center cursor-pointer hover:border-amber-500 transition-colors"
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
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>

      {preview && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-400">
            {detecting
              ? '🔍 Détection des visages…'
              : faceCount === 0
              ? '⚠️ Aucun visage détecté — prompt générique'
              : `✅ ${faceCount} personne${faceCount > 1 ? 's' : ''} détectée${faceCount > 1 ? 's' : ''}`}
          </span>
          <button
            className="text-stone-500 hover:text-stone-300 underline"
            onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
          >
            Changer
          </button>
        </div>
      )}

      <button
        disabled={!file || detecting}
        onClick={() => onReady(file, faceCount ?? 0)}
        className="w-full py-3 rounded-xl font-semibold transition-colors bg-amber-500 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-500 disabled:cursor-not-allowed text-stone-950"
      >
        {detecting ? 'Analyse en cours…' : 'Lancer la génération'}
      </button>
    </div>
  )
}
