import type { Point } from './types'

export type Side = 'above' | 'below'
export type HeadDirection = 'east' | 'west'
export type LampStyle = 'slash' | 'vbar' | 'hbar' | 'solid'

/** Parts of a signal head, listed outward from the wire anchor. */
export type SignalElement =
  | { kind: 'lamp'; style: LampStyle }
  | { kind: 'marker'; text: 'P' | 'C' | 'B' }
  | { kind: 'callingOn' }
  | { kind: 'routeIndicator' }
  | { kind: 'shunt'; text?: string }

export type SignalKind = 'signal' | 'distant' | 'home' | 'starter' | 'advancedStarter' | 'shunt'

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
  /** Where the wire meets the head. */
  anchorX: number
  side: Side
  headDir: HeadDirection
  elements: SignalElement[]
  /** Control number on the VDU (see the controls table). */
  control?: number
  board?: 'SL' | 'DL'
  /** Position of the printed label (drawing space). */
  label?: Point
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

export type Shape = { type: 'rect'; x0: number; y0: number; x1: number; y1: number }

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

export interface Bridge {
  id: string
  number: string
  chainage: number
  x: number
  spec: string
  isNew?: boolean
}

export type ChainageMarkKind = 'PT' | 'FM' | 'DS' | 'DE' | 'PF END'

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
}

export const emptyAssets = (): StationAssets => ({
  points: [],
  signals: [],
  joints: [],
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
