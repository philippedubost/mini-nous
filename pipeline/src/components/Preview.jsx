import { useEffect, useRef, useState } from 'react'

async function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// Map dark pixels → toColor, light pixels stay white
function recolorCanvas(img, toColor) {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth || img.width
  c.height = img.naturalHeight || img.height
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  for (let i = 0; i < d.data.length; i += 4) {
    const luma = (0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]) / 255
    d.data[i]     = Math.round(toColor[0] + (255 - toColor[0]) * luma)
    d.data[i + 1] = Math.round(toColor[1] + (255 - toColor[1]) * luma)
    d.data[i + 2] = Math.round(toColor[2] + (255 - toColor[2]) * luma)
  }
  ctx.putImageData(d, 0, 0)
  return c
}

// Apply blur + contrast curve to crush soft edges into thick dark zones
function applyBurnCurve(srcCanvas, blurPx = 3, contrast = 500, brightness = 0.35) {
  const c = document.createElement('canvas')
  c.width = srcCanvas.width
  c.height = srcCanvas.height
  const ctx = c.getContext('2d')
  ctx.filter = `blur(${blurPx}px) contrast(${contrast}%) brightness(${brightness})`
  ctx.drawImage(srcCanvas, 0, 0)
  ctx.filter = 'none'
  return c
}

function canvasToDataUrl(c) {
  return c.toDataURL('image/png')
}

export default function Preview({ url2, url3 }) {
  const previewRef = useRef(null)
  const engraveRef = useRef(null)
  const [engravingUrl, setEngravingUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!url2 || !url3) return

    let cancelled = false
    ;(async () => {
      try {
        const [img2, img3] = await Promise.all([loadImg(url2), loadImg(url3)])
        if (cancelled) return

        const W = img2.naturalWidth || img2.width
        const H = img2.naturalHeight || img2.height

        // ── PREVIZ : blue line art + red outline (multiply) ─────────────
        {
          const canvas = previewRef.current
          canvas.width = W
          canvas.height = H
          const ctx = canvas.getContext('2d')

          const blueC = recolorCanvas(img2, [30, 110, 220])
          ctx.drawImage(blueC, 0, 0)

          const redC = recolorCanvas(img3, [220, 30, 30])
          ctx.globalCompositeOperation = 'multiply'
          ctx.drawImage(redC, 0, 0)
          ctx.globalCompositeOperation = 'source-over'
        }

        // ── ÉTAPE 4 : engraving mask ─────────────────────────────────────
        {
          const mulC = document.createElement('canvas')
          mulC.width = W
          mulC.height = H
          const mctx = mulC.getContext('2d')
          mctx.drawImage(img2, 0, 0)
          mctx.globalCompositeOperation = 'multiply'
          mctx.drawImage(img3, 0, 0)
          mctx.globalCompositeOperation = 'source-over'

          // Blur + burn curve → thick dark engraving zones
          const burned = applyBurnCurve(mulC, 3, 500, 0.35)

          const canvas = engraveRef.current
          canvas.width = W
          canvas.height = H
          const ctx = canvas.getContext('2d')
          ctx.drawImage(burned, 0, 0)

          if (!cancelled) setEngravingUrl(canvasToDataUrl(burned))
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    })()

    return () => { cancelled = true }
  }, [url2, url3])

  return (
    <div className="space-y-6">
      {/* Previz */}
      <div className="rounded-xl border border-stone-700 bg-stone-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
          <span className="font-medium text-stone-200 text-sm">Previz — composition couleur</span>
          <span className="text-xs text-stone-500">bleu × rouge (multiply)</span>
        </div>
        <canvas ref={previewRef} className="w-full block" />
      </div>

      {/* Étape 4 — Engraving */}
      <div className="rounded-xl border border-amber-700/50 bg-stone-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center text-sm font-bold text-stone-950">4</span>
            <span className="font-medium text-stone-200 text-sm">Motif de gravure</span>
          </div>
          <span className="text-xs text-stone-500">multiply + blur + courbes</span>
        </div>
        <canvas ref={engraveRef} className="w-full block" />
        {error && <p className="text-red-400 text-xs p-3">{error}</p>}
        {engravingUrl && (
          <div className="px-4 py-3 border-t border-stone-800">
            <a
              href={engravingUrl}
              download="gravure.png"
              className="inline-block text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              ⬇ Télécharger gravure.png
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
