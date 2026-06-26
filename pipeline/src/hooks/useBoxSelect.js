import { useCallback, useEffect, useRef, useState } from 'react'

function rectsIntersect(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export function useBoxSelect(boardRef, { onChange }) {
  const [rect, setRect] = useState(null)
  const startRef = useRef(null)
  const additiveRef = useRef(false)
  const selectingRef = useRef(false)

  const finish = useCallback((clientX, clientY, additive) => {
    const start = startRef.current
    if (!start || !boardRef.current) return
    const boardBox = boardRef.current.getBoundingClientRect()
    const sel = {
      left: Math.min(start.x, clientX),
      top: Math.min(start.y, clientY),
      right: Math.max(start.x, clientX),
      bottom: Math.max(start.y, clientY),
    }
    const hit = new Set()
    boardRef.current.querySelectorAll('[data-order-card]').forEach(el => {
      const box = el.getBoundingClientRect()
      if (rectsIntersect(sel, box)) hit.add(el.dataset.orderCard)
    })
    onChange(hit, additive)
    startRef.current = null
    selectingRef.current = false
    setRect(null)
  }, [boardRef, onChange])

  useEffect(() => {
    const onMove = (e) => {
      if (!selectingRef.current || !startRef.current) return
      const s = startRef.current
      setRect({
        left: Math.min(s.x, e.clientX),
        top: Math.min(s.y, e.clientY),
        width: Math.abs(e.clientX - s.x),
        height: Math.abs(e.clientY - s.y),
      })
    }
    const onUp = (e) => {
      if (!selectingRef.current) return
      finish(e.clientX, e.clientY, additiveRef.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [finish])

  const onBoardMouseDown = (e) => {
    if (e.button !== 0) return
    if (e.target.closest('[data-order-card]')) return
    if (!boardRef.current?.contains(e.target)) return
    additiveRef.current = e.shiftKey
    startRef.current = { x: e.clientX, y: e.clientY }
    selectingRef.current = true
    setRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 })
    e.preventDefault()
  }

  return { rect, onBoardMouseDown }
}
