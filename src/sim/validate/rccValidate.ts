import type { Leg, PathPos, Stop } from '../engine/network'
import { Network } from '../engine/network'
import type { Issue, PointPos, RccRoute, RccTable } from '../rcc/types'

/** Cross-checks of the chart against itself, against the point/handle charts, and against the station layout. */

export interface WalkReport {
  routeId: string
  /** The whole path (route then overlap) as edge pieces, for highlighting. */
  legs: Leg[]
  /** How many of `legs` belong to the route (the rest are the overlap). */
  routeLegCount: number
  reachedDestination: boolean
  routeTcs: string[]
  overlapTcs: string[]
  /** Points the path crosses that the row does not mention (assumed normal). */
  unspecifiedUnits: string[]
  stop: Stop | null
  routeLengthM: number
}

const EPS = 1e-6

function tcsAlong(net: Network, legs: Leg[]): string[] {
  const out: string[] = []
  const add = (tc: string) => {
    if (!out.includes(tc)) out.push(tc)
  }
  for (const leg of legs) {
    const lo = Math.min(leg.s0, leg.s1)
    const hi = Math.max(leg.s0, leg.s1)
    const hit = (net.pieces.get(leg.edge) ?? []).filter((p) => p.s1 > lo + EPS && p.s0 < hi - EPS)
    hit.sort((a, b) => (leg.s1 >= leg.s0 ? a.s0 - b.s0 : b.s0 - a.s0))
    for (const p of hit) add(p.tc)
  }
  return out
}

/** Position map a row asks for: route, overlap and isolation points together. */
export function requiredPositions(route: RccRoute): { map: Map<string, PointPos>; conflicts: string[] } {
  const map = new Map<string, PointPos>()
  const conflicts: string[] = []
  for (const req of [...route.points.route, ...route.points.overlap, ...route.points.isolation]) {
    const prev = map.get(req.unit)
    if (prev && prev !== req.pos) conflicts.push(req.unit)
    map.set(req.unit, req.pos)
  }
  return { map, conflicts }
}

/** Walk a route over the layout the way a train would, with the points set as the row says. */
export function walkRoute(net: Network, route: RccRoute): WalkReport | null {
  const signalId = net.config.posts[route.post]
  const origin = signalId ? net.posts.get(signalId) : undefined
  if (!origin) return null
  const { map } = requiredPositions(route)
  const unspecified = new Set<string>()
  const unitPos = (unit: string) => {
    const p = map.get(unit)
    if (p) return p
    unspecified.add(unit)
    return 'N' as const
  }
  const edge = net.edges.get(origin.edge)!
  const start: PathPos = { edge: origin.edge, s: origin.s, dir: (origin.east ? edge.xDir : -edge.xDir) as 1 | -1 }

  const walk = (from: PathPos, target: { edge: string; s: number } | null, wanted: Set<string> | null, limit: number) => {
    let pos = from
    const legs: Leg[] = []
    let stop: Stop | null = null
    let reached = false
    let travelled = 0
    for (let guard = 0; guard < 500 && travelled < limit; guard++) {
      const e = net.edges.get(pos.edge)!
      if (target && target.edge === pos.edge) {
        const ahead = (target.s - pos.s) * pos.dir
        if (ahead > EPS) {
          const r = net.advance(pos, ahead, unitPos)
          legs.push(...r.legs)
          pos = r.pos
          reached = true
          break
        }
      }
      const toEnd = pos.dir > 0 ? e.length - pos.s : pos.s
      const r = net.advance(pos, toEnd + 1e-4, unitPos)
      legs.push(...r.legs)
      travelled += r.moved
      pos = r.pos
      if (r.stop) {
        stop = r.stop
        break
      }
      if (wanted && [...wanted].every((tc) => tcsAlong(net, legs).includes(tc))) break
    }
    return { pos, legs, stop, reached }
  }

  const dest = route.destinationPost ? net.posts.get(net.config.posts[route.destinationPost] ?? '') ?? null : null
  const first = walk(start, dest ? { edge: dest.edge, s: dest.s } : null, null, 20000)
  const standing = net.standingTc(signalId!)
  const routeTcs = tcsAlong(net, first.legs).filter((tc) => tc !== standing)

  let overlapLegs: Leg[] = []
  let overlapTcs: string[] = []
  if (first.reached && route.tcs.overlap.length > 0) {
    const second = walk(first.pos, null, new Set(route.tcs.overlap), 6000)
    overlapLegs = second.legs
    overlapTcs = tcsAlong(net, overlapLegs)
  }
  let lengthUnits = 0
  for (const l of first.legs) lengthUnits += Math.abs(l.s1 - l.s0)
  return {
    routeId: route.id,
    legs: [...first.legs, ...overlapLegs],
    routeLegCount: first.legs.length,
    reachedDestination: first.reached,
    routeTcs,
    overlapTcs,
    unspecifiedUnits: [...unspecified],
    stop: first.stop,
    routeLengthM: lengthUnits * net.metresPerUnit,
  }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function validateRcc(rcc: RccTable, net: Network): { issues: Issue[]; walks: Map<string, WalkReport> } {
  const issues: Issue[] = [...rcc.issues.map((i) => ({ ...i })), ...net.issues.map((i) => ({ ...i }))]
  const add = (level: Issue['level'], code: string, message: string, where?: string) => issues.push({ level, code, message, where })
  const tcCodes = new Set(net.station.assets.trackCircuits.map((t) => t.code))
  const signalIds = new Set(net.station.assets.signals.map((s) => s.id))
  const walks = new Map<string, WalkReport>()

  // The chart's own references must exist in the station.
  for (const [post, id] of Object.entries(net.config.posts)) if (!signalIds.has(id)) add('error', 'post-missing', `Config maps post ${post} to ${id} which is not a signal in the station`)
  const handles = new Set<string>()
  for (const u of net.units.values()) if (u.crankHandle) handles.add(u.crankHandle)
  for (const row of rcc.handleChart) for (const c of row.controls) handles.add(c)

  for (const r of rcc.routes) {
    const where = `row ${r.sl} (${r.id})`
    const tcRefs = [...r.tcs.route, ...r.tcs.overlap, ...r.backLock, ...r.overlapRelease.occupiedAnyOf, ...(r.overlapRelease.cleared ? [r.overlapRelease.cleared] : []), ...(r.flyBack.tc ? [r.flyBack.tc] : []), ...(r.clearAfter ? [r.clearAfter.tc] : [])]
    for (const tc of new Set(tcRefs)) if (!tcCodes.has(tc)) add('error', 'tc-unknown', `Track circuit ${tc} is not in the station data`, where)
    for (const req of [...r.points.route, ...r.points.overlap, ...r.points.isolation]) if (!net.units.has(req.unit)) add('error', 'point-unknown', `Point ${req.unit} is not in the station data`, where)
    if (!net.config.posts[r.post]) add('error', 'post-unmapped', `Signal post ${r.post} (${r.signal}) has no entry in the station config`, where)
    if (r.destinationPost && !net.config.posts[r.destinationPost]) add('warn', 'dest-unmapped', `Destination signal ${r.destination} has no entry in the station config`, where)
    for (const p of r.protections) if (!net.config.posts[p.post]) add('warn', 'protection-unmapped', `Lamp protection names signal ${p.post}, which has no entry in the station config`, where)
    for (const c of r.controls) if (!handles.has(c)) add('warn', 'control-unknown', `Control ${c} is not a crank handle in the station or the handle chart`, where)
    for (const b of r.block) if (!net.config.blockSections?.some((s) => s.id === b.section)) add('warn', 'block-unconfigured', `Block section ${b.section} has no entry in the station config`, where)
    if (r.overlapId && r.tcs.overlap.length === 0) add('warn', 'overlap-empty', `Overlap ${r.overlapId} lists no track circuits`, where)

    // Inside one row.
    const { conflicts } = requiredPositions(r)
    for (const u of conflicts) add('error', 'row-point-conflict', `Point ${u} is required both normal and reverse`, where)
    for (const tc of r.backLock) if (!r.tcs.route.includes(tc)) add('info', 'back-not-in-route', `Back-lock TC ${tc} is not one of the route TCs`, where)
    if (r.flyBack.tc && r.kind !== 'block' && !r.tcs.route.includes(r.flyBack.tc)) add('warn', 'flyback-not-in-route', `Fly-back TC ${r.flyBack.tc} is not one of the route TCs`, where)
    if (r.overlapRelease.cleared && !r.backLock.includes(r.overlapRelease.cleared)) add('info', 'ovclear-not-back', `Overlap-release TC ${r.overlapRelease.cleared} is not in the back-lock list`, where)
    // Crank handles must cover every motorised point the row uses.
    const needed = new Set<string>()
    for (const req of [...r.points.route, ...r.points.overlap, ...r.points.isolation]) {
      const ch = net.units.get(req.unit)?.crankHandle
      if (ch) needed.add(ch)
    }
    const listed = new Set(r.controls)
    for (const ch of needed) if (!listed.has(ch)) add('warn', 'control-missing', `Row uses a point on ${ch} but does not list ${ch}IN`, where)
    for (const ch of listed) if (!needed.has(ch) && ch.startsWith('CH')) add('info', 'control-extra', `Row lists ${ch}IN but uses no point on it`, where)
  }

  // Conflicts: two rows that need a point in opposite positions must lock each other.
  const claims = new Map<string, Map<string, PointPos>>()
  for (const r of rcc.routes) claims.set(r.id, requiredPositions(r).map)
  const locked = (a: RccRoute, b: RccRoute) =>
    a.locks.routes.includes(b.id) || b.locks.routes.includes(a.id) || (!!b.overlapId && a.locks.overlaps.includes(b.overlapId)) || (!!a.overlapId && b.locks.overlaps.includes(a.overlapId))
  for (let i = 0; i < rcc.routes.length; i++) {
    for (let j = i + 1; j < rcc.routes.length; j++) {
      const a = rcc.routes[i]!
      const b = rcc.routes[j]!
      if (a.name === b.name && a.variant !== b.variant) {
        if (!a.locks.routes.includes(b.id) && !b.locks.routes.includes(a.id)) add('error', 'variants-not-exclusive', `${a.id} and ${b.id} are the same route with different overlaps but do not lock each other`)
        continue
      }
      const ca = claims.get(a.id)!
      const cb = claims.get(b.id)!
      const clash = [...ca].filter(([u, p]) => cb.has(u) && cb.get(u) !== p).map(([u]) => u)
      if (clash.length > 0 && !locked(a, b)) add('warn', 'unlocked-conflict', `${a.id} and ${b.id} need point ${clash.join(', ')} in opposite positions but neither lists the other`)
      // Same-signal rule: one signal, one route.
      if (a.signal === b.signal && !locked(a, b)) add('warn', 'same-signal-unlocked', `${a.id} and ${b.id} share signal ${a.signal} but do not lock each other`)
    }
  }
  for (const a of rcc.routes) {
    for (const id of a.locks.routes) {
      const b = rcc.byId.get(id)!
      if (!b.locks.routes.includes(a.id) && !(a.overlapId && b.locks.overlaps.includes(a.overlapId))) add('info', 'asymmetric-lock', `${a.id} locks ${b.id} but ${b.id} does not list ${a.id}`)
    }
  }

  // Point chart (sheet 7) and handle chart (sheet 8) against the route rows.
  for (const row of rcc.pointChart) {
    for (const pos of ['N', 'R'] as const) {
      const chart = pos === 'N' ? row.normal : row.reverse
      const strictRoutes = new Set<string>()
      const possibleRoutes = new Set<string>()
      const strictOverlaps = new Set<string>()
      const possibleOverlaps = new Set<string>()
      for (const r of rcc.routes) {
        if (r.points.route.some((p) => p.unit === row.unit && p.pos === pos)) strictRoutes.add(r.name)
        if (r.points.overlap.some((p) => p.unit === row.unit && p.pos === pos) && r.overlapId) strictOverlaps.add(r.overlapId)
        if (r.points.isolation.some((p) => p.unit === row.unit && p.pos === pos)) {
          possibleRoutes.add(r.name)
          if (r.overlapId) possibleOverlaps.add(r.overlapId)
        }
      }
      for (const n of strictRoutes) possibleRoutes.add(n)
      for (const o of strictOverlaps) possibleOverlaps.add(o)
      const w = `point chart ${row.label} ${pos === 'N' ? 'normal' : 'reverse'}`
      for (const n of strictRoutes) if (!chart.routes.includes(n)) add('warn', 'chart-missing-route', `Route ${n} needs point ${row.unit} ${pos} but the point chart does not list it`, w)
      for (const n of chart.routes) if (!possibleRoutes.has(n)) add('warn', 'chart-extra-route', `Point chart lists route ${n} but no row of ${n} needs point ${row.unit} ${pos}`, w)
      for (const o of strictOverlaps) if (!chart.overlaps.includes(o)) add('warn', 'chart-missing-overlap', `Overlap ${o} needs point ${row.unit} ${pos} but the point chart does not list it`, w)
      for (const o of chart.overlaps) if (!possibleOverlaps.has(o)) add('warn', 'chart-extra-overlap', `Point chart lists overlap ${o} but it does not need point ${row.unit} ${pos}`, w)
    }
  }
  for (const row of rcc.handleChart) {
    const units = new Set(row.units)
    const expectRoutes = new Set<string>()
    const expectOverlaps = new Set<string>()
    for (const r of rcc.routes) {
      if (row.controls.some((c) => r.controls.includes(c))) {
        expectRoutes.add(r.name)
        if (r.overlapId) expectOverlaps.add(r.overlapId)
      }
    }
    const w = `handle chart ${row.controls.join('/')}`
    for (const n of expectRoutes) if (!row.routes.includes(n)) add('warn', 'handle-missing-route', `Route ${n} lists ${row.controls[0]}IN but the handle chart does not list it`, w)
    for (const n of row.routes) if (!expectRoutes.has(n)) add('warn', 'handle-extra-route', `Handle chart lists route ${n} but no row of ${n} lists ${row.controls[0]}IN`, w)
    for (const u of units) if (!net.units.has(u)) add('warn', 'handle-unit-unknown', `Handle chart controls point ${u} which is not in the station`, w)
  }

  // Layout walk: does the path the row describes exist, and does it cross the circuits the row lists?
  for (const r of rcc.routes) {
    if (r.kind === 'block') continue
    const where = `row ${r.sl} (${r.id})`
    const w = walkRoute(net, r)
    if (!w) {
      add('warn', 'walk-skipped', `Cannot place signal ${r.signal} on the layout`, where)
      continue
    }
    walks.set(r.id, w)
    if (!w.reachedDestination) {
      add('error', 'walk-blocked', `Walking ${r.id} from ${r.signal} does not reach ${r.destination}${w.stop ? ` (${w.stop.kind === 'blocked' ? `${w.stop.reason} at ${w.stop.node}` : `track ends at ${w.stop.node}`})` : ''}`, where)
      continue
    }
    const listed = r.tcs.route
    const walked = w.routeTcs.filter((tc) => !tcAxle(net, tc))
    const missing = listed.filter((tc) => !walked.includes(tc))
    const extra = walked.filter((tc) => !listed.includes(tc))
    if (r.kind === 'callingOn') {
      for (const tc of missing) add('warn', 'walk-route-missing', `Route lists TC ${tc} but the layout path does not cross it`, where)
    } else {
      for (const tc of missing) add('warn', 'walk-route-missing', `Route lists TC ${tc} but the layout path does not cross it`, where)
      for (const tc of extra) add(r.kind === 'shunt' ? 'info' : 'warn', 'walk-route-extra', `Layout path crosses TC ${tc} which the route does not list`, where)
    }
    if (r.tcs.overlap.length > 0 && !r.tcs.routeAnyOf) {
      const om = r.tcs.overlap.filter((tc) => !w.overlapTcs.includes(tc))
      for (const tc of om) add('warn', 'walk-overlap-missing', `Overlap lists TC ${tc} but the layout path beyond ${r.destination} does not cross it`, where)
      // The walk stops once every listed circuit is found, so anything crossed before the last listed one is unlisted.
      const lastIdx = Math.max(...r.tcs.overlap.map((tc) => w.overlapTcs.indexOf(tc)))
      const between = w.overlapTcs.slice(0, lastIdx + 1).filter((tc) => !r.tcs.overlap.includes(tc) && tc !== (net.standingTc(net.config.posts[r.destinationPost ?? ''] ?? '') ?? ''))
      for (const tc of between) add('info', 'walk-overlap-extra', `Layout path in the overlap crosses TC ${tc} which the overlap does not list`, where)
    }
    if (w.unspecifiedUnits.length > 0) add('info', 'walk-unspecified-point', `The path crosses point ${w.unspecifiedUnits.join(', ')} which the row does not set (assumed normal)`, where)
    // Back lock must be a prefix of the route circuits in travel order.
    if (r.backLock.length > 0 && !r.tcs.routeAnyOf) {
      const order = r.backLock.map((tc) => w.routeTcs.indexOf(tc))
      if (order.some((i) => i < 0)) continue
      for (let i = 1; i < order.length; i++) if (order[i]! < order[i - 1]!) add('info', 'back-order', `Back-lock list ${r.backLock.join(', ')} is not in travel order`, where)
    }
  }
  void sameSet
  return { issues, walks }
}

function tcAxle(net: Network, code: string): boolean {
  return net.station.assets.trackCircuits.find((t) => t.code === code)?.kind === 'axleCounter'
}
