import type { ChainageScale, Station, StationMeta } from './types'

/** The two ends of the drawing: west = left-hand (low x), east = right-hand (high x). */
export type YardEnd = 'west' | 'east'

/** Chainage in metres from the station centre line (always positive). */
export function chainageAt(scale: ChainageScale, x: number): number {
  return Math.abs(x - scale.originX) * scale.metresPerUnit
}

/** Which end of the yard the x sits toward, relative to the chainage origin. */
export function sideAt(scale: ChainageScale, x: number): YardEnd {
  return x < scale.originX ? 'west' : 'east'
}

export function formatChainage(scale: ChainageScale, x: number): string {
  return `CH:${chainageAt(scale, x).toFixed(2)}M ${scale.label}`
}

/**
 * Short name for an end, taken from the printed end text in `meta.ends`:
 * a station code in brackets wins ("PEDDAPALLI JN. (PDPL), via ..." -> PDPL, "NEORA (NEO END)" -> NEO),
 * otherwise the text before the first bracket / comma / slash, without a trailing "end"
 * ("KTV (Kottavalasa) end" -> KTV, "WADSA end" -> WADSA).
 */
export function endCode(meta: StationMeta, end: YardEnd): string {
  const raw = (meta.ends[end] ?? '').trim()
  const stripEnd = (s: string) => s.replace(/\s+(end|side)\.?$/i, '').trim()
  const bracket = raw.match(/\(([^)]*)\)/)
  if (bracket) {
    const inner = stripEnd(bracket[1])
    if (/^[A-Z]{2,5}$/.test(inner)) return inner
  }
  const head = stripEnd(raw.split(/\s*[(,]|\s+\/|\s+-\s+|\s+via\s+/i)[0] ?? '')
  return head || (end === 'west' ? 'West end' : 'East end')
}

/** "12.34 M KTV": chainage plus the end of the yard it is measured toward. */
export function formatChainageSide(meta: StationMeta, scale: ChainageScale, x: number): string {
  return `${chainageAt(scale, x).toFixed(2)} M ${endCode(meta, sideAt(scale, x))}`
}

/**
 * The end UP trains run toward. Read from the signals: UP signals face the way UP trains run,
 * so the head direction most UP signals share (and the opposite for DN) decides it.
 * Undefined when the station has no UP/DN signals to go by.
 */
export function upEnd(station: Station): YardEnd | undefined {
  let east = 0
  let west = 0
  for (const s of station.assets.signals ?? []) {
    const towardEast = s.headDir === 'east'
    if (s.direction === 'UP' ? towardEast : !towardEast) east++
    else west++
  }
  if (east === west) return undefined
  return east > west ? 'east' : 'west'
}

export const otherEnd = (end: YardEnd): YardEnd => (end === 'west' ? 'east' : 'west')
