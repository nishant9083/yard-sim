import type { ChainageScale } from './types'

/** Chainage in metres from the station centre line (always positive). */
export function chainageAt(scale: ChainageScale, x: number): number {
  return Math.abs(x - scale.originX) * scale.metresPerUnit
}

/** Which side of the centre line the x sits on. */
export function sideAt(scale: ChainageScale, x: number): 'KTV' | 'KRDL' {
  return x < scale.originX ? 'KTV' : 'KRDL'
}

export function formatChainage(scale: ChainageScale, x: number): string {
  return `CH:${chainageAt(scale, x).toFixed(2)}M ${scale.label}`
}
