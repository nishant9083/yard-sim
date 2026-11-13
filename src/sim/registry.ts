import type { Station } from '@/sip/model'
import type { StationSimConfig } from './config/types'
import { Simulation } from './engine/simulation'
import { parseRcc } from './rcc/parse'
import type { RawRcc } from './rcc/types'
import { Network } from './engine/network'
import { validateRcc } from './validate/rccValidate'

/**
 * A station becomes simulatable by adding two files to `src/sim/data/`:
 *   <code>.rcc.json  - from `python3 tools/rcc/xlsx_to_rcc.py <xlsx> <CODE> <out>`
 *   <code>.sim.json  - signal posts, block sections, overrides (see config/types.ts)
 * Nothing else in the code names a station.
 */
const rcc = import.meta.glob<RawRcc>('./data/*.rcc.json', { eager: true, import: 'default' })
const cfg = import.meta.glob<StationSimConfig>('./data/*.sim.json', { eager: true, import: 'default' })

const byCode = (files: Record<string, { station?: string }>): Map<string, unknown> => {
  const out = new Map<string, unknown>()
  for (const f of Object.values(files)) if (f.station) out.set(f.station, f)
  return out
}
const rccs = byCode(rcc)
const cfgs = byCode(cfg)

export const simulatableStations = (): string[] => [...rccs.keys()].filter((c) => cfgs.has(c))
export const hasSimulation = (code: string): boolean => rccs.has(code) && cfgs.has(code)

export function createSimulation(station: Station): Simulation {
  const code = station.meta.code
  if (!hasSimulation(code)) throw new Error(`No RCC data for station ${code}`)
  return new Simulation(station, cfgs.get(code) as StationSimConfig, parseRcc(rccs.get(code) as RawRcc))
}

/** Chart-versus-drawing checks, run on demand for the Checks tab. */
export function checkStation(sim: Simulation) {
  return validateRcc(sim.rcc, new Network(sim.station, sim.config, sim.rcc))
}
