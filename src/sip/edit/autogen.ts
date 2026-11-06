import { chainageAt, type ChainageScale, type Platform, type Point, type PointMachine, type Signal, type Station, type Track, type TrackCircuit } from '@/sip/model'
import { polylineYAt } from '@/sip/layout'
import { numberOf } from './ids'

/** Drawing-space polyline of a track (nodes in order). */
export function trackPoints(station: Station, track: Track): Point[] {
  const byId = new Map(station.nodes.map((n) => [n.id, n]))
  return track.nodeIds.flatMap((id) => {
    const n = byId.get(id)
    return n ? [{ x: n.x, y: n.y }] : []
  })
}

export function trackYAt(station: Station, trackId: string, x: number): number | null {
  const track = station.tracks.find((t) => t.id === trackId)
  return track ? polylineYAt(trackPoints(station, track), x) : null
}

export function trackXRange(station: Station, track: Track): [number, number] {
  const xs = trackPoints(station, track).map((p) => p.x)
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0]
}

/** Metres per drawing unit vertically (the SIP draws verticals at a larger scale than horizontals). */
export function verticalMetresPerUnit(station: Station, scale: ChainageScale): number {
  const ratio = (s?: string) => Number(/(\d+)\s*$/.exec(s ?? '')?.[1])
  const h = ratio(station.meta.scale?.horizontal)
  const v = ratio(station.meta.scale?.vertical)
  return h > 0 && v > 0 ? scale.metresPerUnit * (v / h) : scale.metresPerUnit
}

// --- numbering -------------------------------------------------------------------------------

function usedNumbers(codes: string[]): Set<number> {
  const used = new Set<number>()
  for (const c of codes) {
    const n = numberOf(c)
    if (n !== null) used.add(n)
  }
  return used
}

/** Signals are numbered odd for UP and even for DN; pick the smallest free number of the right parity. */
export function nextSignalNumber(station: Station, direction: 'UP' | 'DN'): number {
  const used = usedNumbers(station.assets.signals.map((s) => s.code))
  let n = direction === 'UP' ? 1 : 2
  while (used.has(n)) n += 2
  return n
}

/** Points continue upward in odd numbers from the highest one in use. */
export function nextPointNumber(station: Station): number {
  const used = [...usedNumbers(station.assets.points.map((p) => p.code))]
  if (used.length === 0) return 1
  const max = Math.max(...used)
  return max % 2 === 0 ? max + 1 : max + 2
}

export function nextLineNumber(station: Station): number {
  return Math.max(0, ...station.tracks.map((t) => t.lineNo ?? 0)) + 1
}

/** Descriptive name; the viewer prefixes "LINE n" itself when the line has a number. */
export function trackNameFor(station: Station, kind: Track['kind']): string {
  const base = { main: 'MAIN LINE', loop: 'LOOP LINE', siding: 'SIDING', overrun: 'OVERRUN LINE' }[kind]
  const n = station.tracks.filter((t) => t.kind === kind).length
  return n === 0 ? base : `${base} ${n + 1}`
}

// --- signals ---------------------------------------------------------------------------------

/** Direction, head side and head direction for a signal clicked at `clickY` on a track at `trackY`. */
export function signalOrientation(track: Track, trackY: number, clickY: number): Pick<Signal, 'direction' | 'side' | 'headDir'> {
  const side = clickY < trackY ? 'above' : 'below'
  // On a bidirectional line the SIP draws UP signals above the line and DN signals below it.
  const direction = track.direction === 'BOTH' ? (side === 'above' ? 'UP' : 'DN') : track.direction
  return { direction, side, headDir: direction === 'UP' ? 'east' : 'west' }
}

// --- point machines --------------------------------------------------------------------------

/** Label spot for a point at `at`, on the side away from the line it connects to. */
export function pointLabelPos(at: Point, other: Point): Point {
  return { x: at.x + 6, y: other.y > at.y ? at.y - 9 : at.y + 15 }
}

export function newPoint(code: string, nodeId: string, at: Point, other: Point, connectionId?: string): PointMachine {
  return {
    id: `P${code.replace(/[^A-Za-z0-9]/g, '')}`,
    code,
    nodeId,
    connectionId,
    ratio: '',
    switch: '',
    ratioInferred: true,
    control: numberOf(code) ?? 0,
    label: pointLabelPos(at, other),
  }
}

// --- track circuits --------------------------------------------------------------------------

/** Limits of the section around x on a track: the nearest insulated joints, else the track ends. */
export function circuitLimits(station: Station, trackId: string, x: number): [number, number] | null {
  const track = station.tracks.find((t) => t.id === trackId)
  if (!track) return null
  const [lo, hi] = trackXRange(station, track)
  const joints = station.assets.joints.filter((j) => j.trackId === trackId).map((j) => j.x)
  const left = Math.max(lo, ...joints.filter((j) => j <= x))
  const right = Math.min(hi, ...joints.filter((j) => j > x))
  return right > left ? [left, right] : null
}

/** Sections of a track between its insulated joints, left to right. */
export function trackSections(station: Station, track: Track): [number, number][] {
  const [lo, hi] = trackXRange(station, track)
  const cuts = [...new Set(station.assets.joints.filter((j) => j.trackId === track.id && j.x > lo && j.x < hi).map((j) => j.x))].sort((a, b) => a - b)
  const edges = [lo, ...cuts, hi]
  return edges.slice(1).map((e, i) => [edges[i]!, e] as [number, number])
}

/** `31/33T` from the points inside the span, else `<LINE>T<n>`. */
export function circuitCode(station: Station, trackId: string, x0: number, x1: number, taken: Iterable<string> = []): string {
  const track = station.tracks.find((t) => t.id === trackId)
  const nodeIds = new Set(track?.nodeIds ?? [])
  const nodeX = new Map(station.nodes.map((n) => [n.id, n.x]))
  const nums = [
    ...new Set(
      station.assets.points
        .filter((p) => {
          const x = nodeX.get(p.nodeId)
          return nodeIds.has(p.nodeId) && x !== undefined && x >= x0 - 0.01 && x <= x1 + 0.01
        })
        .map((p) => numberOf(p.code))
        .filter((n): n is number => n !== null),
    ),
  ].sort((a, b) => a - b)
  const used = new Set(taken)
  if (nums.length) {
    const base = `${nums.join('/')}T`
    if (!used.has(base)) return base
  }
  const stem = (track?.name ?? trackId).replace(/[^A-Za-z0-9]/g, '')
  for (let n = 1; ; n++) if (!used.has(`${stem}T${n}`)) return `${stem}T${n}`
}

export function circuitCovers(tc: TrackCircuit, trackId: string, x0: number, x1: number): boolean {
  const mid = (x0 + x1) / 2
  return tc.spans.some((s) => 'trackId' in s && s.trackId === trackId && mid >= s.x0 && mid <= s.x1)
}

// --- info tables -----------------------------------------------------------------------------

/** Clear standing length per line from the track extents. Approximate: the SIP prints the real figure. */
export function linesTable(station: Station): Station['info']['lines'] {
  const scale = station.meta.chainage
  if (!scale) return station.info.lines
  return station.tracks
    .filter((t) => t.kind !== 'overrun' && t.nodeIds.length >= 2)
    .map((t, i) => {
      const [lo, hi] = trackXRange(station, t)
      const m = Math.round((hi - lo) * scale.metresPerUnit)
      return { track: t.id, lineNo: t.lineNo ?? i + 1, name: t.name, csl: `${m} M`, cslM: m }
    })
}

/** Size and end chainages of a platform polygon from the chainage scale. */
export function platformMetrics(station: Station, polygon: Point[]): Pick<Platform, 'lengthM' | 'widthM' | 'startChainage' | 'endChainage'> | null {
  const scale = station.meta.chainage
  if (!scale || polygon.length === 0) return null
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  return {
    lengthM: Math.round((x1 - x0) * scale.metresPerUnit),
    widthM: Math.round((Math.max(...ys) - Math.min(...ys)) * verticalMetresPerUnit(station, scale) * 10) / 10,
    startChainage: Math.round(chainageAt(scale, x0) * 100) / 100,
    endChainage: Math.round(chainageAt(scale, x1) * 100) / 100,
  }
}

export function chainageOfX(station: Station, x: number): number | undefined {
  const scale = station.meta.chainage
  return scale ? Math.round(chainageAt(scale, x) * 100) / 100 : undefined
}
