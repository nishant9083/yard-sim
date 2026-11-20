import { polylineYAt } from '@/sip/layout/geometry'
import { shapeCentre, type Point, type Shape, type Station, type Track, type TrackNode } from '@/sip/model'

/**
 * Straighten a station: every line becomes a horizontal lane, turnouts and crossovers become short diagonals.
 *
 * Only y changes. Every x is kept, so chainages, joints, signal feet, track-circuit spans and points stay exactly where
 * the SIP puts them along the line. What is preserved is the topology and the top-to-bottom order of lines: wherever two
 * lines run side by side on the sheet, the upper one stays above the lower one.
 *
 * Steps
 *  1. Tracks that continue end to end (one ends where the next begins, roughly collinear) are grouped into one line.
 *  2. Walking along x, the vertical order of lines is sampled; "A is above B" votes give a directed graph.
 *     Conflicting votes are real crossings on the sheet and are reported; the majority wins.
 *  3. Each line gets a lane: lowest lane that respects every "above" edge, then pulled towards the lines it branches
 *     from / to so diagonals stay short.
 *  4. Nodes take their line's lane y. A branch that ends on another line gets a bend: a diagonal from the junction to
 *     its own lane, with a fixed slope. Pure shape vertices (plain nodes nobody references) are dropped.
 *  5. Free-standing things (labels, text, buildings) move with the line they sit beside.
 */

export interface StraightenOptions {
  /** Distance between lanes (drawing points). `auto` uses the typical spacing of parallel lines on the sheet. */
  laneSpacing?: number | 'auto'
  /** Horizontal run of a turnout diagonal per unit of vertical drop. */
  turnoutRun?: number
  /** Sampling step along x when reading the order of lines. */
  sampleStep?: number
  /** Lines closer than this (vertically) at a sample are treated as merging and not ordered. */
  minSeparation?: number
}

export interface StraightenReport {
  laneSpacing: number
  lanes: number
  /** Lines (groups of tracks joined end to end), top lane first. */
  lines: { lane: number; trackIds: string[] }[]
  /** Pairs of lines whose order flips along x on the original sheet (real crossings, or extraction noise). */
  orderConflicts: { above: string; below: string; votes: number; against: number }[]
  /** Proper intersections between drawn segments (tracks and connections) not at a shared node. */
  crossingsBefore: number
  crossingsAfter: number
  nodesRemoved: number
  nodesAdded: number
}

const DEFAULTS = { turnoutRun: 4, sampleStep: 8, minSeparation: 4 }

type End = 'west' | 'east'

interface TrackGeom {
  track: Track
  pts: TrackNode[]
  x0: number
  x1: number
}

export function straightenStation(station: Station, options: StraightenOptions = {}): { station: Station; report: StraightenReport } {
  const opt = { ...DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) } as typeof DEFAULTS
  const nodeById = new Map(station.nodes.map((n) => [n.id, n]))

  // ---- original geometry ---------------------------------------------------------------------------------------
  const geoms: TrackGeom[] = station.tracks.flatMap((track) => {
    const pts = track.nodeIds.flatMap((id) => nodeById.get(id) ?? [])
    if (pts.length < 2) return []
    if (pts[pts.length - 1]!.x < pts[0]!.x) pts.reverse()
    return [{ track, pts, x0: pts[0]!.x, x1: pts[pts.length - 1]!.x }]
  })
  const geomById = new Map(geoms.map((g) => [g.track.id, g]))
  const origY = (trackId: string, x: number) => polylineYAt(geomById.get(trackId)?.pts ?? [], x)

  /** Track ends at each node, and whether a track passes through it. */
  const endsAt = new Map<string, { trackId: string; end: End }[]>()
  const throughAt = new Map<string, string>()
  for (const g of geoms) {
    g.pts.forEach((n, i) => {
      if (i === 0 || i === g.pts.length - 1) {
        const list = endsAt.get(n.id) ?? []
        list.push({ trackId: g.track.id, end: i === 0 ? 'west' : 'east' })
        endsAt.set(n.id, list)
      } else if (!throughAt.has(n.id)) throughAt.set(n.id, g.track.id)
    })
  }

  // ---- 1. lines: tracks joined end to end ----------------------------------------------------------------------
  const parent = new Map(geoms.map((g) => [g.track.id, g.track.id]))
  const find = (id: string): string => {
    let r = id
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(id, r)
    return r
  }
  /** Direction of a track leaving one of its ends, looking ~60 pt along it. */
  const slopeAt = (g: TrackGeom, end: End): number => {
    const a = end === 'west' ? g.pts[0]! : g.pts[g.pts.length - 1]!
    const target = end === 'west' ? Math.min(a.x + 60, g.x1) : Math.max(a.x - 60, g.x0)
    const y = polylineYAt(g.pts, target) ?? a.y
    return target === a.x ? 0 : (y - a.y) / Math.abs(target - a.x)
  }
  for (const [nodeId, ends] of endsAt) {
    if (throughAt.has(nodeId)) continue // a branch ending on a running line, not a continuation
    const fromWest = ends.filter((e) => e.end === 'east')
    const toEast = ends.filter((e) => e.end === 'west')
    const pairs = fromWest.flatMap((a) =>
      toEast.map((b) => {
        // Collinear when the incoming slope (west to east) matches the outgoing one.
        const sa = -slopeAt(geomById.get(a.trackId)!, 'east')
        const sb = slopeAt(geomById.get(b.trackId)!, 'west')
        return { a: a.trackId, b: b.trackId, cost: Math.abs(Math.atan(sa) - Math.atan(sb)) }
      }),
    )
    pairs.sort((p, q) => p.cost - q.cost)
    const used = new Set<string>()
    for (const p of pairs) {
      if (used.has(p.a) || used.has(p.b)) continue
      used.add(p.a)
      used.add(p.b)
      parent.set(find(p.b), find(p.a))
    }
  }
  const lineOf = (trackId: string) => find(trackId)
  const lineTracks = new Map<string, string[]>()
  for (const g of geoms) lineTracks.set(lineOf(g.track.id), [...(lineTracks.get(lineOf(g.track.id)) ?? []), g.track.id])
  const lineIds = [...lineTracks.keys()]

  // ---- 2. vertical order of lines ------------------------------------------------------------------------------
  const votes = new Map<string, number>() // "a|b" -> samples where line a is directly above line b
  const gaps: number[] = []
  const minX = Math.min(...geoms.map((g) => g.x0))
  const maxX = Math.max(...geoms.map((g) => g.x1))
  for (let x = minX; x <= maxX; x += opt.sampleStep) {
    const here = geoms
      .filter((g) => x >= g.x0 && x <= g.x1)
      .map((g) => ({ line: lineOf(g.track.id), y: polylineYAt(g.pts, x)! }))
      .sort((a, b) => a.y - b.y)
    for (let i = 0; i < here.length; i++) {
      // Next lines that are clearly below this one (skip lines merging into it at a junction).
      const j = here.findIndex((h, k) => k > i && h.y - here[i]!.y >= opt.minSeparation)
      if (j < 0) continue
      if (here[j - 1]!.line === here[i]!.line || j === i + 1) gaps.push(here[j]!.y - here[i]!.y)
      for (let k = j; k < here.length && here[k]!.y < here[j]!.y + opt.minSeparation; k++) {
        const a = here[i]!.line
        const b = here[k]!.line
        if (a === b) continue
        votes.set(`${a}|${b}`, (votes.get(`${a}|${b}`) ?? 0) + 1)
      }
    }
  }
  const above = new Map<string, Map<string, number>>(lineIds.map((l) => [l, new Map()]))
  const orderConflicts: StraightenReport['orderConflicts'] = []
  for (const [key, n] of votes) {
    const [a, b] = key.split('|') as [string, string]
    const against = votes.get(`${b}|${a}`) ?? 0
    if (n > against || (n === against && a < b)) {
      above.get(a)!.set(b, n)
      if (against > 0) orderConflicts.push({ above: a, below: b, votes: n, against })
    }
  }
  breakCycles(above)

  // ---- 3. lanes --------------------------------------------------------------------------------------------------
  const lane = new Map<string, number>()
  const preds = new Map<string, string[]>(lineIds.map((l) => [l, []]))
  for (const [a, bs] of above) for (const b of bs.keys()) preds.get(b)!.push(a)
  const order = topoOrder(lineIds, above)
  for (const l of order) lane.set(l, Math.max(0, ...preds.get(l)!.map((p) => lane.get(p)! + 1)))
  const laneCount = Math.max(0, ...lane.values()) + 1

  // Lines each line is attached to (branches, crossovers): pull towards them so diagonals stay short.
  const attached = new Map<string, Set<string>>(lineIds.map((l) => [l, new Set()]))
  const link = (a: string, b: string) => {
    if (a === b) return
    attached.get(a)!.add(b)
    attached.get(b)!.add(a)
  }
  for (const [nodeId, ends] of endsAt) {
    const through = throughAt.get(nodeId)
    const all = [...ends.map((e) => lineOf(e.trackId)), ...(through ? [lineOf(through)] : [])]
    for (const a of all) for (const b of all) link(a, b)
  }
  const lineOfNode = (id: string) => {
    const t = throughAt.get(id) ?? endsAt.get(id)?.[0]?.trackId
    return t ? lineOf(t) : null
  }
  for (const c of station.connections) {
    const a = lineOfNode(c.from)
    const b = lineOfNode(c.to)
    if (a && b) link(a, b)
  }
  for (let pass = 0; pass < 30; pass++) {
    let moved = false
    for (const l of pass % 2 ? [...order].reverse() : order) {
      const lo = Math.max(0, ...preds.get(l)!.map((p) => lane.get(p)! + 1))
      const hi = Math.min(laneCount - 1, ...[...above.get(l)!.keys()].map((s) => lane.get(s)! - 1))
      const near = [...attached.get(l)!].map((o) => lane.get(o)!).sort((a, b) => a - b)
      if (!near.length) continue
      const want = near[Math.floor((near.length - 1) / 2)]!
      const next = Math.max(lo, Math.min(hi, want))
      if (next !== lane.get(l)) {
        lane.set(l, next)
        moved = true
      }
    }
    if (!moved) break
  }

  const sortedGaps = gaps.sort((a, b) => a - b)
  const typicalGap = sortedGaps[Math.floor(sortedGaps.length * 0.4)] ?? 30
  const laneSpacing =
    typeof options.laneSpacing === 'number' ? options.laneSpacing : Math.round(Math.max(20, Math.min(45, typicalGap)))
  const topY = Math.min(...station.nodes.map((n) => n.y))
  const laneY = (line: string) => topY + lane.get(line)! * laneSpacing

  // ---- 4. nodes and tracks ---------------------------------------------------------------------------------------
  const referenced = new Set<string>()
  for (const c of station.connections) referenced.add(c.from).add(c.to)
  for (const p of station.assets.points) referenced.add(p.nodeId)
  for (const [id, ends] of endsAt) if (ends.length > 1 || throughAt.has(id)) referenced.add(id)

  const newY = new Map<string, number>()
  for (const n of station.nodes) {
    const through = throughAt.get(n.id)
    if (through) {
      newY.set(n.id, laneY(lineOf(through)))
      continue
    }
    const ends = endsAt.get(n.id)
    if (!ends?.length) {
      newY.set(n.id, n.y)
      continue
    }
    // Where tracks meet end to end, the joined pair (or the longest track) decides.
    const lines = ends.map((e) => lineOf(e.trackId))
    const shared = lines.find((l, i) => lines.indexOf(l) !== i)
    const longest = [...ends].sort((a, b) => extent(geomById.get(b.trackId)!) - extent(geomById.get(a.trackId)!))[0]!
    newY.set(n.id, laneY(shared ?? lineOf(longest.trackId)))
  }

  const outNodes = new Map<string, TrackNode>()
  const keepNode = (n: TrackNode, y: number) => outNodes.set(n.id, { ...n, y })
  let added = 0
  /** Every bend placed: the junction end, the new vertex, and the x range the bend may slide within. */
  const bends: { end: TrackNode; endY: number; node: TrackNode; dy: number; dir: 1 | -1; room: number }[] = []
  const newId = (() => {
    let i = 0
    return () => {
      let id: string
      do id = `S${String(++i).padStart(4, '0')}`
      while (nodeById.has(id))
      return id
    }
  })()

  const outTracks: Track[] = station.tracks.map((track) => {
    const g = geomById.get(track.id)
    if (!g) return track
    const y = laneY(lineOf(track.id))
    const reversed = g.pts[0]!.id !== track.nodeIds[0]
    // Kept vertices west to east: both ends and every node something else hangs on.
    const kept = g.pts.filter((n, i) => i === 0 || i === g.pts.length - 1 || referenced.has(n.id))
    const out: { n: TrackNode; y: number }[] = kept.map((n) => ({ n, y: newY.get(n.id)! }))
    for (const k of out) if (!outNodes.has(k.n.id)) keepNode(k.n, k.y)

    // Bends where an end sits off this line's lane.
    const withBends: { n: TrackNode; y: number }[] = [...out]
    const bend = (endIdx: 0 | -1) => {
      const end = endIdx === 0 ? withBends[0]! : withBends[withBends.length - 1]!
      const dy = Math.abs(end.y - y)
      if (dy < 0.01) return
      const inner = endIdx === 0 ? withBends[1] : withBends[withBends.length - 2]
      if (!inner) return
      // The next kept vertex is itself off the lane (both ends bend): share the room between the two diagonals.
      const room = Math.abs(inner.n.x - end.n.x) * (Math.abs(inner.y - y) > 0.01 ? 0.5 : 1)
      const run = Math.min(dy * opt.turnoutRun, room)
      if (run >= Math.abs(inner.n.x - end.n.x) - 0.01) return // straight diagonal to the next vertex
      const x = end.n.x + (endIdx === 0 ? run : -run)
      const node: TrackNode = { id: newId(), kind: 'plain', x: round(x), y }
      added++
      outNodes.set(node.id, node)
      bends.push({ end: end.n, endY: end.y, node, dy, dir: endIdx === 0 ? 1 : -1, room })
      if (endIdx === 0) withBends.splice(1, 0, { n: node, y })
      else withBends.splice(withBends.length - 1, 0, { n: node, y })
    }
    bend(0)
    bend(-1)
    const ids = withBends.map((k) => k.n.id)
    return { ...track, nodeIds: reversed ? ids.reverse() : ids }
  })
  // Nodes that belong to no track (should be none) keep their position.
  for (const n of station.nodes) if (!outNodes.has(n.id) && !geoms.some((g) => g.pts.includes(n))) keepNode(n, n.y)
  for (const n of outNodes.values()) n.y = round(n.y)

  // A diagonal that cuts another line was drawn too long (or too short): slide its bend until it is clear.
  if (bends.length) {
    const draft = { ...station, nodes: [...outNodes.values()], tracks: outTracks, connections: station.connections.map(({ via: _v, ...c }) => c) }
    const draftNodes = () => new Map([...outNodes.values()].map((n) => [n.id, n]))
    const factors = [opt.turnoutRun, 3, 2, 5, 1.5, 6, 1, 8, 0.75, 12, 0.5, 0.3]
    for (let pass = 0; pass < 3; pass++) {
      let changed = false
      for (const b of bends) {
        const others = segments(draft, draftNodes()).filter((s) => s.a.id !== b.node.id && s.b.id !== b.node.id)
        const hits = (x: number) => {
          const d = { a: { x: b.end.x, y: b.endY }, b: { x, y: b.node.y } }
          return others.filter((s) => s.a.id !== b.end.id && s.b.id !== b.end.id && crosses(d, s)).length
        }
        const current = hits(b.node.x)
        if (current === 0) continue
        let best = { x: b.node.x, n: current }
        for (const f of factors) {
          const run = Math.min(b.dy * f, b.room * 0.98)
          const x = round(b.end.x + b.dir * run)
          const n = hits(x)
          if (n < best.n) best = { x, n }
          if (n === 0) break
        }
        if (best.x !== b.node.x) {
          b.node.x = best.x
          changed = true
        }
      }
      if (!changed) break
    }
  }

  const nodesOut = station.nodes.flatMap((n) => outNodes.get(n.id) ?? []).concat([...outNodes.values()].filter((n) => !nodeById.has(n.id)))
  const outNodeById = new Map(nodesOut.map((n) => [n.id, n]))
  const outTrackPts = new Map(
    outTracks.map((t) => {
      const pts = t.nodeIds.map((id) => outNodeById.get(id)!).filter(Boolean)
      if (pts.length > 1 && pts[pts.length - 1]!.x < pts[0]!.x) pts.reverse()
      return [t.id, pts]
    }),
  )
  const straightY = (trackId: string, x: number) => polylineYAt(outTrackPts.get(trackId) ?? [], x)

  const connections = station.connections.map(({ via: _via, ...c }) => c)
  const connPts = (id: string): Point[] => {
    const c = connections.find((c) => c.id === id)
    const a = c && outNodeById.get(c.from)
    const b = c && outNodeById.get(c.to)
    return a && b ? (a.x <= b.x ? [a, b] : [b, a]) : []
  }

  // ---- 5. everything placed by absolute position -----------------------------------------------------------------
  /** How far a line moved at x. */
  const shift = (trackId: string, x: number) => {
    const a = origY(trackId, x)
    const b = straightY(trackId, x)
    return a === null || b === null ? 0 : b - a
  }
  /** New y for a free-standing point: kept between the same two lines, or at the same offset from the nearest one. */
  const mapY = (p: Point): number => {
    const here = geoms
      .filter((g) => p.x >= g.x0 - 1 && p.x <= g.x1 + 1)
      .map((g) => ({ id: g.track.id, y0: polylineYAt(g.pts, p.x)!, y1: straightY(g.track.id, p.x)! }))
    if (!here.length) {
      // Off the end of every line: move with the nearest line end.
      const nearest = [...geoms].sort((a, b) => distX(a, p.x) - distX(b, p.x))[0]
      return nearest ? p.y + shift(nearest.track.id, Math.max(nearest.x0, Math.min(nearest.x1, p.x))) : p.y
    }
    const up = here.filter((h) => h.y0 <= p.y).sort((a, b) => b.y0 - a.y0)[0]
    const down = here.filter((h) => h.y0 > p.y).sort((a, b) => a.y0 - b.y0)[0]
    if (up && down && down.y0 - up.y0 > 1 && down.y1 > up.y1) {
      const t = (p.y - up.y0) / (down.y0 - up.y0)
      // Labels hug a line: keep the absolute offset from the closer line, but never leave the gap.
      const fromUp = up.y1 + (p.y - up.y0)
      const fromDown = down.y1 - (down.y0 - p.y)
      const y = t < 0.5 ? fromUp : fromDown
      const lo = up.y1 + 2
      const hi = down.y1 - 2
      return hi > lo ? Math.max(lo, Math.min(hi, y)) : up.y1 + t * (down.y1 - up.y1)
    }
    const near = up ?? down!
    return near.y1 + (p.y - near.y0)
  }
  const movePoint = <P extends Point>(p: P, dy = mapY(p) - p.y): P => ({ ...p, y: round(p.y + dy) })
  const moveShape = (s: Shape, dy: number): Shape =>
    s.type === 'rect'
      ? { ...s, y0: round(s.y0 + dy), y1: round(s.y1 + dy) }
      : { ...s, points: s.points.map((q) => ({ ...q, y: round(q.y + dy) })) }

  const a = station.assets
  const nodeShift = (id: string) => (outNodeById.get(id)?.y ?? 0) - (nodeById.get(id)?.y ?? 0)
  const assets = {
    ...a,
    signals: a.signals.map((s) => (s.label ? { ...s, label: movePoint(s.label, shift(s.trackId, s.footX)) } : s)),
    points: a.points.map((p) => ({ ...p, label: movePoint(p.label, nodeShift(p.nodeId)) })),
    trackCircuits: a.trackCircuits.map((tc) => {
      const span = tc.spans.find((s) => 'trackId' in s && tc.label.x >= Math.min(s.x0, s.x1) - 1 && tc.label.x <= Math.max(s.x0, s.x1) + 1)
      return { ...tc, label: span && 'trackId' in span ? movePoint(tc.label, shift(span.trackId, tc.label.x)) : movePoint(tc.label) }
    }),
    structures: a.structures.map((s) => {
      const anchor = s.foot ?? s.at
      const centre = s.shape ? shapeCentre(s.shape) : s.label
      const dy = centre ? (anchor && !s.shape ? shift(anchor.trackId, anchor.x) : mapY(centre) - centre.y) : 0
      return { ...s, ...(s.shape && { shape: moveShape(s.shape, dy) }), ...(s.label && { label: movePoint(s.label, dy) }) }
    }),
    platforms: a.platforms.map((p) => {
      const dy = mapY(p.label) - p.label.y
      return { ...p, polygon: p.polygon.map((q) => movePoint(q, dy)), label: movePoint(p.label, dy) }
    }),
    dimensions: a.dimensions.map((d) =>
      d.kind === 'vertical'
        ? { ...d, y0: round(mapY({ x: d.x, y: d.y0 })), y1: round(mapY({ x: d.x, y: d.y1 })), ...(d.label && { label: movePoint(d.label) }) }
        : { ...d, y: round(mapY({ x: d.x0, y: d.y })), label: movePoint(d.label) },
    ),
    routeLabels: a.routeLabels.map((t) => movePoint(t)),
    annotations: a.annotations.map((t) => movePoint(t)),
    ...(a.connectionJoints && {
      connectionJoints: a.connectionJoints.map((j) => ({ ...j, y: round(polylineYAt(connPts(j.connectionId), j.x) ?? j.y) })),
    }),
  }

  const { sheet: _sheet, ...meta } = station.meta
  const out: Station = {
    ...station,
    meta: {
      ...meta,
      code: `${station.meta.code}-S`,
      name: `${station.meta.name} (straight)`,
      coordinateSpace: `${station.meta.coordinateSpace}; straightened schematic: x as on the sheet, every line on its own horizontal lane (${laneSpacing} pt apart)`,
    },
    nodes: nodesOut,
    tracks: outTracks,
    connections,
    assets,
  }

  const segsBefore = segments(station, nodeById)
  const segsAfter = segments(out, outNodeById)
  const report: StraightenReport = {
    laneSpacing,
    lanes: Math.max(0, ...lane.values()) + 1,
    lines: [...lineTracks.entries()].map(([l, ids]) => ({ lane: lane.get(l)!, trackIds: ids })).sort((p, q) => p.lane - q.lane),
    orderConflicts,
    crossingsBefore: countCrossings(segsBefore),
    crossingsAfter: countCrossings(segsAfter),
    nodesRemoved: station.nodes.length - (nodesOut.length - added),
    nodesAdded: added,
  }
  return { station: out, report }
}

const round = (v: number) => Math.round(v * 100) / 100
const extent = (g: TrackGeom) => g.x1 - g.x0
const distX = (g: TrackGeom, x: number) => (x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0)

/** Drop the weakest edge of each cycle until the "above" graph is acyclic. */
function breakCycles(graph: Map<string, Map<string, number>>): void {
  for (;;) {
    const cycle = findCycle(graph)
    if (!cycle) return
    let weakest = 0
    for (let i = 1; i < cycle.length; i++) {
      const w = graph.get(cycle[i]!)!.get(cycle[(i + 1) % cycle.length]!)!
      if (w < graph.get(cycle[weakest]!)!.get(cycle[(weakest + 1) % cycle.length]!)!) weakest = i
    }
    graph.get(cycle[weakest]!)!.delete(cycle[(weakest + 1) % cycle.length]!)
  }
}

function findCycle(graph: Map<string, Map<string, number>>): string[] | null {
  const state = new Map<string, 1 | 2>()
  const stack: string[] = []
  const visit = (v: string): string[] | null => {
    state.set(v, 1)
    stack.push(v)
    for (const w of graph.get(v)!.keys()) {
      if (state.get(w) === 1) return stack.slice(stack.indexOf(w))
      if (!state.has(w)) {
        const c = visit(w)
        if (c) return c
      }
    }
    stack.pop()
    state.set(v, 2)
    return null
  }
  for (const v of graph.keys()) {
    if (state.has(v)) continue
    const c = visit(v)
    if (c) return c
  }
  return null
}

function topoOrder(ids: string[], graph: Map<string, Map<string, number>>): string[] {
  const indeg = new Map(ids.map((i) => [i, 0]))
  for (const bs of graph.values()) for (const b of bs.keys()) indeg.set(b, indeg.get(b)! + 1)
  const queue = ids.filter((i) => indeg.get(i) === 0)
  const out: string[] = []
  while (queue.length) {
    const v = queue.shift()!
    out.push(v)
    for (const w of graph.get(v)!.keys()) {
      indeg.set(w, indeg.get(w)! - 1)
      if (indeg.get(w) === 0) queue.push(w)
    }
  }
  return out
}

type Seg = { a: Point & { id?: string }; b: Point & { id?: string } }

function segments(s: Station, nodes: Map<string, TrackNode>): Seg[] {
  const segs: Seg[] = []
  for (const t of s.tracks)
    for (let i = 1; i < t.nodeIds.length; i++) {
      const a = nodes.get(t.nodeIds[i - 1]!)
      const b = nodes.get(t.nodeIds[i]!)
      if (a && b) segs.push({ a, b })
    }
  for (const c of s.connections) {
    const a = nodes.get(c.from)
    const b = nodes.get(c.to)
    if (!a || !b) continue
    const pts: Point[] = [a, ...(c.via ?? []), b]
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1]!, b: pts[i]! })
  }
  return segs
}

const orient = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)

/** Strict crossing: touching at a shared node or an end point does not count. */
function crosses(s: Seg, t: Seg): boolean {
  return orient(t.a, t.b, s.a) * orient(t.a, t.b, s.b) < -1e-6 && orient(s.a, s.b, t.a) * orient(s.a, s.b, t.b) < -1e-6
}

function countCrossings(segs: Seg[]): number {
  const sorted = segs.map((s) => ({ ...s, lo: Math.min(s.a.x, s.b.x), hi: Math.max(s.a.x, s.b.x) })).sort((p, q) => p.lo - q.lo)
  let n = 0
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!
    for (let j = i + 1; j < sorted.length && sorted[j]!.lo <= s.hi; j++) if (crosses(s, sorted[j]!)) n++
  }
  return n
}
