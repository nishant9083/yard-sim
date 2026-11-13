import { emptyAssets, routeIndicatorRoutesOf, type Signal } from './assets'
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
  const assets = { ...emptyAssets(), ...raw.assets }
  const station: Station = { ...raw, assets: { ...assets, signals: assets.signals.map(normalizeSignal) }, info: { ...emptyInfo(), ...raw.info } }
  return { station, issues: validateStation(station) }
}

/** Bring older signal data up to date: route indicators list their arms (`routes`) instead of a `direction`. */
function normalizeSignal(s: Signal): Signal {
  if (!s.elements?.some((e) => e.kind === 'routeIndicator')) return s
  return {
    ...s,
    elements: s.elements.map((e) =>
      e.kind === 'routeIndicator' ? { kind: 'routeIndicator', routes: routeIndicatorRoutesOf(e as { routes?: unknown; direction?: unknown }, s.headDir) } : e,
    ),
  }
}
