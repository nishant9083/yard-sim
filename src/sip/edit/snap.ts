import type { Point, Station } from '@/sip/model'
import { distanceToSegment } from '@/sip/layout'

export type Snap =
  | { kind: 'node'; nodeId: string; p: Point }
  | { kind: 'track'; trackId: string; p: Point }
  | { kind: 'free'; p: Point }

export interface SnapOptions {
  /** Pick radius in drawing units (screen tolerance / zoom). */
  tolerance: number
  /** Grid pitch in drawing units, or null for no grid snap. */
  grid: number | null
  nodes?: boolean
  tracks?: boolean
  /** Node ids that must not be snapped to (the node being dragged). */
  skipNodes?: ReadonlySet<string>
}

export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

export const snapToGrid = (p: Point, grid: number | null): Point =>
  grid ? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid } : p

/** Snap order: an existing node, then a point on a track, then the grid. */
export function snapPoint(station: Station, raw: Point, { tolerance, grid, nodes = true, tracks = true, skipNodes }: SnapOptions): Snap {
  if (nodes) {
    let best: { id: string; d: number } | null = null
    for (const n of station.nodes) {
      if (skipNodes?.has(n.id)) continue
      const d = Math.hypot(n.x - raw.x, n.y - raw.y)
      if (d <= tolerance && (!best || d < best.d)) best = { id: n.id, d }
    }
    if (best) {
      const n = station.nodes.find((n) => n.id === best.id)!
      return { kind: 'node', nodeId: n.id, p: { x: n.x, y: n.y } }
    }
  }
  if (tracks) {
    const byId = new Map(station.nodes.map((n) => [n.id, n]))
    let best: { trackId: string; p: Point; d: number } | null = null
    for (const t of station.tracks) {
      for (let i = 1; i < t.nodeIds.length; i++) {
        const a = byId.get(t.nodeIds[i - 1]!)
        const b = byId.get(t.nodeIds[i]!)
        if (!a || !b) continue
        const d = distanceToSegment(raw, a, b)
        if (d <= tolerance && (!best || d < best.d)) best = { trackId: t.id, p: closestOnSegment(raw, a, b), d }
      }
    }
    if (best) return { kind: 'track', trackId: best.trackId, p: best.p }
  }
  return { kind: 'free', p: snapToGrid(raw, grid) }
}

/** Grid pitch that stays readable at this zoom (always one of 1, 5, 10, 50, 100 ... drawing units). */
export function gridPitch(zoom: number): number {
  for (const pitch of [1, 5, 10, 50, 100, 500, 1000]) if (pitch * zoom >= 14) return pitch
  return 1000
}
