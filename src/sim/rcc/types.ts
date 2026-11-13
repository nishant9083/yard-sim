/**
 * Route Control Chart (RCC) model. One typed row per route and per overlap choice.
 * The model is station neutral: nothing in `src/sim` names a Jarati signal, point or track circuit.
 */

export type PointPos = 'N' | 'R'

/** A point unit is the control number shared by both ends of a crossover ("31" is 31A and 31B). */
export interface PointReq {
  unit: string
  pos: PointPos
}

export type RouteKind = 'main' | 'callingOn' | 'shunt' | 'starter' | 'block'

export interface Protection {
  /** Signal post number as written in the remark ("11", "2", "15"). */
  post: string
  /** red: red lamp must be proved lit. noLight: any lamp must be proved lit. */
  kind: 'red' | 'noLight'
}

export interface BlockRequirement {
  instrument: string
  contact: string
  section: string
}

export interface RccRoute {
  /** Unique key: "1A.ORL", "1A.ML", "1B.SH", "2B", "C1A", "10", "SH15". */
  id: string
  sl: number
  /** Route name as other rows refer to it: "1A", "C1A", "SH4C", "10". */
  name: string
  /** ORL, ML, SH or null. */
  variant: string | null
  overlapId: string | null
  /** Chart signal / slot id, normalised: "S1", "C1", "SH3", "S10", "SH15", "S17". */
  signal: string
  /** Signal post number the signal belongs to ("1", "11", "15"); calling-on shares its main signal's post. */
  post: string
  kind: RouteKind
  destination: string
  /** Post number of the destination signal, or null for an external stop point (block section home). */
  destinationPost: string | null
  vdu: { command: string; indication: string; aspectClass: 'UN' | 'UN1' | null; indicator: string | null }
  points: { route: PointReq[]; overlap: PointReq[]; isolation: PointReq[] }
  tcs: { route: string[]; routeAnyOf: boolean; overlap: string[] }
  /** Crank handles and siding controls that must be IN: "CH1", "CONT.37". */
  controls: string[]
  deadApproach: boolean
  backLock: string[]
  overlapRelease: { cleared: string | null; occupiedAnyOf: string[] }
  locks: { routes: string[]; overlaps: string[] }
  remarks: string[]
  protections: Protection[]
  /** The signal returns to ON this long after `tc` is occupied (default: first route TC, no delay). */
  flyBack: { tc: string | null; seconds: number }
  /** The signal clears this long after `tc` is occupied (calling-on). */
  clearAfter: { tc: string; seconds: number } | null
  releaseDelaySeconds: number
  block: BlockRequirement[]
}

export interface RccOverlap {
  id: string
  routeId: string
  points: PointReq[]
  isolation: PointReq[]
  tcs: string[]
  release: { cleared: string | null; occupiedAnyOf: string[] }
}

export interface PointChartRow {
  unit: string
  /** Printed point ends, e.g. "31A/B". */
  label: string
  crankHandle: string
  tcs: string[]
  normal: { routes: string[]; overlaps: string[] }
  reverse: { routes: string[]; overlaps: string[] }
}

export interface HandleChartRow {
  controls: string[]
  routes: string[]
  overlaps: string[]
  units: string[]
}

export type IssueLevel = 'error' | 'warn' | 'info'

export interface Issue {
  level: IssueLevel
  code: string
  message: string
  where?: string
}

export interface RccTable {
  station: string
  routes: RccRoute[]
  overlaps: RccOverlap[]
  pointChart: PointChartRow[]
  handleChart: HandleChartRow[]
  byId: Map<string, RccRoute>
  overlapById: Map<string, RccOverlap>
  /** Problems found while reading the text. The simulator still runs; the validator shows them. */
  issues: Issue[]
}

/** The JSON written by tools/rcc/xlsx_to_rcc.py. Every cell is text. */
export interface RawRccRow {
  sheet?: string
  excelRow?: number
  sl: number
  sig: string
  route: string
  dest: string
  vdu: string
  ptsRoute: string
  ptsOverlap: string
  isolation: string
  tcRoute: string
  tcOverlap: string
  controls: string
  approach: string
  backLock: string
  ovCleared: string
  ovOccupied: string
  locksRoutes: string
  locksOverlaps: string
  remarks: string
}

export interface RawRcc {
  station: string
  source?: { file?: string; note?: string }
  routes: RawRccRow[]
  pointChart: { point: string; crankHandle: string; tcs: string; normalRoutes: string; normalOverlaps: string; reverseRoutes: string; reverseOverlaps: string }[]
  handleChart: { control: string; routes: string; overlaps: string; points: string }[]
}
