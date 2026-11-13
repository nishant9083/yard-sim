import type { Point, Station } from '@/sip/model'
import type { StationSimConfig } from '../config/types'
import type { PointPos, RccTable } from '../rcc/types'

/** Physical track graph built from a station JSON. Pure geometry: no signalling state lives here. */

export interface Edge {
  id: string
  kind: 'track' | 'connection'
  trackId?: string
  connectionId?: string
  /** Node at the start (s = 0) and end (s = length) of the polyline. */
  from: string
  to: string
  pts: Point[]
  length: number
  /** +1 when x grows from start to end, -1 when it falls. */
  xDir: 1 | -1
}

export interface Arm {
  edge: string
  end: 'start' | 'end'
}

export interface Switch {
  nodeId: string
  /** Point unit that decides the route (control number, "31"). */
  unit: string | null
  stem: Arm
  normal: Arm
  reverse: Arm
}

export interface PointUnit {
  id: string
  machines: { id: string; code: string; nodeId: string }[]
  crankHandle: string | null
  /** Track circuits the point sits in (from the RCC point chart). */
  tcs: string[]
}

export interface PathPos {
  edge: string
  s: number
  dir: 1 | -1
}

export interface Leg {
  edge: string
  s0: number
  s1: number
}

export type Stop =
  | { kind: 'end'; node: string; buffer: boolean }
  | { kind: 'blocked'; node: string; reason: 'misaligned' | 'moving' | 'unsupported'; unit: string | null }

export interface TcPiece {
  tc: string
  s0: number
  s1: number
}

export interface PostOnEdge {
  /** Signal id in the station JSON. */
  signalId: string
  edge: string
  s: number
  /** Direction of travel the signal governs. */
  east: boolean
}

export type UnitPosition = (unit: string) => PointPos | 'moving'

export interface NetworkIssue {
  level: 'error' | 'warn' | 'info'
  code: string
  message: string
}

const EPS = 1e-7

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export class Network {
  readonly edges = new Map<string, Edge>()
  readonly armsAt = new Map<string, Arm[]>()
  readonly switches = new Map<string, Switch>()
  readonly units = new Map<string, PointUnit>()
  readonly pieces = new Map<string, TcPiece[]>()
  readonly postsOnEdge = new Map<string, PostOnEdge[]>()
  readonly posts = new Map<string, PostOnEdge>()
  readonly issues: NetworkIssue[] = []
  readonly metresPerUnit: number
  private readonly nodePos = new Map<string, Point>()
  private readonly bufferNodes = new Set<string>()

  constructor(
    readonly station: Station,
    readonly config: StationSimConfig,
    rcc: RccTable | null,
  ) {
    this.metresPerUnit = station.meta.chainage?.metresPerUnit ?? 0.35278
    for (const n of station.nodes) {
      this.nodePos.set(n.id, { x: n.x, y: n.y })
      if (n.kind === 'bufferStop') this.bufferNodes.add(n.id)
    }
    this.buildEdges()
    this.buildUnits(rcc)
    this.buildSwitches()
    this.buildPieces(rcc)
    this.buildPosts()
  }

  /* --------------------------------- construction --------------------------------- */

  private addEdge(e: Omit<Edge, 'length' | 'xDir'>): void {
    let length = 0
    for (let i = 1; i < e.pts.length; i++) length += dist(e.pts[i - 1]!, e.pts[i]!)
    const first = e.pts[0]!
    const last = e.pts[e.pts.length - 1]!
    const edge: Edge = { ...e, length, xDir: last.x >= first.x ? 1 : -1 }
    this.edges.set(edge.id, edge)
    for (const [node, end] of [[edge.from, 'start'], [edge.to, 'end']] as const) {
      const list = this.armsAt.get(node) ?? []
      list.push({ edge: edge.id, end })
      this.armsAt.set(node, list)
    }
  }

  private buildEdges(): void {
    for (const track of this.station.tracks) {
      for (let i = 0; i + 1 < track.nodeIds.length; i++) {
        const a = track.nodeIds[i]!
        const b = track.nodeIds[i + 1]!
        const pa = this.nodePos.get(a)
        const pb = this.nodePos.get(b)
        if (!pa || !pb) continue
        this.addEdge({ id: `${track.id}#${i}`, kind: 'track', trackId: track.id, from: a, to: b, pts: [pa, pb] })
      }
    }
    for (const c of this.station.connections) {
      const pa = this.nodePos.get(c.from)
      const pb = this.nodePos.get(c.to)
      if (!pa || !pb) continue
      this.addEdge({ id: `conn:${c.id}`, kind: 'connection', connectionId: c.id, from: c.from, to: c.to, pts: [pa, ...(c.via ?? []), pb] })
    }
  }

  private buildUnits(rcc: RccTable | null): void {
    for (const p of this.station.assets.points) {
      const id = String(p.control)
      const unit = this.units.get(id) ?? { id, machines: [], crankHandle: null, tcs: [] }
      unit.machines.push({ id: p.id, code: p.code, nodeId: p.nodeId })
      unit.crankHandle = unit.crankHandle ?? p.crankHandle ?? null
      this.units.set(id, unit)
    }
    for (const row of rcc?.pointChart ?? []) {
      const unit = this.units.get(row.unit)
      if (!unit) {
        this.issues.push({ level: 'warn', code: 'chart-unit-unknown', message: `Point chart lists point ${row.label} but the station has no point with control ${row.unit}` })
        continue
      }
      unit.tcs = row.tcs
      if (row.crankHandle) unit.crankHandle = row.crankHandle
    }
  }

  /** Direction a node's arm leaves in, as a vector from the node into the edge. */
  private armVector(arm: Arm): Point {
    const e = this.edges.get(arm.edge)!
    const n = e.pts.length
    const a = arm.end === 'start' ? e.pts[0]! : e.pts[n - 1]!
    const b = arm.end === 'start' ? e.pts[1]! : e.pts[n - 2]!
    return { x: b.x - a.x, y: b.y - a.y }
  }

  private armMatches(arm: Arm, spec: string): boolean {
    const e = this.edges.get(arm.edge)!
    const [name, side] = spec.split(':')
    if (e.kind === 'connection') return e.connectionId === name
    if (e.trackId !== name) return false
    if (!side) return true
    // "prev": the edge before the node in track order, i.e. the arm that ends at the node.
    return side === 'prev' ? arm.end === 'end' : arm.end === 'start'
  }

  private buildSwitches(): void {
    const machineAt = new Map<string, string>()
    for (const u of this.units.values()) for (const m of u.machines) machineAt.set(m.nodeId, u.id)
    for (const [nodeId, arms] of this.armsAt) {
      if (arms.length < 3) continue
      if (arms.length > 3) {
        this.issues.push({ level: 'warn', code: 'node-unsupported', message: `Node ${nodeId} joins ${arms.length} lines; only three-way points are supported` })
        continue
      }
      const unit = machineAt.get(nodeId) ?? null
      if (!unit) this.issues.push({ level: 'warn', code: 'switch-without-point', message: `Node ${nodeId} is a three-way junction but no point is attached to it` })

      const override = this.config.switchOverrides?.[nodeId]
      let normal: Arm | undefined
      let reverse: Arm | undefined
      let stem: Arm | undefined
      if (override) {
        normal = arms.find((a) => this.armMatches(a, override.normal))
        reverse = arms.find((a) => this.armMatches(a, override.reverse))
        stem = arms.find((a) => a !== normal && a !== reverse)
        if (!normal || !reverse || !stem) {
          this.issues.push({ level: 'error', code: 'switch-override-invalid', message: `switchOverrides for ${nodeId} do not match its three lines` })
          continue
        }
      } else {
        const sides = arms.map((a) => Math.sign(this.armVector(a).x))
        const east = arms.filter((_a, i) => sides[i]! > 0)
        const west = arms.filter((_a, i) => sides[i]! < 0)
        const lone = east.length === 1 && west.length === 2 ? east[0]! : west.length === 1 && east.length === 2 ? west[0]! : null
        if (!lone) {
          this.issues.push({ level: 'error', code: 'switch-ambiguous', message: `Cannot tell the stem of ${nodeId} from its geometry; add a switchOverrides entry` })
          continue
        }
        stem = lone
        const fork = arms.filter((a) => a !== stem)
        const stemV = this.armVector(stem)
        const straightness = (a: Arm) => {
          const v = this.armVector(a)
          const cos = (-(stemV.x * v.x + stemV.y * v.y)) / (Math.hypot(stemV.x, stemV.y) * Math.hypot(v.x, v.y) || 1)
          return cos
        }
        // Prefer a plain track over a connection (connections are the diverging legs), then the straighter arm.
        const rank = (a: Arm) => (this.edges.get(a.edge)!.kind === 'track' ? 10 : 0) + straightness(a)
        fork.sort((a, b) => rank(b) - rank(a))
        normal = fork[0]!
        reverse = fork[1]!
      }
      this.switches.set(nodeId, { nodeId, unit, stem, normal, reverse })
    }
  }

  /** Track circuit pieces on every edge. */
  private buildPieces(rcc: RccTable | null): void {
    const tcs = this.station.assets.trackCircuits
    for (const edge of this.edges.values()) {
      const list: TcPiece[] = []
      if (edge.kind === 'track') {
        const xa = edge.pts[0]!.x
        const xb = edge.pts[1]!.x
        const lo = Math.min(xa, xb)
        const hi = Math.max(xa, xb)
        for (const tc of tcs) {
          for (const span of tc.spans) {
            if (!('trackId' in span) || span.trackId !== edge.trackId) continue
            const a = Math.max(lo, span.x0)
            const b = Math.min(hi, span.x1)
            if (b - a <= EPS) continue
            const sa = (edge.length * (a - xa)) / (xb - xa)
            const sb = (edge.length * (b - xa)) / (xb - xa)
            list.push({ tc: tc.code, s0: Math.min(sa, sb), s1: Math.max(sa, sb) })
          }
        }
      }
      this.pieces.set(edge.id, list)
    }
    // Connections: spans named in the station data, else the point chart, else the circuits at both ends.
    const unitOfNode = new Map<string, string>()
    for (const u of this.units.values()) for (const m of u.machines) unitOfNode.set(m.nodeId, u.id)
    for (const conn of this.station.connections) {
      const edge = this.edges.get(`conn:${conn.id}`)
      if (!edge) continue
      const explicit = tcs.filter((tc) => tc.spans.some((s) => 'connectionId' in s && s.connectionId === conn.id)).map((tc) => tc.code)
      let codes = this.config.connectionTcs?.[conn.id] ?? explicit
      if (codes.length === 0) {
        const unit = unitOfNode.get(conn.from) ?? unitOfNode.get(conn.to)
        const chartTcs = unit ? this.units.get(unit)?.tcs ?? [] : []
        codes = chartTcs.length > 0 && rcc ? chartTcs : this.endpointTcs(edge)
      }
      this.pieces.set(edge.id, [...new Set(codes)].map((tc) => ({ tc, s0: 0, s1: edge.length })))
    }
  }

  private endpointTcs(edge: Edge): string[] {
    const found = new Set<string>()
    const first = edge.pts[0]!
    const last = edge.pts[edge.pts.length - 1]!
    for (const [nodeId, other] of [[edge.from, edge.pts[1]!], [edge.to, edge.pts[edge.pts.length - 2]!]] as const) {
      const here = this.nodePos.get(nodeId)!
      const toward = Math.sign(other.x - here.x) || (last.x >= first.x ? 1 : -1)
      for (const arm of this.armsAt.get(nodeId) ?? []) {
        const e = this.edges.get(arm.edge)!
        if (e.kind !== 'track') continue
        const xa = e.pts[0]!.x
        const xb = e.pts[1]!.x
        const x = here.x + toward * 0.01
        if (x < Math.min(xa, xb) || x > Math.max(xa, xb)) continue
        const s = (e.length * (x - xa)) / (xb - xa)
        for (const p of this.pieces.get(e.id) ?? []) if (s >= p.s0 - EPS && s <= p.s1 + EPS) found.add(p.tc)
        break
      }
    }
    return [...found]
  }

  private buildPosts(): void {
    for (const sig of this.station.assets.signals) {
      const loc = this.locateOnTrack(sig.trackId, sig.footX)
      if (!loc) {
        this.issues.push({ level: 'warn', code: 'signal-off-track', message: `Signal ${sig.code} (${sig.id}) cannot be placed on track ${sig.trackId} at x=${sig.footX}` })
        continue
      }
      const post: PostOnEdge = { signalId: sig.id, edge: loc.edge, s: loc.s, east: sig.headDir === 'east' }
      this.posts.set(sig.id, post)
      this.postsOnEdge.set(loc.edge, [...(this.postsOnEdge.get(loc.edge) ?? []), post])
    }
  }

  /* ----------------------------------- lookups ----------------------------------- */

  private edgesOfTrack(trackId: string): Edge[] {
    return [...this.edges.values()].filter((e) => e.trackId === trackId)
  }

  /** Edge and distance for a drawing-space x on a track. Falls back to the lines that continue the track. */
  locateOnTrack(trackId: string, x: number, depth = 0): { edge: string; s: number } | null {
    for (const e of this.edgesOfTrack(trackId)) {
      const xa = e.pts[0]!.x
      const xb = e.pts[1]!.x
      if (x >= Math.min(xa, xb) - EPS && x <= Math.max(xa, xb) + EPS) return { edge: e.id, s: (e.length * (x - xa)) / (xb - xa) }
    }
    if (depth >= 2) return null
    // The data sometimes puts a signal on a line that ends at a junction, with the post past the end (a siding that continues it).
    for (const e of this.edgesOfTrack(trackId)) {
      for (const node of [e.from, e.to]) {
        for (const arm of this.armsAt.get(node) ?? []) {
          const other = this.edges.get(arm.edge)!
          if (other.kind === 'track' && other.trackId && other.trackId !== trackId) {
            const hit = this.locateOnTrack(other.trackId, x, depth + 1)
            if (hit) return hit
          }
        }
      }
    }
    return null
  }

  pointOf(pos: PathPos): Point {
    const e = this.edges.get(pos.edge)!
    return this.pointAt(e, pos.s)
  }

  pointAt(e: Edge, s: number): Point {
    let remaining = Math.max(0, Math.min(e.length, s))
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1]!
      const b = e.pts[i]!
      const d = dist(a, b)
      if (remaining <= d || i === e.pts.length - 1) {
        const t = d > 0 ? Math.min(1, remaining / d) : 0
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      }
      remaining -= d
    }
    return e.pts[e.pts.length - 1]!
  }

  /** The polyline of an edge between two distances, in drawing space. */
  slice(e: Edge, sa: number, sb: number): Point[] {
    const lo = Math.max(0, Math.min(sa, sb))
    const hi = Math.min(e.length, Math.max(sa, sb))
    const out: Point[] = [this.pointAt(e, lo)]
    let acc = 0
    for (let i = 1; i < e.pts.length; i++) {
      acc += dist(e.pts[i - 1]!, e.pts[i]!)
      if (acc > lo + EPS && acc < hi - EPS) out.push(e.pts[i]!)
    }
    out.push(this.pointAt(e, hi))
    return sa <= sb ? out : out.reverse()
  }

  /** Circuit that a signal's approach lies in: the one just behind the post as seen by the driver. */
  standingTc(signalId: string): string | null {
    const post = this.posts.get(signalId)
    if (!post) return null
    const e = this.edges.get(post.edge)!
    const dir = (post.east ? 1 : -1) * e.xDir // +1 when travel runs from start to end
    const probe = post.s - dir * 0.01
    for (const p of this.pieces.get(post.edge) ?? []) if (probe >= p.s0 - EPS && probe <= p.s1 + EPS) return p.tc
    return null
  }

  /* ----------------------------------- movement ----------------------------------- */

  private exitFrom(arm: Arm): PathPos {
    const e = this.edges.get(arm.edge)!
    return arm.end === 'start' ? { edge: arm.edge, s: 0, dir: 1 } : { edge: arm.edge, s: e.length, dir: -1 }
  }

  /** Where a train arriving at `node` along `arrival` goes next, given the points. */
  private through(node: string, arrival: Arm, unitPos: UnitPosition): PathPos | Stop {
    const arms = this.armsAt.get(node) ?? []
    if (arms.length === 1) return { kind: 'end', node, buffer: this.bufferNodes.has(node) }
    if (arms.length === 2) {
      const other = arms.find((a) => !(a.edge === arrival.edge && a.end === arrival.end))
      return other ? this.exitFrom(other) : { kind: 'end', node, buffer: false }
    }
    const sw = this.switches.get(node)
    if (!sw) return { kind: 'blocked', node, reason: 'unsupported', unit: null }
    const pos = sw.unit ? unitPos(sw.unit) : 'N'
    if (pos === 'moving') return { kind: 'blocked', node, reason: 'moving', unit: sw.unit }
    const same = (a: Arm, b: Arm) => a.edge === b.edge && a.end === b.end
    if (same(arrival, sw.stem)) return this.exitFrom(pos === 'N' ? sw.normal : sw.reverse)
    if (same(arrival, sw.normal)) return pos === 'N' ? this.exitFrom(sw.stem) : { kind: 'blocked', node, reason: 'misaligned', unit: sw.unit }
    if (same(arrival, sw.reverse)) return pos === 'R' ? this.exitFrom(sw.stem) : { kind: 'blocked', node, reason: 'misaligned', unit: sw.unit }
    return { kind: 'blocked', node, reason: 'unsupported', unit: sw.unit }
  }

  /** Move `distance` along the path the points currently set. Returns the legs covered and why it stopped, if it did. */
  advance(start: PathPos, distance: number, unitPos: UnitPosition): { pos: PathPos; legs: Leg[]; stop: Stop | null; moved: number } {
    let pos = { ...start }
    const legs: Leg[] = []
    let remaining = distance
    let moved = 0
    for (let guard = 0; guard < 200 && remaining > EPS; guard++) {
      const e = this.edges.get(pos.edge)!
      const toEnd = pos.dir > 0 ? e.length - pos.s : pos.s
      if (remaining <= toEnd + EPS) {
        const s1 = pos.s + pos.dir * Math.min(remaining, toEnd)
        legs.push({ edge: pos.edge, s0: pos.s, s1 })
        moved += Math.min(remaining, toEnd)
        pos = { ...pos, s: s1 }
        remaining = 0
        break
      }
      const endS = pos.dir > 0 ? e.length : 0
      if (Math.abs(endS - pos.s) > EPS) legs.push({ edge: pos.edge, s0: pos.s, s1: endS })
      moved += toEnd
      remaining -= toEnd
      const node = pos.dir > 0 ? e.to : e.from
      const arrival: Arm = { edge: pos.edge, end: pos.dir > 0 ? 'end' : 'start' }
      const next = this.through(node, arrival, unitPos)
      if ('kind' in next) return { pos: { ...pos, s: endS }, legs, stop: next, moved }
      pos = next
    }
    return { pos, legs, stop: null, moved }
  }

  /** Is the movement along this edge towards the east? */
  travelsEast(pos: PathPos): boolean {
    return pos.dir * this.edges.get(pos.edge)!.xDir > 0
  }
}
