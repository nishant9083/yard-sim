import { signalAnchorX, type Point, type RouteIndicatorRoute, type Signal, type SignalElement } from '@/sip/model'
import type { StationLayout } from '@/sip/layout'
import { worldToScreen, type Camera } from './camera'
import { symbolRadius } from './scales'
import { rotateAbout, rotatedBox, trackScreenAngle } from './trackAngle'

export interface SignalPart {
  element: SignalElement
  cx: number
  cy: number
  /** Width along the head, px. */
  w: number
}

/**
 * Everything except `bbox` is in the signal's own frame: laid out as if the line were level, with the post
 * standing straight up or down from `foot`. The frame is turned by `angle` about `foot` so the post stands
 * perpendicular to the line; draw inside {@link withSignalFrame} and map single points with {@link signalToScreen}.
 */
export interface SignalGeometry {
  r: number
  /** Screen rotation of the frame about `foot`, radians (the line's slope at the post). */
  angle: number
  /** +1 when the head is below the track on screen, -1 when above. */
  sgn: 1 | -1
  /** +1 for a head that runs east, -1 west. */
  dir: 1 | -1
  /** Way the head faces; it turns the route indicator with the head. */
  headDir: Signal['headDir']
  foot: { x: number; y: number }
  anchor: { x: number; y: number }
  parts: SignalPart[]
  /** Boards hung from the wire, outward from the head: SL / DL first, then the loco pilot board. */
  boards: SignalBoard[]
  /** Screen-space box around the turned symbol (for hit testing and label avoidance). */
  bbox: { x: number; y: number; w: number; h: number }
}

export interface SignalBoard {
  kind: 'SL' | 'DL' | 'LP'
  /** Centre in the signal frame. */
  x: number
  y: number
  w: number
  h: number
}

/** Boards on a post, outward from the head along the wire, one below the other. */
export const BOARD_SIZE = { w: 2.6, h: 2, first: 3.4, step: 2.6 } as const

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
    case 'speedBoard':
      return r * 2.9
  }
}

/**
 * Speed board triangle in the signal frame, lying along the head and pointing the way the head faces (east or
 * west): base across the head on the post side, apex at the outer end.
 */
export function speedBoardTriangle(part: SignalPart, g: Pick<SignalGeometry, 'r' | 'dir'>): [Point, Point, Point] {
  const half = part.w / 2
  const baseX = part.cx - g.dir * half
  const spread = g.r * 1.25
  return [
    { x: part.cx + g.dir * half, y: part.cy },
    { x: baseX, y: part.cy - spread },
    { x: baseX, y: part.cy + spread },
  ]
}

/** Map a point from the signal frame to the screen. */
export function signalToScreen(g: Pick<SignalGeometry, 'foot' | 'angle'>, p: Point): Point {
  return rotateAbout(p, g.foot, g.angle)
}

/** Run `draw` with the canvas turned into the signal frame. */
export function withSignalFrame(ctx: CanvasRenderingContext2D, g: Pick<SignalGeometry, 'foot' | 'angle'>, draw: () => void): void {
  ctx.save()
  if (g.angle !== 0) {
    ctx.translate(g.foot.x, g.foot.y)
    ctx.rotate(g.angle)
    ctx.translate(-g.foot.x, -g.foot.y)
  }
  draw()
  ctx.restore()
}

export interface RouteIndicatorArm {
  route: RouteIndicatorRoute
  from: Point
  to: Point
}

/**
 * Arms of a route indicator part, in screen px. All start at the pivot (the vertex of the "<", at the end of the head
 * next to the post). The diagonals open outward; the left / right arms stand perpendicular to the head. The figure
 * turns with the head: facing east the driver's left is up on the sheet, facing west it is down.
 */
export function routeIndicatorArms(part: SignalPart, g: Pick<SignalGeometry, 'r' | 'dir'>): RouteIndicatorArm[] {
  const { element, cx, cy, w } = part
  if (element.kind !== 'routeIndicator') return []
  const { r, dir } = g
  const pivot = { x: cx - dir * (w / 2), y: cy }
  const left = -dir // screen y sign of the driver's left
  const diag = r * 0.85
  const arm = r * 1.15
  const tip: Record<RouteIndicatorRoute, Point> = {
    left: { x: pivot.x, y: cy + left * arm },
    upperLeft: { x: pivot.x + dir * w, y: cy + left * diag },
    upperRight: { x: pivot.x + dir * w, y: cy - left * diag },
    right: { x: pivot.x, y: cy - left * arm },
  }
  return element.routes.map((route) => ({ route, from: pivot, to: tip[route] }))
}

/** Screen-space layout of one signal, shared by drawing and hit testing. */
export function signalGeometry(layout: StationLayout, camera: Camera, signal: Signal): SignalGeometry | null {
  const trackY = layout.trackY(signal.trackId, signal.footX)
  if (trackY === null) return null
  const r = symbolRadius(camera.zoom)
  const sgn = signal.side === 'above' ? -1 : 1
  const dir = signal.headDir === 'east' ? 1 : -1
  const foot = worldToScreen(camera, { x: signal.footX, y: trackY })
  const angle = trackScreenAngle(layout, camera, signal.trackId, signal.footX)
  const rowY = foot.y + sgn * (r * 3.4 + 3)
  // Wire from the post to the head: the printed offset, laid along the head in the frame.
  const anchor = { x: worldToScreen(camera, { x: signalAnchorX(signal), y: 0 }).x, y: rowY }

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
  const kinds: SignalBoard['kind'][] = [...(signal.board ? [signal.board] : []), ...(signal.locoPilotBoard ? (['LP'] as const) : [])]
  const boards = kinds.map((kind, i) => ({
    kind,
    x: anchor.x + dir * r * BOARD_SIZE.w,
    y: rowY + sgn * r * (BOARD_SIZE.first + i * BOARD_SIZE.step),
    w: r * BOARD_SIZE.w,
    h: r * BOARD_SIZE.h,
  }))
  const extra = boards.length ? r * (BOARD_SIZE.w + (boards.length - 1) * BOARD_SIZE.step) : 0
  const localBox = {
    x: minX - 3,
    y: (sgn === -1 ? top - extra : top) - 2,
    w: maxX - minX + 6,
    h: bottom - top + extra + 4,
  }
  return {
    r,
    angle,
    sgn,
    dir,
    headDir: signal.headDir,
    foot,
    anchor,
    parts,
    boards,
    bbox: rotatedBox(localBox, foot, angle),
  }
}
