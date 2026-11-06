import type { StationAssets } from './assets'
import type { StationInfo } from './info'

/** A point in drawing space (PDF points, y grows downward, x grows toward the east end). */
export interface Point {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * boundary   - where the yard meets the block section (edge of the drawing)
 * bufferStop - dead end of a siding / overrun line
 * junction   - a place where a connection leaves a track, or tracks meet
 * plain      - helper vertex that only shapes a line
 */
export type NodeKind = 'boundary' | 'bufferStop' | 'junction' | 'plain'

export type TrackKind = 'main' | 'loop' | 'siding' | 'overrun'
export type TrackDirection = 'UP' | 'DN' | 'BOTH'

/** crossover: links two running lines. turnout: links a track to a siding / overrun / loop leg. */
export type ConnectionKind = 'crossover' | 'turnout'

export interface TrackNode extends Point {
  id: string
  kind: NodeKind
  label?: string
}

/** A named, ordered run of nodes. Consecutive nodes are joined by straight segments. */
export interface Track {
  id: string
  name: string
  /** Line number printed on the SIP (LINE No. 1..4). */
  lineNo?: number
  kind: TrackKind
  direction: TrackDirection
  nodeIds: string[]
  remarks?: string
}

/**
 * A diagonal or curved link between nodes on two different tracks.
 * `via` holds optional shape points between `from` and `to`.
 * Step 2 will attach point machines (31A, 31B ...) to connections.
 */
export interface Connection {
  id: string
  kind: ConnectionKind
  from: string
  to: string
  via?: Point[]
  label?: string
}

/** Chainage calibration: chainage (m) = |x - originX| * metresPerUnit, measured from the station centre line. */
export interface ChainageScale {
  originX: number
  metresPerUnit: number
  label: string
  origin?: string
}

export interface StationMeta {
  code: string
  name: string
  zone: string
  sipRef: string
  coordinateSpace: string
  ends: { west: string; east: string }
  chainage?: ChainageScale
  scale?: { horizontal: string; vertical: string }
  viewHints?: { yExaggeration?: number }
}

export interface Station {
  meta: StationMeta
  nodes: TrackNode[]
  tracks: Track[]
  connections: Connection[]
  /** Step 2: everything drawn on top of the track skeleton. */
  assets: StationAssets
  /** Step 2: legend, notes and tables printed on the SIP. */
  info: StationInfo
}

export type EntityType =
  | 'track'
  | 'connection'
  | 'node'
  | 'point'
  | 'signal'
  | 'trackCircuit'
  | 'joint'
  | 'platform'
  | 'structure'
  | 'bridge'
  | 'dimension'
  | 'chainageMark'
  | 'gradient'
  | 'annotation'

export interface EntityRef {
  type: EntityType
  id: string
}

export function sameEntity(a: EntityRef | null, b: EntityRef | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.type === b.type && a.id === b.id
}
