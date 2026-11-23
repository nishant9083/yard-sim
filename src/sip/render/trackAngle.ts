import type { Point } from '@/sip/model'
import type { StationLayout } from '@/sip/layout'
import { worldToScreen, type Camera } from './camera'

/**
 * Screen-space direction of a track at `x`, pointing east (toward larger x), as an angle in radians: 0 on a
 * level line, negative where the line climbs up the screen. Measured over a short span either side of `x`, so a
 * symbol sitting on a bend takes the average of the two segments. Level (0) when the track is not there.
 *
 * Symbols on a line (signal posts, boards, joints) are drawn in a frame turned by this angle, so they always
 * stand perpendicular to the line they are on, whatever the slope or the vertical stretch.
 */
export function trackScreenAngle(layout: StationLayout, camera: Camera, trackId: string, x: number, span = 1): number {
  const y = layout.trackY(trackId, x)
  if (y === null) return 0
  const y0 = layout.trackY(trackId, x - span) ?? y
  const y1 = layout.trackY(trackId, x + span) ?? y
  const a = worldToScreen(camera, { x: x - span, y: y0 })
  const b = worldToScreen(camera, { x: x + span, y: y1 })
  return b.x === a.x && b.y === a.y ? 0 : Math.atan2(b.y - a.y, b.x - a.x)
}

/** Rotate `p` about `origin` by `angle` (screen space). */
export function rotateAbout(p: Point, origin: Point, angle: number): Point {
  if (angle === 0) return p
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
}

/** Axis-aligned box around a local box turned by `angle` about `origin`. */
export function rotatedBox(box: { x: number; y: number; w: number; h: number }, origin: Point, angle: number): { x: number; y: number; w: number; h: number } {
  if (angle === 0) return box
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ].map((p) => rotateAbout(p, origin, angle))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
