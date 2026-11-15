import type { Station } from '@/sip/model'
import type { StationSimConfig } from '../config/types'
import type { PointPos, RccRoute, RccTable } from '../rcc/types'
import { Network, type Leg, type PathPos } from './network'
import {
  DEFAULT_SETTINGS,
  type Command,
  type CommandResult,
  type LogEntry,
  type PointRuntime,
  type RouteRuntime,
  type SimSettings,
  type TcRuntime,
  type Train,
  type TrainSpec,
} from './types'

const EPS = 1e-6
export const DT = 0.05
const SLOW_MPS = 15 / 3.6

export type Aspect = 'R' | 'Y' | 'YY' | 'G'

export interface SignalView {
  /** Anything on the post is showing proceed (main, calling-on or shunt). */
  off: boolean
  /** Main aspect: red, yellow (caution), double yellow (attention), green (clear). */
  aspect: Aspect
  callingOn: boolean
  shunt: boolean
  /** Route indicator lit (diverging route). */
  routeIndicator: boolean
  /** Route currently showing the aspect. */
  routeId: string | null
  /** Slot of that route: S1, C1, SH3 ... */
  slot: string | null
  kind: RccRoute['kind'] | null
  lampFailed: boolean
}

/**
 * The interlocking and the world around it. It reads the RCC rows and nothing else decides what is allowed.
 * Deterministic: the same commands at the same times always give the same result.
 */
export class Simulation {
  readonly net: Network
  time = 0
  /** Bumped on every change so a UI can tell when to redraw. */
  version = 0
  settings: SimSettings
  readonly tcs = new Map<string, TcRuntime>()
  readonly points = new Map<string, PointRuntime>()
  readonly controls = new Map<string, boolean>()
  readonly lamps = new Map<string, boolean>() // signal id -> failed
  readonly routes = new Map<string, RouteRuntime>()
  readonly blockInputs = new Map<string, boolean>()
  trains: Train[] = []
  readonly log: LogEntry[] = []
  readonly history: { t: number; cmd: Command }[] = []
  private readonly tcLocations = new Map<string, { edge: string; s0: number; s1: number }[]>()
  private readonly listeners = new Set<() => void>()

  constructor(
    readonly station: Station,
    readonly config: StationSimConfig,
    readonly rcc: RccTable,
    settings: Partial<SimSettings> = {},
  ) {
    this.net = new Network(station, config, rcc)
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    this.reset()
  }

  /* ------------------------------------ set up ------------------------------------ */

  reset(): void {
    this.time = 0
    this.tcs.clear()
    this.points.clear()
    this.controls.clear()
    this.lamps.clear()
    this.routes.clear()
    this.blockInputs.clear()
    this.trains = []
    this.log.length = 0
    this.history.length = 0
    this.tcLocations.clear()
    for (const t of this.station.assets.trackCircuits) this.tcs.set(t.code, { occupied: false, physical: false, fault: 'none', since: null })
    for (const [edge, pieces] of this.net.pieces) for (const p of pieces) {
      const list = this.tcLocations.get(p.tc) ?? []
      list.push({ edge, s0: p.s0, s1: p.s1 })
      this.tcLocations.set(p.tc, list)
    }
    for (const id of this.net.units.keys()) this.points.set(id, { pos: 'N', moving: null, fault: 'none', owners: new Map() })
    for (const u of this.net.units.values()) if (u.crankHandle) this.controls.set(u.crankHandle, true)
    for (const r of this.rcc.routes) {
      for (const c of r.controls) this.controls.set(c, true)
      this.routes.set(r.id, this.freshRoute())
    }
    for (const s of this.station.assets.signals) this.lamps.set(s.id, false)
    for (const sec of this.config.blockSections ?? []) for (const i of sec.inputs) this.blockInputs.set(`${sec.id}/${i.id}`, i.defaultValue)
    this.say('info', `Simulation ready: ${this.rcc.routes.length} routes of station ${this.rcc.station}`)
    this.bump()
  }

  private freshRoute(): RouteRuntime {
    return {
      phase: 'idle',
      signalOff: false,
      revoked: false,
      trainEntered: false,
      clearedAt: null,
      backSeen: new Set(),
      backReleaseAt: null,
      releaseAt: null,
      releaseKind: null,
      overlapReady: false,
      overlapSince: null,
      reasons: [],
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private bump(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  private say(level: LogEntry['level'], text: string): void {
    this.log.push({ t: this.time, level, text })
    if (this.log.length > 800) this.log.splice(0, this.log.length - 800)
  }

  /* --------------------------------- small queries --------------------------------- */

  private signalOfPost(post: string): string | undefined {
    return this.config.posts[post]
  }

  private occ(tc: string): boolean {
    return this.tcs.get(tc)?.occupied ?? false
  }

  private unitPos = (unit: string): PointPos | 'moving' => {
    const p = this.points.get(unit)
    if (!p) return 'N'
    return p.moving ? 'moving' : p.pos
  }

  private lampsOf(signalId: string): { green: boolean; yellow: number; distant: boolean; shuntOnly: boolean } {
    const sig = this.station.assets.signals.find((x) => x.id === signalId)
    const lamps = (sig?.elements ?? []).flatMap((e) => (e.kind === 'lamp' ? [e.style] : []))
    const distant = sig?.kind === 'distant'
    return {
      distant,
      shuntOnly: sig?.kind === 'shunt',
      green: lamps.includes('hbar') || (distant && lamps.includes('solid')),
      yellow: lamps.filter((l) => l === 'slash' || (!distant && l === 'solid')).length,
    }
  }

  /** The next stop signal a driver meets after this post, with the points as they lie. */
  private nextStopSignal(signalId: string): string | null {
    const post = this.net.posts.get(signalId)
    if (!post) return null
    const e = this.net.edges.get(post.edge)!
    const start: PathPos = { edge: post.edge, s: post.s, dir: (post.east ? e.xDir : -e.xDir) as 1 | -1 }
    const r = this.net.advance(start, 4000 / this.mpu(), this.unitPos)
    for (const leg of r.legs) {
      const le = this.net.edges.get(leg.edge)!
      const sign = leg.s1 >= leg.s0 ? 1 : -1
      const east = sign * le.xDir > 0
      const found = (this.net.postsOnEdge.get(leg.edge) ?? [])
        .filter((p) => p.east === east && p.signalId !== signalId && (p.s - leg.s0) * sign > 1e-3 && (p.s - leg.s0) * sign <= Math.abs(leg.s1 - leg.s0) + 1e-3)
        .filter((p) => { const l = this.lampsOf(p.signalId); return !l.distant && !l.shuntOnly })
        .sort((x, y) => (x.s - y.s) * sign)[0]
      if (found) return found.signalId
    }
    return null
  }

  /** What each signal post is showing. Aspects follow the usual multiple-aspect sequence. */
  signal(signalId: string, depth = 0): SignalView {
    const lampFailed = this.lamps.get(signalId) ?? false
    const view: SignalView = { off: false, aspect: 'R', callingOn: false, shunt: false, routeIndicator: false, routeId: null, slot: null, kind: null, lampFailed }
    const lamps = this.lampsOf(signalId)
    if (lamps.distant) {
      const next = depth < 4 ? this.nextStopSignal(signalId) : null
      const ahead = next ? this.signal(next, depth + 1).aspect : 'R'
      view.aspect = lampFailed ? 'R' : ahead === 'G' && lamps.green ? 'G' : ahead === 'R' ? 'Y' : lamps.yellow >= 2 ? 'YY' : 'Y'
      return view
    }
    if (lampFailed) return view
    for (const r of this.rcc.routes) {
      if (this.signalOfPost(r.post) !== signalId) continue
      const rt = this.routes.get(r.id)!
      if (!rt.signalOff || rt.phase !== 'locked') continue
      view.off = true
      view.routeId = r.id
      view.slot = r.signal
      view.kind = r.kind
      if (r.kind === 'callingOn') view.callingOn = true
      else if (r.kind === 'shunt') view.shunt = true
      else {
        const diverging = r.points.route.some((q) => q.pos === 'R')
        view.routeIndicator = diverging
        const dest = r.destinationPost ? this.signalOfPost(r.destinationPost) : undefined
        const destOff = dest && depth < 4 ? this.signal(dest, depth + 1).aspect !== 'R' : r.kind === 'block'
        view.aspect = !lamps.green ? 'Y' : lamps.yellow === 0 ? 'G' : !diverging && destOff ? 'G' : 'Y'
      }
    }
    return view
  }

  activeRoutes(): string[] {
    return this.rcc.routes.filter((r) => this.routes.get(r.id)!.phase !== 'idle').map((r) => r.id)
  }

  /** Required point positions with the part of the route that releases them. */
  private claimsOf(r: RccRoute): Map<string, { pos: PointPos; part: 'route' | 'overlap' }> {
    const out = new Map<string, { pos: PointPos; part: 'route' | 'overlap' }>()
    for (const q of r.points.route) out.set(q.unit, { pos: q.pos, part: 'route' })
    for (const q of r.points.isolation) out.set(q.unit, { pos: q.pos, part: r.overlapId ? 'overlap' : 'route' })
    for (const q of r.points.overlap) out.set(q.unit, { pos: q.pos, part: 'overlap' })
    return out
  }

  /* ----------------------------------- commands ----------------------------------- */

  dispatch(cmd: Command): CommandResult {
    this.history.push({ t: this.time, cmd })
    const res = this.apply(cmd)
    if (!res.ok) this.say('refused', `${this.describe(cmd)} refused: ${res.reasons.join('; ')}`)
    this.bump()
    return res
  }

  private describe(cmd: Command): string {
    switch (cmd.type) {
      case 'setRoute': return `Route ${cmd.route}`
      case 'cancelRoute': return `Cancel ${cmd.route}`
      case 'emergencyRelease': return `Emergency release ${cmd.route}`
      case 'movePoint': return `Move point ${cmd.unit} to ${cmd.pos}`
      default: return cmd.type
    }
  }

  private apply(cmd: Command): CommandResult {
    const ok: CommandResult = { ok: true, reasons: [] }
    const no = (...reasons: string[]): CommandResult => ({ ok: false, reasons })
    switch (cmd.type) {
      case 'setRoute': return this.setRoute(cmd.route)
      case 'cancelRoute': return this.cancelRoute(cmd.route)
      case 'emergencyRelease': return this.emergencyRelease(cmd.route)
      case 'setControl': {
        if (!this.controls.has(cmd.control)) return no(`Unknown control ${cmd.control}`)
        this.controls.set(cmd.control, cmd.value)
        this.say('event', `${cmd.control} ${cmd.value ? 'put IN' : 'taken OUT'}`)
        return ok
      }
      case 'movePoint': {
        const p = this.points.get(cmd.unit)
        if (!p) return no(`Unknown point ${cmd.unit}`)
        if (p.owners.size > 0) return no(`Point ${cmd.unit} is locked by route ${[...p.owners.keys()].join(', ')}`)
        const why = this.cannotMove(cmd.unit)
        if (why) return no(why)
        this.startMove(cmd.unit, cmd.pos)
        this.say('event', `Point ${cmd.unit} operated to ${cmd.pos === 'N' ? 'normal' : 'reverse'} by hand`)
        return ok
      }
      case 'pointFault': {
        const p = this.points.get(cmd.unit)
        if (!p) return no(`Unknown point ${cmd.unit}`)
        p.fault = cmd.fault
        this.say('warn', `Point ${cmd.unit} fault: ${cmd.fault}`)
        return ok
      }
      case 'tcFault': {
        const t = this.tcs.get(cmd.tc)
        if (!t) return no(`Unknown track circuit ${cmd.tc}`)
        t.fault = cmd.fault
        this.say('warn', `Track ${cmd.tc} fault: ${cmd.fault}`)
        this.refreshOccupancy()
        return ok
      }
      case 'lampFault': {
        if (!this.lamps.has(cmd.signal)) return no(`Unknown signal ${cmd.signal}`)
        this.lamps.set(cmd.signal, cmd.failed)
        this.say('warn', `Signal ${cmd.signal} lamp ${cmd.failed ? 'failed' : 'restored'}`)
        return ok
      }
      case 'blockInput': {
        const key = `${cmd.section}/${cmd.input}`
        if (!this.blockInputs.has(key)) return no(`Unknown block input ${key}`)
        this.blockInputs.set(key, cmd.value)
        this.say('event', `Block ${key} ${cmd.value ? 'given' : 'withdrawn'}`)
        return ok
      }
      case 'addTrain': return this.addTrain(cmd.train)
      case 'removeTrain': {
        this.trains = this.trains.filter((t) => t.id !== cmd.id)
        this.refreshOccupancy()
        return ok
      }
      case 'trainRun': {
        const t = this.trains.find((x) => x.id === cmd.id)
        if (!t) return no(`No train ${cmd.id}`)
        t.run = cmd.run
        return ok
      }
      case 'setting': {
        ;(this.settings as unknown as Record<string, number | boolean>)[cmd.key] = cmd.value
        return ok
      }
    }
  }

  /* ----------------------------- route conditions ------------------------------ */

  private cannotMove(unit: string): string | null {
    const u = this.net.units.get(unit)
    const p = this.points.get(unit)
    if (!u || !p) return `Unknown point ${unit}`
    if (p.moving) return `Point ${unit} is already moving`
    if (u.crankHandle && this.controls.get(u.crankHandle) === false) return `${u.crankHandle} is OUT, point ${unit} cannot be driven`
    for (const tc of u.tcs) if (this.occ(tc)) return `Track ${tc} over point ${unit} is occupied`
    return null
  }

  private conflicts(r: RccRoute): string[] {
    const out: string[] = []
    for (const o of this.rcc.routes) {
      if (o.id === r.id) continue
      const ort = this.routes.get(o.id)!
      if (ort.phase === 'idle') continue
      const routeHeld = ort.phase !== 'overlap'
      const named = (routeHeld && (r.locks.routes.includes(o.id) || o.locks.routes.includes(r.id))) || false
      const ovClash =
        (!!o.overlapId && r.locks.overlaps.includes(o.overlapId)) || (!!r.overlapId && o.locks.overlaps.includes(r.overlapId))
      if (named || ovClash) out.push(`${o.id} is set (${named ? 'route' : 'overlap'} lock)`)
    }
    // Same signal slot, other route.
    for (const o of this.rcc.routes) {
      if (o.id !== r.id && o.signal === r.signal && this.routes.get(o.id)!.phase !== 'idle') out.push(`signal ${r.signal} already used by ${o.id}`)
    }
    return [...new Set(out)]
  }

  private pointIssues(r: RccRoute, accepting: boolean): string[] {
    const out: string[] = []
    for (const [unit, want] of this.claimsOf(r)) {
      const p = this.points.get(unit)!
      if (accepting) {
        for (const [other, claim] of p.owners) if (other !== r.id && claim.pos !== want.pos) out.push(`point ${unit} is held ${claim.pos === 'N' ? 'normal' : 'reverse'} by ${other}`)
        if (p.pos !== want.pos || p.moving) {
          const why = p.owners.size > 0 ? null : this.cannotMove(unit)
          if (why) out.push(why)
        }
      } else if (p.moving) out.push(`point ${unit} moving`)
      else if (p.pos !== want.pos) out.push(`point ${unit} not ${want.pos === 'N' ? 'normal' : 'reverse'}`)
      else if (p.fault === 'noDetection') out.push(`point ${unit} has lost detection`)
      else if (p.fault === 'stuck') out.push(`point ${unit} is stuck`)
    }
    return out
  }

  private controlIssues(r: RccRoute): string[] {
    return r.controls.filter((c) => this.controls.get(c) === false).map((c) => `${c} is OUT`)
  }

  private tcIssues(r: RccRoute, rt: RouteRuntime, accepting: boolean): string[] {
    const out: string[] = []
    if (r.kind === 'callingOn') {
      if (accepting) return out
      const c = r.clearAfter
      if (c && !rt.signalOff) {
        const t = this.tcs.get(c.tc)
        if (!t?.occupied || t.since === null) out.push(`waiting for a train on ${c.tc}`)
        else {
          const left = c.seconds - (this.time - t.since)
          if (left > EPS) out.push(`calling-on timer: ${Math.ceil(left)} s left (train on ${c.tc})`)
        }
      }
      return out
    }
    const entering = rt.signalOff && r.flyBack.tc && this.occ(r.flyBack.tc)
    if (entering) return out
    for (const tc of [...r.tcs.route, ...r.tcs.overlap]) if (this.occ(tc)) out.push(`track ${tc} occupied`)
    return out
  }

  private blockIssues(r: RccRoute): string[] {
    const out: string[] = []
    for (const b of r.block) {
      const key = `${b.section}/${b.contact}`
      if (this.blockInputs.has(key) && !this.blockInputs.get(key)) out.push(`${b.instrument} ${b.contact} of ${b.section} not received`)
    }
    return out
  }

  private lampIssues(r: RccRoute): string[] {
    const out: string[] = []
    const own = this.signalOfPost(r.post)
    if (own && this.lamps.get(own)) out.push(`signal ${r.post} lamp failed`)
    for (const p of r.protections) {
      const id = this.signalOfPost(p.post)
      if (!id) continue
      if (this.lamps.get(id)) out.push(`${p.kind === 'red' ? 'red' : 'any'} lamp of signal ${p.post} not proved`)
      else if (p.kind === 'red' && this.signal(id).off) out.push(`signal ${p.post} is not at danger`)
    }
    return out
  }

  /** Everything the row asks for, as reasons it is not met. */
  private reasonsFor(r: RccRoute, accepting: boolean): string[] {
    const rt = this.routes.get(r.id)!
    return [
      ...(accepting ? this.conflicts(r) : []),
      ...this.controlIssues(r),
      ...this.pointIssues(r, accepting),
      ...this.tcIssues(r, rt, accepting),
      ...this.blockIssues(r),
      ...this.lampIssues(r),
    ]
  }

  /* ----------------------------- route lifecycle ------------------------------ */

  private setRoute(id: string): CommandResult {
    const r = this.rcc.byId.get(id)
    if (!r) return { ok: false, reasons: [`Unknown route ${id}`] }
    const rt = this.routes.get(id)!
    if (rt.phase === 'locked' && !rt.signalOff && rt.revoked) {
      const why = this.reasonsFor(r, false)
      if (why.length > 0) return { ok: false, reasons: why }
      rt.revoked = false
      this.say('event', `Route ${id} requested again`)
      return { ok: true, reasons: [] }
    }
    if (rt.phase !== 'idle') return { ok: false, reasons: [`Route ${id} is already ${rt.phase}`] }
    const why = this.reasonsFor(r, true)
    if (why.length > 0) return { ok: false, reasons: why }
    for (const [unit, want] of this.claimsOf(r)) {
      const p = this.points.get(unit)!
      p.owners.set(id, { pos: want.pos, part: want.part })
      if (p.pos !== want.pos || p.moving) this.startMove(unit, want.pos)
    }
    Object.assign(rt, this.freshRoute(), { phase: 'setting' })
    this.say('event', `Route ${id} (${r.signal} to ${r.destination}) accepted`)
    return { ok: true, reasons: [] }
  }

  private startMove(unit: string, to: PointPos): void {
    const p = this.points.get(unit)!
    if (p.moving && p.moving.to === to) return
    p.moving = { to, remaining: p.fault === 'stuck' ? Number.POSITIVE_INFINITY : this.settings.pointSeconds }
  }

  private cancelRoute(id: string): CommandResult {
    const r = this.rcc.byId.get(id)
    if (!r) return { ok: false, reasons: [`Unknown route ${id}`] }
    const rt = this.routes.get(id)!
    if (rt.phase === 'idle') return { ok: false, reasons: [`Route ${id} is not set`] }
    if (rt.phase === 'overlap') return { ok: false, reasons: ['Route has been passed; the overlap releases by itself (use emergency release otherwise)'] }
    if (rt.trainEntered || rt.phase === 'used') return { ok: false, reasons: ['A train has entered the route; it releases behind the train (use emergency release otherwise)'] }
    const wasOff = rt.signalOff || rt.clearedAt !== null
    rt.signalOff = false
    const approach = this.net.standingTc(this.signalOfPost(r.post) ?? '')
    const near = r.deadApproach && !!approach && this.occ(approach) && wasOff
    const delay = near ? this.settings.approachLockSeconds : wasOff ? r.releaseDelaySeconds : 0
    if (delay > 0) {
      rt.releaseAt = this.time + delay
      rt.releaseKind = 'cancel'
      this.say('event', `Route ${id} cancelled; held ${delay} s${near ? ' (train in approach)' : ''}`)
    } else {
      this.releaseAll(id, 'cancelled')
    }
    return { ok: true, reasons: [] }
  }

  private emergencyRelease(id: string): CommandResult {
    const r = this.rcc.byId.get(id)
    if (!r) return { ok: false, reasons: [`Unknown route ${id}`] }
    const rt = this.routes.get(id)!
    if (rt.phase === 'idle') return { ok: false, reasons: [`Route ${id} is not set`] }
    rt.signalOff = false
    rt.releaseAt = this.time + this.settings.approachLockSeconds
    rt.releaseKind = 'emergency'
    this.say('warn', `Emergency release of ${id}: route frees in ${this.settings.approachLockSeconds} s without proving train passage`)
    return { ok: true, reasons: [] }
  }

  private dropClaims(id: string, only?: 'route' | 'overlap'): void {
    for (const p of this.points.values()) {
      const c = p.owners.get(id)
      if (c && (!only || c.part === only)) p.owners.delete(id)
    }
  }

  private releaseAll(id: string, why: string): void {
    this.dropClaims(id)
    this.routes.set(id, this.freshRoute())
    this.say('event', `Route ${id} released (${why})`)
  }

  private updateRoutes(): void {
    for (const r of this.rcc.routes) {
      const rt = this.routes.get(r.id)!
      if (rt.phase === 'idle') continue
      rt.reasons = []

      if (rt.releaseAt !== null) {
        rt.signalOff = false
        rt.reasons = [`release in ${Math.max(0, Math.ceil(rt.releaseAt - this.time))} s`]
        if (this.time + EPS >= rt.releaseAt) this.releaseAll(r.id, rt.releaseKind === 'emergency' ? 'emergency' : 'time out')
        continue
      }

      if (rt.phase === 'setting') {
        const why = this.pointIssues(r, false)
        rt.reasons = why
        if (why.length === 0) {
          rt.phase = 'locked'
          this.say('event', `Route ${r.id} points set and detected`)
        } else continue
      }

      if (rt.phase === 'locked') this.updateLocked(r, rt)
      if (rt.phase === 'used') this.updateUsed(r, rt)
      if (rt.phase === 'overlap') this.updateOverlap(r, rt)
    }
  }

  private updateLocked(r: RccRoute, rt: RouteRuntime): void {
    const why = this.reasonsFor(r, false)
    if (!rt.signalOff) {
      rt.reasons = why
      if (rt.revoked && !this.settings.autoReclear) {
        rt.reasons = ['signal returned to ON; request the route again', ...why]
        return
      }
      if (why.length === 0) {
        rt.signalOff = true
        rt.revoked = false
        rt.clearedAt = this.time
        this.say('event', `Signal ${r.signal} cleared for ${r.id}`)
      }
      return
    }
    // Signal is off: fly back on entry of the train, or fall back on any failure.
    const ft = r.flyBack.tc ? this.tcs.get(r.flyBack.tc) : undefined
    if (ft?.occupied && ft.since !== null) {
      rt.trainEntered = true
      if (this.time - ft.since + EPS >= r.flyBack.seconds) {
        rt.signalOff = false
        rt.phase = 'used'
        this.say('event', `Signal ${r.signal} back to ON after train entered ${r.flyBack.tc}`)
        this.consumeBlock(r)
      }
      return
    }
    if (why.length > 0) {
      rt.signalOff = false
      rt.revoked = true
      rt.reasons = why
      this.say('warn', `Signal ${r.signal} returned to ON: ${why.join('; ')}`)
    }
  }

  private consumeBlock(r: RccRoute): void {
    for (const sec of this.config.blockSections ?? []) for (const i of sec.inputs) if (i.consumedByRoute === r.id) this.blockInputs.set(`${sec.id}/${i.id}`, false)
  }

  private backTcs(r: RccRoute): string[] {
    if (r.backLock.length > 0) return r.backLock
    return r.flyBack.tc ? [r.flyBack.tc] : r.tcs.route.slice(0, 1)
  }

  private updateUsed(r: RccRoute, rt: RouteRuntime): void {
    const back = this.backTcs(r)
    for (const tc of back) if (this.occ(tc)) rt.backSeen.add(tc)
    const passed = back.every((tc) => rt.backSeen.has(tc) && !this.occ(tc))
    if (!passed) {
      const left = back.filter((tc) => !rt.backSeen.has(tc) || this.occ(tc))
      rt.reasons = [`back locking: waiting for the train to pass and clear ${left.join(', ')}`]
      rt.backReleaseAt = null
      return
    }
    if (r.releaseDelaySeconds > 0) {
      if (rt.backReleaseAt === null) rt.backReleaseAt = this.time + r.releaseDelaySeconds
      if (this.time + EPS < rt.backReleaseAt) {
        rt.reasons = [`route release delay: ${Math.ceil(rt.backReleaseAt - this.time)} s`]
        return
      }
    }
    this.dropClaims(r.id, 'route')
    this.say('event', `Route ${r.id} released behind the train`)
    for (const o of this.rcc.routes) {
      const ort = this.routes.get(o.id)!
      if (ort.phase === 'overlap' && o.destinationPost === r.post && o.id !== r.id) ort.overlapReady = true
    }
    if (r.overlapId && r.tcs.overlap.length > 0) {
      rt.phase = 'overlap'
      rt.overlapSince = this.time
    } else this.releaseAll(r.id, 'passed')
  }

  private updateOverlap(r: RccRoute, rt: RouteRuntime): void {
    const rel = r.overlapRelease
    const stopped = !!rel.cleared && !this.occ(rel.cleared) && rel.occupiedAnyOf.some((tc) => this.occ(tc))
    const timer = this.settings.overlapTimerSeconds > 0 && rt.overlapSince !== null && this.time - rt.overlapSince + EPS >= this.settings.overlapTimerSeconds
    if (rt.overlapReady) return void this.releaseAll(r.id, 'overlap freed: train ran through, starter back lock released')
    if (stopped) return void this.releaseAll(r.id, 'overlap freed: train standing at the destination')
    if (timer) return void this.releaseAll(r.id, 'overlap freed by timer')
    const left = this.settings.overlapTimerSeconds > 0 && rt.overlapSince !== null ? Math.max(0, Math.ceil(this.settings.overlapTimerSeconds - (this.time - rt.overlapSince))) : null
    rt.reasons = [`overlap ${r.overlapId} held: waiting for the train to stop or run through${left !== null ? `, timer ${left} s` : ''}`]
  }

  /* ----------------------------------- field ----------------------------------- */

  private updatePoints(dt: number): void {
    for (const [unit, p] of this.points) {
      if (!p.moving) continue
      const u = this.net.units.get(unit)
      if (u?.crankHandle && this.controls.get(u.crankHandle) === false) continue
      p.moving.remaining -= dt
      if (p.moving.remaining <= EPS) {
        p.pos = p.moving.to
        p.moving = null
      }
    }
  }

  private refreshOccupancy(): void {
    const physical = new Set<string>()
    for (const t of this.trains) for (const tc of this.tcsOf(t.trail)) physical.add(tc)
    for (const [code, t] of this.tcs) {
      t.physical = physical.has(code)
      const now = t.fault === 'clear' ? false : t.fault === 'occupied' ? true : t.physical
      if (now && !t.occupied) t.since = this.time
      if (!now) t.since = null
      t.occupied = now
    }
  }

  tcsOf(legs: Leg[]): string[] {
    const out = new Set<string>()
    for (const leg of legs) {
      const lo = Math.min(leg.s0, leg.s1)
      const hi = Math.max(leg.s0, leg.s1)
      for (const p of this.net.pieces.get(leg.edge) ?? []) if (p.s1 > lo + EPS && p.s0 < hi - EPS) out.add(p.tc)
    }
    return [...out]
  }

  /* ----------------------------------- trains ----------------------------------- */

  private mpu(): number {
    return this.net.metresPerUnit
  }

  private addTrain(spec: TrainSpec): CommandResult {
    if (this.trains.some((t) => t.id === spec.id)) return { ok: false, reasons: [`Train ${spec.id} exists`] }
    let head: PathPos | null = null
    if (spec.atSignal) {
      const post = this.net.posts.get(spec.atSignal)
      if (!post) return { ok: false, reasons: [`Signal ${spec.atSignal} is not on the layout`] }
      const e = this.net.edges.get(post.edge)!
      const dir = (post.east ? e.xDir : -e.xDir) as 1 | -1
      head = { edge: post.edge, s: post.s - dir * (this.settings.stopMarginM / this.mpu()), dir }
    } else if (spec.atTc) {
      const loc = this.tcLocations.get(spec.atTc)?.[0]
      if (!loc) return { ok: false, reasons: [`Track ${spec.atTc} not found`] }
      const e = this.net.edges.get(loc.edge)!
      const east = spec.east ?? true
      head = { edge: loc.edge, s: (loc.s0 + loc.s1) / 2, dir: (east ? e.xDir : -e.xDir) as 1 | -1 }
    }
    if (!head) return { ok: false, reasons: ['Give atSignal or atTc'] }
    const lenUnits = spec.lengthM / this.mpu()
    const back = this.net.advance({ ...head, dir: (-head.dir) as 1 | -1 }, lenUnits, this.unitPos)
    const trail: Leg[] = back.legs.map((l) => ({ edge: l.edge, s0: l.s1, s1: l.s0 })).reverse()
    const train: Train = {
      id: spec.id,
      name: spec.name ?? spec.id,
      lengthM: spec.lengthM,
      maxMps: spec.maxKmph / 3.6,
      speed: 0,
      run: true,
      ignoreSignals: spec.ignoreSignals ?? false,
      trail,
      head,
      leaving: false,
      note: '',
      authority: null,
      limitMps: null,
    }
    this.trains.push(train)
    this.refreshOccupancy()
    this.say('event', `Train ${train.name} placed ${spec.atSignal ? `at signal ${spec.atSignal}` : `on ${spec.atTc}`}`)
    return { ok: true, reasons: [] }
  }

  /** Distance in metres to the nearest thing that must stop the train, with its description. */
  private obstacle(t: Train): { d: number; why: string } | null {
    const look = 400 / this.mpu()
    const r = this.net.advance(t.head, look, this.unitPos)
    let acc = 0
    for (const leg of r.legs) {
      const e = this.net.edges.get(leg.edge)!
      const sign = leg.s1 >= leg.s0 ? 1 : -1
      const east = sign * e.xDir > 0
      const posts = (this.net.postsOnEdge.get(leg.edge) ?? []).filter((p) => p.east === east).sort((x, y) => (x.s - y.s) * sign)
      for (const post of posts) {
        const ahead = (post.s - leg.s0) * sign
        if (ahead < -1e-3 || ahead > Math.abs(leg.s1 - leg.s0) + 1e-3) continue
        const lamps = this.lampsOf(post.signalId)
        if (lamps.distant) continue
        const v = this.signal(post.signalId)
        const d = (acc + Math.max(0, ahead)) * this.mpu()
        if (v.off) {
          // Passing a signal at proceed gives the movement its authority and speed.
          if (d < 6) {
            t.authority = v.aspect !== 'R' ? 'main' : 'shunt'
            t.limitMps = v.aspect !== 'R' ? null : SLOW_MPS
          }
          continue
        }
        if (t.ignoreSignals) continue
        // A running train under a main signal is not stopped by an independent shunt signal.
        if (lamps.shuntOnly && t.authority === 'main') continue
        return { d, why: `signal ${this.station.assets.signals.find((x) => x.id === post.signalId)?.code ?? post.signalId} at danger` }
      }
      acc += Math.abs(leg.s1 - leg.s0)
    }
    if (r.stop) {
      if (r.stop.kind === 'blocked') return { d: acc * this.mpu(), why: r.stop.reason === 'moving' ? `point ${r.stop.unit ?? ''} moving` : `point ${r.stop.unit ?? r.stop.node} set against the train` }
      if (r.stop.buffer) return { d: acc * this.mpu(), why: r.stop.endName ?? 'buffer stop' }
    }
    return null
  }

  private moveTrains(dt: number): void {
    for (const t of this.trains) {
      let target = t.run ? Math.min(t.maxMps, t.limitMps ?? Infinity) : 0
      t.note = t.run ? 'running' : 'held'
      if (!t.leaving) {
        const ob = this.obstacle(t)
        if (ob) {
          const room = Math.max(0, ob.d - this.settings.stopMarginM)
          const v = Math.sqrt(2 * this.settings.brakeMps2 * room)
          if (v < target) {
            target = v
            t.note = target < 0.05 ? `stopped: ${ob.why}` : `braking for ${ob.why}`
          }
        }
      }
      if (t.speed < target) t.speed = Math.min(target, t.speed + this.settings.accelMps2 * dt)
      else t.speed = Math.max(target, t.speed - this.settings.brakeMps2 * 2 * dt)
      if (t.speed < 0.01 && target < 0.05) t.speed = 0
      const dist = (t.speed * dt) / this.mpu()
      if (dist <= 0) continue
      if (t.leaving) {
        this.trim(t, dist)
        continue
      }
      const r = this.net.advance(t.head, dist, this.unitPos)
      t.head = r.pos
      t.trail.push(...r.legs)
      if (r.stop) {
        if (r.stop.kind === 'end' && !r.stop.buffer) {
          t.leaving = true
          t.note = 'leaving the station area'
        } else t.speed = 0
      }
      this.trim(t, 0)
    }
    this.trains = this.trains.filter((t) => {
      const gone = t.leaving && t.trail.length === 0
      if (gone) this.say('event', `Train ${t.name} has left the station area`)
      return !gone
    })
  }

  /** Cut the trail down to the train length, plus `extra` more units when the train is running off the end. */
  private trim(t: Train, extra: number): void {
    const keep = t.lengthM / this.mpu()
    let total = t.trail.reduce((a, l) => a + Math.abs(l.s1 - l.s0), 0)
    let excess = t.leaving ? extra : total - keep
    while (excess > EPS && t.trail.length > 0) {
      const l = t.trail[0]!
      const len = Math.abs(l.s1 - l.s0)
      if (len <= excess + EPS) {
        t.trail.shift()
        excess -= len
        total -= len
      } else {
        const sign = l.s1 >= l.s0 ? 1 : -1
        t.trail[0] = { edge: l.edge, s0: l.s0 + sign * excess, s1: l.s1 }
        excess = 0
      }
    }
  }

  /* ------------------------------------ step ------------------------------------ */

  step(dt = DT): void {
    this.time = Math.round((this.time + dt) * 1000) / 1000
    this.moveTrains(dt)
    this.refreshOccupancy()
    this.updatePoints(dt)
    this.updateRoutes()
    this.bump()
  }

  run(seconds: number): void {
    const n = Math.round(seconds / DT)
    for (let i = 0; i < n; i++) this.step(DT)
  }

  /** Re-run a recorded scenario on a fresh simulation. */
  static replay(sim: Simulation, history: { t: number; cmd: Command }[], until: number): void {
    sim.reset()
    const queue = [...history].sort((a, b) => a.t - b.t)
    let i = 0
    while (sim.time + EPS < until) {
      while (i < queue.length && queue[i]!.t <= sim.time + EPS) sim.dispatch(queue[i++]!.cmd)
      sim.step(DT)
    }
  }
}
