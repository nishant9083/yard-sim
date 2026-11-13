import type { PointPos } from '../rcc/types'

export type TcFault = 'none' | 'occupied' | 'clear'
export type PointFault = 'none' | 'noDetection' | 'stuck'
export type Phase = 'idle' | 'setting' | 'locked' | 'used' | 'overlap'

export interface SimSettings {
  /** Seconds a point machine takes to move. */
  pointSeconds: number
  /** Time held after a cancel or emergency release when a train is close (approach locking). */
  approachLockSeconds: number
  /** Overlap is freed this long after the route releases, if no other release applies. 0 disables. */
  overlapTimerSeconds: number
  /** A signal that went ON after a fault clears again by itself when the fault goes away. */
  autoReclear: boolean
  brakeMps2: number
  accelMps2: number
  /** Stopping margin before a signal or buffer, metres. */
  stopMarginM: number
}

export const DEFAULT_SETTINGS: SimSettings = {
  pointSeconds: 3,
  approachLockSeconds: 120,
  overlapTimerSeconds: 120,
  autoReclear: false,
  brakeMps2: 0.6,
  accelMps2: 0.5,
  stopMarginM: 3,
}

export interface TrainSpec {
  id: string
  name?: string
  lengthM: number
  maxKmph: number
  ignoreSignals?: boolean
  /** Place with the head just behind this signal, facing the way it faces. */
  atSignal?: string
  /** Or place in the middle of this track circuit, travelling east or west. */
  atTc?: string
  east?: boolean
}

export type Command =
  | { type: 'setRoute'; route: string }
  | { type: 'cancelRoute'; route: string }
  | { type: 'emergencyRelease'; route: string }
  | { type: 'setControl'; control: string; value: boolean }
  | { type: 'movePoint'; unit: string; pos: PointPos }
  | { type: 'pointFault'; unit: string; fault: PointFault }
  | { type: 'tcFault'; tc: string; fault: TcFault }
  | { type: 'lampFault'; signal: string; failed: boolean }
  | { type: 'blockInput'; section: string; input: string; value: boolean }
  | { type: 'addTrain'; train: TrainSpec }
  | { type: 'removeTrain'; id: string }
  | { type: 'trainRun'; id: string; run: boolean }
  | { type: 'setting'; key: keyof SimSettings; value: number | boolean }

export interface CommandResult {
  ok: boolean
  reasons: string[]
}

export interface LogEntry {
  t: number
  level: 'info' | 'event' | 'warn' | 'refused'
  text: string
}

export interface TcRuntime {
  occupied: boolean
  physical: boolean
  fault: TcFault
  /** Simulation time the circuit last became occupied, else null. */
  since: number | null
}

export interface PointClaim {
  pos: PointPos
  part: 'route' | 'overlap'
}

export interface PointRuntime {
  pos: PointPos
  moving: { to: PointPos; remaining: number } | null
  fault: PointFault
  owners: Map<string, PointClaim>
}

export interface RouteRuntime {
  phase: Phase
  signalOff: boolean
  /** Signal went back to ON because a proof failed; waits for a new command (or autoReclear). */
  revoked: boolean
  trainEntered: boolean
  clearedAt: number | null
  backSeen: Set<string>
  backReleaseAt: number | null
  releaseAt: number | null
  releaseKind: 'cancel' | 'emergency' | null
  overlapReady: boolean
  overlapSince: number | null
  /** What the route is waiting for, shown to the operator. */
  reasons: string[]
}

export interface Train {
  id: string
  name: string
  lengthM: number
  maxMps: number
  speed: number
  run: boolean
  ignoreSignals: boolean
  /** Path covered by the train, tail first. */
  trail: import('./network').Leg[]
  head: import('./network').PathPos
  leaving: boolean
  note: string
  /** Kind of signal the train last passed at proceed. */
  authority: 'main' | 'shunt' | null
  /** Speed limit from that signal (shunt and calling-on movements run slowly). */
  limitMps: number | null
}
