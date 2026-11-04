import type { EntityRef, Point } from '@/sip/model'
import { distanceToPolyline, pointInPolygon, type StationLayout } from '@/sip/layout'
import { screenToWorld, type Camera } from './camera'
import type { HitRegion } from './types'

export interface HitOptions {
  includeNodes: boolean
  /** Regions recorded by the last render, in draw order. */
  regions: HitRegion[]
  /** Tolerance in screen pixels. */
  tolerance: number
}

/** Find the entity under a screen point. Symbols and labels win over platforms, tracks and connections. */
export function hitTest(layout: StationLayout, camera: Camera, screen: Point, { includeNodes, regions, tolerance }: HitOptions): EntityRef | null {
  // 1. symbols and labels recorded while drawing (smallest rectangle wins, platforms last)
  let best: { ref: EntityRef; area: number } | null = null
  for (const r of regions) {
    if (screen.x < r.x - 2 || screen.x > r.x + r.w + 2 || screen.y < r.y - 2 || screen.y > r.y + r.h + 2) continue
    const area = (r.w + 4) * (r.h + 4) * (r.ref.type === 'platform' ? 1000 : 1)
    if (!best || area < best.area) best = { ref: r.ref, area }
  }
  const nonPlatform = best && best.ref.type !== 'platform' ? best.ref : null
  if (nonPlatform) return nonPlatform

  const world = screenToWorld(camera, screen)
  const tol = tolerance / camera.zoom

  // 2. nodes
  if (includeNodes) {
    let nearest: { id: string; d: number } | null = null
    for (const laid of layout.nodes.values()) {
      if (laid.node.kind === 'plain') continue
      const d = Math.hypot(laid.x - world.x, laid.y - world.y)
      if (d <= tol * 0.9 && (!nearest || d < nearest.d)) nearest = { id: laid.node.id, d }
    }
    if (nearest) return { type: 'node', id: nearest.id }
  }

  // 3. tracks and connections
  let hit: { ref: EntityRef; d: number } | null = null
  for (const { connection, points } of layout.connections) {
    const d = distanceToPolyline(world, points)
    if (d <= tol && (!hit || d <= hit.d)) hit = { ref: { type: 'connection', id: connection.id }, d }
  }
  for (const { track, points } of layout.tracks) {
    const d = distanceToPolyline(world, points)
    if (d <= tol && (!hit || d < hit.d)) hit = { ref: { type: 'track', id: track.id }, d }
  }
  if (hit) {
    // A track circuit sitting on the hit track is more specific than the bare track.
    const tc = trackCircuitAt(layout, world, tol)
    return tc ?? hit.ref
  }

  // 4. platforms
  for (const platform of layout.station.assets.platforms) {
    if (pointInPolygon(world, platform.polygon.map(layout.place))) return { type: 'platform', id: platform.id }
  }
  return best?.ref ?? null
}

function trackCircuitAt(layout: StationLayout, world: Point, tol: number): EntityRef | null {
  for (const tc of layout.station.assets.trackCircuits) {
    for (const span of tc.spans) {
      const pts = 'trackId' in span ? layout.trackSpan(span.trackId, span.x0, span.x1) : (layout.connections.find((c) => c.connection.id === span.connectionId)?.points ?? [])
      if (pts.length >= 2 && distanceToPolyline(world, pts) <= tol) return { type: 'trackCircuit', id: tc.id }
    }
  }
  return null
}
