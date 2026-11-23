import { ROUTE_INDICATOR_ROUTES, type PointMachine, type Signal, type SignalElement, type TrackCircuit } from './assets'
import type { Station } from './types'
import { chainageAt } from './chainage'

const trackSpansOf = (tc: TrackCircuit) => tc.spans.flatMap((s) => ('trackId' in s ? [s] : []))

/** Circuits that cover a spot on a track. */
export function circuitsAt(station: Station, trackId: string, x: number): TrackCircuit[] {
  return station.assets.trackCircuits.filter((tc) => trackSpansOf(tc).some((s) => s.trackId === trackId && x >= s.x0 - 0.01 && x <= s.x1 + 0.01))
}

/** Circuits a point sits in (through the tracks that run through its node). */
export function circuitsOfPoint(station: Station, point: PointMachine): TrackCircuit[] {
  const node = station.nodes.find((n) => n.id === point.nodeId)
  if (!node) return []
  const trackIds = station.tracks.filter((t) => t.nodeIds.includes(node.id)).map((t) => t.id)
  const found = new Map<string, TrackCircuit>()
  for (const id of trackIds) for (const tc of circuitsAt(station, id, node.x)) found.set(tc.id, tc)
  return [...found.values()]
}

export function circuitsOfSignal(station: Station, signal: Signal): TrackCircuit[] {
  return circuitsAt(station, signal.trackId, signal.footX)
}

/** Points and signals inside a circuit's track spans. */
export function contentsOfCircuit(station: Station, tc: TrackCircuit): { points: PointMachine[]; signals: Signal[] } {
  const spans = trackSpansOf(tc)
  const points = station.assets.points.filter((p) => {
    const node = station.nodes.find((n) => n.id === p.nodeId)
    if (!node) return false
    return spans.some((s) => station.tracks.find((t) => t.id === s.trackId)?.nodeIds.includes(node.id) && node.x >= s.x0 && node.x <= s.x1)
  })
  const signals = station.assets.signals.filter((g) => spans.some((s) => s.trackId === g.trackId && g.footX >= s.x0 && g.footX <= s.x1))
  return { points, signals }
}

export function circuitRangeMetres(station: Station, tc: TrackCircuit): { from: number; to: number; length: number } | null {
  const scale = station.meta.chainage
  const spans = trackSpansOf(tc)
  if (!scale || spans.length === 0) return null
  const xs = spans.flatMap((s) => [s.x0, s.x1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const west = x1 <= scale.originX
  const east = x0 >= scale.originX
  const a = chainageAt(scale, x0)
  const b = chainageAt(scale, x1)
  return { from: Math.min(a, b), to: Math.max(a, b), length: west || east ? Math.abs(a - b) : a + b }
}

const ELEMENT_NAME: Record<SignalElement['kind'], string> = {
  lamp: 'lamp',
  marker: 'marker',
  callingOn: 'calling-on lamp',
  routeIndicator: 'route indicator',
  shunt: 'shunt disc',
  speedBoard: 'speed board',
}

export function describeElement(e: SignalElement): string {
  switch (e.kind) {
    case 'lamp':
      return `lamp (${e.style})`
    case 'marker':
      return `${e.text} marker`
    case 'shunt':
      return e.text ? `shunt disc ${e.text}` : ELEMENT_NAME.shunt
    case 'speedBoard':
      return `speed board ${e.limit || '?'} km/h`
    case 'routeIndicator':
      return `route indicator (${ROUTE_INDICATOR_ROUTES.filter((r) => e.routes.includes(r.id))
        .map((r) => r.label.toLowerCase())
        .join(', ')})`
    default:
      return ELEMENT_NAME[e.kind]
  }
}

export const SIGNAL_KIND_NAME: Record<Signal['kind'], string> = {
  signal: 'Signal',
  distant: 'Distant',
  home: 'Home',
  starter: 'Starter',
  advancedStarter: 'Advanced starter',
  shunt: 'Shunt',
  speedBoard: 'Speed board',
}
