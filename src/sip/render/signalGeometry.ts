import type { Signal, SignalElement } from '@/sip/model'
import type { StationLayout } from '@/sip/layout'
import { worldToScreen, type Camera } from './camera'
import { symbolRadius } from './scales'

export interface SignalPart {
  element: SignalElement
  cx: number
  cy: number
  /** Width along the head, px. */
  w: number
}

export interface SignalGeometry {
  r: number
  /** +1 when the head is below the track on screen, -1 when above. */
  sgn: 1 | -1
  /** +1 for a head that runs east, -1 west. */
  dir: 1 | -1
  foot: { x: number; y: number }
  anchor: { x: number; y: number }
  parts: SignalPart[]
  bbox: { x: number; y: number; w: number; h: number }
  boardAt: { x: number; y: number } | null
}

const widthOf = (e: SignalElement, r: number): number => {
  switch (e.kind) {
    case 'lamp':
      return r * 2
    case 'marker':
      return r * 1.7
    case 'callingOn':
      return r * 3.1
    case 'routeIndicator':
      return r * 1.5
    case 'shunt':
      return r * 2.4
  }
}

/** Screen-space layout of one signal, shared by drawing and hit testing. */
export function signalGeometry(layout: StationLayout, camera: Camera, signal: Signal): SignalGeometry | null {
  const trackY = layout.trackY(signal.trackId, signal.footX)
  if (trackY === null) return null
  const r = symbolRadius(camera.zoom)
  const sgn = signal.side === 'above' ? -1 : 1
  const dir = signal.headDir === 'east' ? 1 : -1
  const foot = worldToScreen(camera, { x: signal.footX, y: trackY })
  const rowY = foot.y + sgn * (r * 3.4 + 3)
  const anchor = { x: worldToScreen(camera, { x: signal.anchorX, y: 0 }).x, y: rowY }

  const gap = r * 0.35
  let cursor = anchor.x
  const parts: SignalPart[] = signal.elements.map((element) => {
    const w = widthOf(element, r)
    const cx = cursor + dir * (w / 2 + (element.kind === 'routeIndicator' ? 0 : gap * 0.5))
    cursor += dir * (w + gap)
    return { element, cx, cy: rowY, w }
  })

  const xs = [anchor.x, cursor, foot.x]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const top = sgn === -1 ? rowY - r * 1.3 : foot.y
  const bottom = sgn === -1 ? foot.y : rowY + r * 1.3
  const boardAt = signal.board ? { x: anchor.x + dir * r * 2.6, y: rowY + sgn * r * 3.4 } : null
  const extra = boardAt ? r * 2.6 : 0
  return {
    r,
    sgn,
    dir,
    foot,
    anchor,
    parts,
    boardAt,
    bbox: {
      x: minX - 3,
      y: (sgn === -1 ? top - extra : top) - 2,
      w: maxX - minX + 6,
      h: bottom - top + extra + 4,
    },
  }
}
