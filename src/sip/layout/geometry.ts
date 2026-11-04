import type { Bounds, Point } from '@/sip/model'

export function boundsOf(points: Point[]): Bounds {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

export function padBounds(b: Bounds, padX: number, padY: number): Bounds {
  return { minX: b.minX - padX, minY: b.minY - padY, maxX: b.maxX + padX, maxY: b.maxY + padY }
}

/** Unit vector from b to a, or null for a zero-length pair. */
export function directionTo(a: Point, b: Point): Point | null {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const len = Math.hypot(dx, dy)
  return len === 0 ? null : { x: dx / len, y: dy / len }
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function distanceToPolyline(p: Point, points: Point[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1]!, points[i]!))
  return best
}

export function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  return total
}

/** Point at half the length of the polyline. */
export function polylineMidpoint(points: Point[]): Point {
  const half = polylineLength(points) / 2
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (walked + seg >= half && seg > 0) {
      const t = (half - walked) / seg
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    walked += seg
  }
  return points[0] ?? { x: 0, y: 0 }
}

/**
 * y of a left-to-right polyline at x. Clamps to the end points outside the range.
 * Works for polylines that are monotonic in x, which every track in a SIP is.
 */
export function polylineYAt(points: Point[], x: number): number | null {
  if (points.length === 0) return null
  const first = points[0]!
  const last = points[points.length - 1]!
  const ascending = last.x >= first.x
  const lo = ascending ? first : last
  const hi = ascending ? last : first
  if (x <= lo.x) return lo.y
  if (x >= hi.x) return hi.y
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const segLo = Math.min(a.x, b.x)
    const segHi = Math.max(a.x, b.x)
    if (x >= segLo && x <= segHi) {
      if (segHi === segLo) return a.y
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x)
    }
  }
  return null
}

/** Part of a monotonic polyline between two x values (inclusive), with interpolated end points. */
export function clipPolylineX(points: Point[], x0: number, x1: number): Point[] {
  const lo = Math.min(x0, x1)
  const hi = Math.max(x0, x1)
  if (points.length < 2) return []
  const ordered = points[0]!.x <= points[points.length - 1]!.x ? points : [...points].reverse()
  const out: Point[] = []
  const startY = polylineYAt(ordered, lo)
  const endY = polylineYAt(ordered, hi)
  if (startY === null || endY === null) return []
  out.push({ x: lo, y: startY })
  for (const p of ordered) if (p.x > lo && p.x < hi) out.push(p)
  out.push({ x: hi, y: endY })
  return out
}

/** True when `p` lies inside the polygon (even-odd rule). */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
