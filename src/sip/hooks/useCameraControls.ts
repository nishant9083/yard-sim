import { useEffect, useRef, type Dispatch, type PointerEvent, type RefObject, type SetStateAction } from 'react'
import type { Point } from '@/sip/model'
import { panBy, zoomAt, type Camera } from '@/sip/render'

interface Options {
  canvasRef: RefObject<HTMLCanvasElement | null>
  setCamera: Dispatch<SetStateAction<Camera>>
  onTap: (screen: Point) => void
  onMove: (screen: Point) => void
  onLeave: () => void
  onDoubleClick: () => void
}

const DRAG_THRESHOLD = 4

/** Wheel zoom, drag pan, tap detection. Returns props to spread on the canvas. */
export function useCameraControls({ canvasRef, setCamera, onTap, onMove, onLeave, onDoubleClick }: Options) {
  const drag = useRef<{ id: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      setCamera((c) => zoomAt(c, { x: e.clientX - rect.left, y: e.clientY - rect.top }, factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvasRef, setCamera])

  const local = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  return {
    onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false }
    },
    onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
      const d = drag.current
      if (!d) return onMove(local(e))
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) d.moved = true
      if (d.moved) {
        const dx = e.clientX - d.lastX
        const dy = e.clientY - d.lastY
        setCamera((c) => panBy(c, dx, dy))
      }
      d.lastX = e.clientX
      d.lastY = e.clientY
    },
    onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
      const d = drag.current
      drag.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      if (d && !d.moved) onTap(local(e))
    },
    onPointerLeave() {
      if (!drag.current) onLeave()
    },
    onDoubleClick,
  }
}
