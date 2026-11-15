import { isDeadEnd, shapePoints, type Bounds, type Point, type Station, type Track, type TrackNode, type Connection } from '@/sip/model'
import { boundsOf, clipPolylineX, directionTo, padBounds, polylineYAt } from './geometry'

export interface LayoutOptions {
  /** Vertical stretch. SIP yards are very long and thin; stretching y keeps parallel lines readable. */
  yExaggeration: number
  /** Drawing-space y that maps to world y = 0. Defaults to the top node; the editor pins it so the view does not jump while drawing. */
  originY?: number
}

export interface LaidOutNode extends Point {
  node: TrackNode
  /** Outward unit direction for dead ends and boundaries, else null. */
  tangent: Point | null
}

export interface LaidOutTrack {
  track: Track
  points: Point[]
}

export interface LaidOutConnection {
  connection: Connection
  points: Point[]
}

export interface StationLayout {
  station: Station
  nodes: Map<string, LaidOutNode>
  tracks: LaidOutTrack[]
  connections: LaidOutConnection[]
  nodeTrackIds: Map<string, string[]>
  /** Drawing space to world space (applies the vertical stretch). */
  place: (p: Point) => Point
  /** World y of a track at a given drawing-space x (clamped to the track's ends), or null for unknown tracks. */
  trackY: (trackId: string, x: number) => number | null
  /** World-space piece of a track between two drawing-space x values. */
  trackSpan: (trackId: string, x0: number, x1: number) => Point[]
  /** Every track that exists at drawing-space x, with its world y there. */
  tracksAt: (x: number) => { trackId: string; y: number }[]
  /** Everything drawn, including assets (world units). */
  bounds: Bounds
  /** The station proper: yard junctions in x, all drawn content in y. */
  coreBounds: Bounds
}

export function layoutStation(station: Station, options: LayoutOptions): StationLayout {
  const stretch = Math.max(0.1, options.yExaggeration)
  const minY = options.originY ?? station.nodes.reduce((m, n) => Math.min(m, n.y), Infinity)
  const place = (p: Point): Point => ({ x: p.x, y: (p.y - minY) * stretch })

  const nodes = new Map<string, LaidOutNode>()
  for (const node of station.nodes) nodes.set(node.id, { node, ...place(node), tangent: null })

  const nodeTrackIds = new Map<string, string[]>()
  const tracks: LaidOutTrack[] = station.tracks.map((track) => {
    const placed = track.nodeIds.flatMap((id) => nodes.get(id) ?? [])
    for (const n of placed) nodeTrackIds.set(n.node.id, [...(nodeTrackIds.get(n.node.id) ?? []), track.id])
    assignEndTangents(placed)
    return { track, points: placed.map(({ x, y }) => ({ x, y })) }
  })
  const trackById = new Map(tracks.map((t) => [t.track.id, t]))

  const connections: LaidOutConnection[] = station.connections.flatMap((connection) => {
    const a = nodes.get(connection.from)
    const b = nodes.get(connection.to)
    if (!a || !b) return []
    const points = [{ x: a.x, y: a.y }, ...(connection.via ?? []).map(place), { x: b.x, y: b.y }]
    return [{ connection, points }]
  })

  const trackY = (trackId: string, x: number): number | null => {
    const t = trackById.get(trackId)
    return t ? polylineYAt(t.points, x) : null
  }
  const trackSpan = (trackId: string, x0: number, x1: number): Point[] => {
    const t = trackById.get(trackId)
    return t ? clipPolylineX(t.points, x0, x1) : []
  }
  const tracksAt = (x: number) =>
    tracks.flatMap((t) => {
      const first = t.points[0]
      const last = t.points[t.points.length - 1]
      if (!first || !last) return []
      const lo = Math.min(first.x, last.x)
      const hi = Math.max(first.x, last.x)
      if (x < lo - 0.01 || x > hi + 0.01) return []
      const y = polylineYAt(t.points, x)
      return y === null ? [] : [{ trackId: t.track.id, y }]
    })

  const { assets } = station
  const content: Point[] = [...tracks.flatMap((t) => t.points), ...connections.flatMap((c) => c.points)]
  for (const p of assets.platforms) content.push(...p.polygon.map(place))
  for (const s of assets.structures) {
    if (s.shape) content.push(...shapePoints(s.shape).map(place))
  }
  for (const d of assets.dimensions) {
    if (d.kind === 'vertical') content.push(place({ x: d.x, y: d.y0 }), place({ x: d.x, y: d.y1 }))
    else content.push(place({ x: d.x0, y: d.y }), place({ x: d.x1, y: d.y }))
  }
  const bounds = padBounds(boundsOf(content), 20, 20)

  const coreNodes = [...nodes.values()].filter((n) => n.node.kind === 'junction' || isDeadEnd(n.node.kind))
  const coreBounds =
    coreNodes.length > 0
      ? { minX: Math.min(...coreNodes.map((n) => n.x)) - 300, maxX: Math.max(...coreNodes.map((n) => n.x)) + 300, minY: bounds.minY, maxY: bounds.maxY }
      : bounds

  return { station, nodes, tracks, connections, nodeTrackIds, place, trackY, trackSpan, tracksAt, bounds, coreBounds }
}

function assignEndTangents(placed: LaidOutNode[]): void {
  if (placed.length < 2) return
  const first = placed[0]!
  const last = placed[placed.length - 1]!
  if (first.node.kind !== 'junction' && !first.tangent) first.tangent = directionTo(first, placed[1]!)
  if (last.node.kind !== 'junction' && !last.tangent) last.tangent = directionTo(last, placed[placed.length - 2]!)
}
