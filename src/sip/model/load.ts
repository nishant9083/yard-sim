import { emptyAssets } from './assets'
import { emptyInfo } from './info'
import type { Station } from './types'
import { validateStation, type ValidationIssue } from './validate'

export interface LoadedStation {
  station: Station
  issues: ValidationIssue[]
}

function isStationShape(value: unknown): value is Omit<Station, 'assets' | 'info'> & Partial<Pick<Station, 'assets' | 'info'>> {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.meta === 'object' &&
    v.meta !== null &&
    Array.isArray(v.nodes) &&
    Array.isArray(v.tracks) &&
    Array.isArray(v.connections)
  )
}

/** Turn raw JSON into a typed station plus any validation issues. */
export function loadStation(raw: unknown): LoadedStation {
  if (!isStationShape(raw)) throw new Error('Invalid station JSON: expected { meta, nodes[], tracks[], connections[] }')
  // Assets and info are optional so a step-1 style file (tracks only) still renders.
  const station: Station = { ...raw, assets: { ...emptyAssets(), ...raw.assets }, info: { ...emptyInfo(), ...raw.info } }
  return { station, issues: validateStation(station) }
}
