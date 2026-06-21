import { useEffect, useRef, useState } from 'react'
import { detectPersonsFromUrl } from '../lib/faceDetect'

function equalBoxes(count) {
  const pad = 0.03
  const slot = 1 / count
  return Array.from({ length: count }, (_, i) => ({
    x: i * slot + pad * 0.5,
    y: 0.06,
    w: slot - pad,
    h: 0.88,
  }))
}

function pickBoxes(raw, faceCount) {
  if (!faceCount || faceCount < 1) return []
  const sorted = [...raw].sort((a, b) => a.x - b.x)
  if (sorted.length === faceCount) return sorted
  if (sorted.length > faceCount) {
    return sorted
      .map((b, i) => ({ ...b, area: b.w * b.h, i }))
      .sort((a, b) => b.area - a.area)
      .slice(0, faceCount)
      .sort((a, b) => a.x - b.x)
  }
  return equalBoxes(faceCount)
}

export default function LineartPersonOverlay({ src, alt, faceCount, sourcePhotoUrl }) {
  const wrapRef = useRef(null)
  const [boxes, setBoxes] = useState(() => equalBoxes(faceCount))

  useEffect(() => {
    let cancelled = false
    setBoxes(equalBoxes(faceCount))

    if (!sourcePhotoUrl || !faceCount) return undefined

    detectPersonsFromUrl(sourcePhotoUrl, 0.35)
      .then(detected => {
        if (cancelled) return
        setBoxes(pickBoxes(detected, faceCount))
      })
      .catch(() => {
        if (!cancelled) setBoxes(equalBoxes(faceCount))
      })

    return () => { cancelled = true }
  }, [sourcePhotoUrl, faceCount, src])

  return (
    <div ref={wrapRef} className="customer-lineart-overlay">
      <img src={src} alt={alt} className="customer-lineart-img" draggable={false} />
      {boxes.map((b, i) => (
        <div
          key={i}
          className="customer-person-box"
          style={{
            left: `${b.x * 100}%`,
            top: `${b.y * 100}%`,
            width: `${b.w * 100}%`,
            height: `${b.h * 100}%`,
          }}
        >
          <span className="customer-person-num" aria-hidden>{i + 1}</span>
        </div>
      ))}
    </div>
  )
}
