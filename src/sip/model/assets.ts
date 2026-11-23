import type { Point } from './types'

export type Side = 'above' | 'below'
export type HeadDirection = 'east' | 'west'
export type LampStyle = 'slash' | 'vbar' | 'hbar' | 'solid'
/**
 * One arm of a junction route indicator, named as the driver sees it on the real indicator: from the pivot, an arm
 * points horizontally left, up and to the left, up and to the right, or horizontally right.
 *
 * On the plan the head is drawn lying along the line, so the indicator is drawn turned with it. For a head facing
 * east (driver's left = up on the sheet) the four arms form
 *
 *      |      left
 *      <      upper left (upper diagonal) / upper right (lower diagonal)
 *      |      right
 *
 * and for a head facing west the same figure mirrored (`|>|`, left is the lower arm).
 */
export type RouteIndicatorRoute = 'left' | 'upperLeft' | 'upperRight' | 'right'

/** In the order they are listed and drawn: left to right as the driver sees them. */
export const ROUTE_INDICATOR_ROUTES: { id: RouteIndicatorRoute; label: string; short: string }[] = [
  { id: 'left', label: 'Left', short: '←' },
  { id: 'upperLeft', label: 'Upper left', short: '↖' },
  { id: 'upperRight', label: 'Upper right', short: '↗' },
  { id: 'right', label: 'Right', short: '→' },
]

/** The plain "<" fan of older sheets: both diagonal arms. */
export const DEFAULT_ROUTE_INDICATOR_ROUTES: RouteIndicatorRoute[] = ['upperLeft', 'upperRight']

const ROUTE_ORDER = ROUTE_INDICATOR_ROUTES.map((r) => r.id)
const isRoute = (v: unknown): v is RouteIndicatorRoute => ROUTE_ORDER.includes(v as RouteIndicatorRoute)

/** Distinct arms in the standard order. */
export const sortRoutes = (routes: Iterable<RouteIndicatorRoute>): RouteIndicatorRoute[] => {
  const set = new Set(routes)
  return ROUTE_ORDER.filter((r) => set.has(r))
}

/**
 * Arms of a stored route indicator element, whatever version wrote it:
 *  - `routes: [...]` (current);
 *  - `direction` from earlier versions: `both` or none = the "<" fan; `left` / `right` (driver's side) = that diagonal;
 *    `upleft` / `downright` = the upper drawn diagonal, `upright` / `downleft` = the lower one.
 */
export function routeIndicatorRoutesOf(raw: { routes?: unknown; direction?: unknown }, headDir: HeadDirection): RouteIndicatorRoute[] {
  if (Array.isArray(raw.routes)) {
    const routes = sortRoutes(raw.routes.filter(isRoute))
    if (routes.length) return routes
  }
  const d = raw.direction
  if (d === 'left') return ['upperLeft']
  if (d === 'right') return ['upperRight']
  // The upper diagonal is the driver's upper left when the head faces east, upper right when it faces west.
  const upperDiagonal: RouteIndicatorRoute = headDir === 'east' ? 'upperLeft' : 'upperRight'
  const lowerDiagonal: RouteIndicatorRoute = headDir === 'east' ? 'upperRight' : 'upperLeft'
  if (d === 'upleft' || d === 'downright') return [upperDiagonal]
  if (d === 'upright' || d === 'downleft') return [lowerDiagonal]
  return [...DEFAULT_ROUTE_INDICATOR_ROUTES]
}

/** Parts of a signal head, listed outward from the wire anchor. */
export type SignalElement =
  | { kind: 'lamp'; style: LampStyle }
  | { kind: 'marker'; text: 'P' | 'C' | 'B' | (string & {}) }
  | { kind: 'callingOn' }
  /** Junction route indicator with the arms it can show (any combination, at least one). */
  | { kind: 'routeIndicator'; routes: RouteIndicatorRoute[] }
  | { kind: 'shunt'; text?: string }
  /** Speed restriction board: a triangle with the limit (km/h) printed inside. */
  | { kind: 'speedBoard'; limit: string }

/** `speedBoard` is a post carrying only boards: it shows no aspect and never stops a train. */
export type SignalKind = 'signal' | 'distant' | 'home' | 'starter' | 'advancedStarter' | 'shunt' | 'speedBoard'

/** A signal post. `code` is exactly what the SIP prints beside it. */
export interface Signal {
  id: string
  code: string
  /** Code used in the notes, e.g. S/SH15 or SS14. */
  fullCode?: string
  name: string
  kind: SignalKind
  /** Direction of travel the signal governs. */
  direction: 'UP' | 'DN'
  trackId: string
  /** Where the post stands on the track. */
  footX: number
  /** Legacy: where the wire meets the head. Kept in the JSON but no longer read; see `signalAnchorX`. */
  anchorX: number
  side: Side
  headDir: HeadDirection
  elements: SignalElement[]
  /** Control number on the VDU (see the controls table). */
  control?: number
  /** Territory board on the post: SL entering single line, DL entering double line. */
  board?: 'SL' | 'DL'
  /** Loco pilot board (box with ※, "draw ahead right up to the foot of the signal") on the post. */
  locoPilotBoard?: boolean
  /** Position of the printed label (drawing space). */
  label?: Point
}

/** True when the post can show an aspect (has a lamp or shunt disc), i.e. it is a signal and not just a board. */
export function showsAspect(signal: Pick<Signal, 'elements'>): boolean {
  return signal.elements.some((e) => e.kind === 'lamp' || e.kind === 'shunt' || e.kind === 'callingOn')
}

/** Horizontal gap between a signal's post and its head (drawing units). */
export const SIGNAL_HEAD_OFFSET = 3

/** Where the wire meets the head: 3 units east of the post for an east-facing head, 3 west for a west-facing one. */
export function signalAnchorX(signal: Pick<Signal, 'footX' | 'headDir'>): number {
  return signal.footX + (signal.headDir === 'east' ? SIGNAL_HEAD_OFFSET : -SIGNAL_HEAD_OFFSET)
}

export interface PointMachine {
  id: string
  /** e.g. 31A */
  code: string
  nodeId: string
  connectionId?: string
  ratio: string
  /** CS curved switch, SS straight switch, TWS thick web switch. */
  switch: string
  /** true when the SIP prints no ratio and note 4 supplies the default. */
  ratioInferred: boolean
  control: number
  crankHandle?: string
  label: Point
}

export interface InsulatedJoint {
  id: string
  trackId: string
  x: number
}

/** `left` = "<", `right` = ">", `both` = "<>" (towards the west end, the east end, or both). */
export type LineArrowDirection = 'left' | 'right' | 'both'

/** A direction arrow sitting on a line. Any number can be placed anywhere along any line. */
export interface LineArrow {
  id: string
  trackId: string
  x: number
  direction: LineArrowDirection
}

export type SpanRef = { trackId: string; x0: number; x1: number } | { connectionId: string }

export interface TrackCircuit {
  id: string
  code: string
  kind: 'trackCircuit' | 'axleCounter'
  spans: SpanRef[]
  label: Point
  /** Extent read from joint positions, not printed on the SIP. */
  approx: boolean
  text?: string
}

export interface Platform {
  id: string
  name: string
  kind: 'high' | 'rail'
  text: string
  lengthM: number
  widthM: number
  startChainage?: number
  endChainage?: number
  polygon: Point[]
  label: Point
}

export type StructureKind = 'building' | 'smRoom' | 'fob' | 'goomty' | 'detector' | 'locoPilotBoard' | 'lvv'

/** A rectangle (as drawn by dragging) or any outline (after its corners are edited). */
export type Shape = { type: 'rect'; x0: number; y0: number; x1: number; y1: number } | { type: 'polygon'; points: Point[] }

/** Corners of a shape, clockwise from the top left for a rectangle. */
export function shapePoints(shape: Shape): Point[] {
  if (shape.type === 'polygon') return shape.points
  return [
    { x: shape.x0, y: shape.y0 },
    { x: shape.x1, y: shape.y0 },
    { x: shape.x1, y: shape.y1 },
    { x: shape.x0, y: shape.y1 },
  ]
}

/** Axis-aligned box around a shape. */
export function shapeBox(shape: Shape): { x0: number; y0: number; x1: number; y1: number } {
  const pts = shapePoints(shape)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

export function shapeCentre(shape: Shape): Point {
  const b = shapeBox(shape)
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}

export interface Structure {
  id: string
  kind: StructureKind
  name: string
  shape?: Shape
  /** Post on a line, drawn as a stem from the shape to the track. */
  foot?: { trackId: string; x: number }
  /** For things sitting on a line (LVV dot pairs). */
  at?: { trackId: string; x: number }
  label?: Point
  chainage?: number
}

/** `bridge` (also culverts) or `levelCrossing` (LC gate: the road crossing the lines, with a boom at each end). */
export type BridgeKind = 'bridge' | 'levelCrossing'

export interface Bridge {
  id: string
  /** Missing on older files: a bridge. */
  kind?: BridgeKind
  /**
   * The lines it crosses. Missing = every line at its chainage. When set, it is drawn from the topmost to the
   * bottommost of these lines only.
   */
  trackIds?: string[]
  number: string
  chainage: number
  x: number
  spec: string
  isNew?: boolean
}

export const isLevelCrossing = (b: Pick<Bridge, 'kind'>): boolean => b.kind === 'levelCrossing'

/** "BR 12" / "LC 15" (with "(NEW)" for new works), as printed in the strip above the yard. */
export function bridgeTitle(b: Pick<Bridge, 'kind' | 'number' | 'isNew'>): string {
  return `${isLevelCrossing(b) ? 'LC' : 'BR'} ${b.number}${b.isNew ? ' (NEW)' : ''}`
}

export type ChainageMarkKind = 'PT' | 'FM' | 'DS' | 'DE' | 'PF END' | (string & {})

export interface ChainageMark {
  id: string
  kind: ChainageMarkKind
  chainage: number
  x: number
  lane: 'top' | 'bottom'
}

export interface GradientPost {
  id: string
  direction: 'UP' | 'DN' | 'BOTH'
  x: number
  chainage?: number
  from?: string | null
  to?: string | null
  text: string
}

export type Dimension =
  | { id: string; kind: 'vertical'; x: number; y0: number; y1: number; text: string; label?: Point }
  | { id: string; kind: 'horizontal'; y: number; x0: number; x1: number; text: string; label: Point }

export interface TextMark extends Point {
  id: string
  text: string
  arrow?: 'east' | 'west'
  tone?: 'end' | 'line' | 'csb'
}

export interface TrackBreak {
  trackId: string
  x: number
}

export interface StationAssets {
  points: PointMachine[]
  signals: Signal[]
  joints: InsulatedJoint[]
  lineArrows: LineArrow[]
  trackCircuits: TrackCircuit[]
  platforms: Platform[]
  structures: Structure[]
  bridges: Bridge[]
  chainageMarks: ChainageMark[]
  gradients: GradientPost[]
  dimensions: Dimension[]
  routeLabels: TextMark[]
  annotations: TextMark[]
  breaks: TrackBreak[]
  connectionJoints?: { connectionId: string; x: number; y: number }[]
}

export const emptyAssets = (): StationAssets => ({
  points: [],
  signals: [],
  joints: [],
  lineArrows: [],
  trackCircuits: [],
  platforms: [],
  structures: [],
  bridges: [],
  chainageMarks: [],
  gradients: [],
  dimensions: [],
  routeLabels: [],
  annotations: [],
  breaks: [],
})
