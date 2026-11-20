import {
  chainageAt,
  isTrackEnd,
  shapeCentre,
  type Bridge,
  type LineArrow,
  type LineArrowDirection,
  type Shape,
  type EntityRef,
  type EntityType,
  type NodeKind,
  type Point,
  type Station,
  type StationAssets,
  type Structure,
  type StructureKind,
  type Track,
  type TrackCircuit,
  type TrackNode,
  signalAnchorX,
} from '@/sip/model'
import { distanceToSegment } from '@/sip/layout'
import {
  circuitCode,
  circuitCovers,
  circuitLimits,
  newPoint,
  nextLineNumber,
  nextPointNumber,
  nextSignalNumber,
  signalOrientation,
  trackNameFor,
  trackSections,
  trackXRange,
  trackYAt,
  verticalMetresPerUnit,
} from './autogen'
import { presetById, STRUCTURE_NAMES, STRUCTURE_SIZE } from './catalog'
import { idSafe, nextId, uniqueId } from './ids'
import { closestOnSegment } from './snap'

/**
 * Every edit is a pure function Station -> Station, so undo is just keeping the old value.
 * Functions that create something return the new station and a ref to select.
 */
export interface OpResult {
  station: Station
  ref?: EntityRef
}

export type Anchor = { nodeId: string } | { trackId: string; p: Point } | { p: Point }

const round2 = (n: number) => Math.round(n * 100) / 100
const withAssets = (s: Station, patch: Partial<StationAssets>): Station => ({ ...s, assets: { ...s.assets, ...patch } })
const nodeIds = (s: Station) => s.nodes.map((n) => n.id)
/** A vertex closer than this (drawing units) to a click is reused instead of creating a new one. */
const REUSE_DISTANCE = 0.75

// --- nodes and tracks ------------------------------------------------------------------------

/** Insert a vertex into the track nearest to `p` (or reuse an existing vertex there). */
export function splitTrackAt(s: Station, trackId: string, p: Point, kind: NodeKind = 'junction'): { station: Station; nodeId: string } | null {
  const track = s.tracks.find((t) => t.id === trackId)
  if (!track) return null
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  let best: { i: number; d: number } | null = null
  for (let i = 1; i < track.nodeIds.length; i++) {
    const a = byId.get(track.nodeIds[i - 1]!)
    const b = byId.get(track.nodeIds[i]!)
    if (!a || !b) continue
    const d = distanceToSegment(p, a, b)
    if (!best || d < best.d) best = { i, d }
  }
  if (!best) return null
  const a = byId.get(track.nodeIds[best.i - 1]!)!
  const b = byId.get(track.nodeIds[best.i]!)!
  const q = closestOnSegment(p, a, b)
  for (const n of [a, b]) if (Math.hypot(n.x - q.x, n.y - q.y) < REUSE_DISTANCE) return { station: s, nodeId: n.id }

  const node: TrackNode = { id: nextId('N', nodeIds(s), 3), x: round2(q.x), y: round2(q.y), kind }
  const ids = [...track.nodeIds]
  ids.splice(best.i, 0, node.id)
  return { station: { ...s, nodes: [...s.nodes, node], tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, nodeIds: ids } : t)) }, nodeId: node.id }
}

function resolveAnchor(s: Station, a: Anchor): { station: Station; nodeId: string } | null {
  if ('nodeId' in a) return { station: s, nodeId: a.nodeId }
  if ('trackId' in a) return splitTrackAt(s, a.trackId, a.p)
  const node: TrackNode = { id: nextId('N', nodeIds(s), 3), x: round2(a.p.x), y: round2(a.p.y), kind: 'plain' }
  return { station: { ...s, nodes: [...s.nodes, node] }, nodeId: node.id }
}

/** Nodes shared by tracks or used by connections become junctions. */
export function fixNodeKinds(s: Station): Station {
  const trackCount = new Map<string, number>()
  for (const t of s.tracks) for (const id of new Set(t.nodeIds)) trackCount.set(id, (trackCount.get(id) ?? 0) + 1)
  const linked = new Set(s.connections.flatMap((c) => [c.from, c.to]))
  let changed = false
  const nodes = s.nodes.map((n): TrackNode => {
    const shared = (trackCount.get(n.id) ?? 0) >= 2
    const hasLink = linked.has(n.id)
    const next: NodeKind = n.kind === 'plain' && (shared || hasLink) ? 'junction' : isTrackEnd(n.kind) && shared ? 'junction' : n.kind
    if (next === n.kind) return n
    changed = true
    return { ...n, kind: next }
  })
  return changed ? { ...s, nodes } : s
}

export interface TrackSpec {
  kind: Track['kind']
  direction: Track['direction']
}

export type TrackPropertyKey = 'name' | 'kind' | 'direction' | 'lineNo' | 'remarks'
export type TrackPropertyChoices = Record<TrackPropertyKey, 'a' | 'b'>

/** Split a line at a point on one of its segments. */
export function splitTrack(s: Station, trackId: string, p: Point): OpResult {
  const track = s.tracks.find((t) => t.id === trackId)
  if (!track) return { station: s }
  const split = splitTrackAt(s, trackId, p, 'plain')
  if (!split) return { station: s }
  const updatedTrack = split.station.tracks.find((t) => t.id === trackId)!
  const index = updatedTrack.nodeIds.indexOf(split.nodeId)
  if (index <= 0 || index >= updatedTrack.nodeIds.length - 1) return { station: s }

  const leftIds = updatedTrack.nodeIds.slice(0, index + 1)
  const rightIds = updatedTrack.nodeIds.slice(index)
  const newId = nextId('T', s.tracks.map((t) => t.id), 2)
  const right: Track = { ...track, id: newId, name: `${track.name} (2)`, nodeIds: rightIds }
  const left: Track = { ...track, nodeIds: leftIds }
  let next: Station = fixNodeKinds({
    ...split.station,
    tracks: split.station.tracks.map((t) => (t.id === trackId ? left : t)).concat(right),
  })

  const splitX = split.station.nodes.find((n) => n.id === split.nodeId)!.x
  next = withAssets(next, {
    signals: next.assets.signals.map((x) => (x.trackId === trackId && x.footX > splitX ? { ...x, trackId: newId } : x)),
    joints: next.assets.joints.map((x) => (x.trackId === trackId && x.x > splitX ? { ...x, trackId: newId } : x)),
    lineArrows: next.assets.lineArrows.map((x) => (x.trackId === trackId && x.x > splitX ? { ...x, trackId: newId } : x)),
    trackCircuits: next.assets.trackCircuits.map((tc) => ({
      ...tc,
      spans: tc.spans.flatMap((span) => {
        if (!('trackId' in span) || span.trackId !== trackId) return [span]
        if (span.x1 <= splitX) return [span]
        if (span.x0 >= splitX) return [{ ...span, trackId: newId }]
        return [
          { trackId, x0: span.x0, x1: splitX },
          { trackId: newId, x0: splitX, x1: span.x1 },
        ]
      }),
    })),
  })
  return { station: next, ref: { type: 'node', id: split.nodeId } }
}

/** Merge two end-to-end lines. Only adjacent endpoint pairs are accepted. */
export function mergeTracks(s: Station, aId: string, bId: string, choices: TrackPropertyChoices): OpResult {
  const a = s.tracks.find((t) => t.id === aId)
  const b = s.tracks.find((t) => t.id === bId)
  if (!a || !b || aId === bId) return { station: s }
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const idsA = [...a.nodeIds]
  const idsB = [...b.nodeIds]
  const point = (id: string) => byId.get(id)

  const variants: string[][][] = [
    [idsA, idsB],
    [idsA, [...idsB].reverse()],
    [[...idsA].reverse(), idsB],
    [[...idsA].reverse(), [...idsB].reverse()],
  ]
  let joined: string[] | null = null
  for (const [left, right] of variants) {
    const leftEnd = point(left[left.length - 1]!)
    const rightStart = point(right[0]!)
    if (leftEnd && rightStart && Math.hypot(leftEnd.x - rightStart.x, leftEnd.y - rightStart.y) <= REUSE_DISTANCE) {
      joined = [...left, ...right.slice(1)]
      break
    }
  }
  if (!joined) return { station: s }

  const source = (key: TrackPropertyKey) => choices[key] === 'b' ? b : a
  const merged: Track = {
    ...a,
    name: source('name').name,
    kind: source('kind').kind,
    direction: source('direction').direction,
    lineNo: source('lineNo').lineNo,
    remarks: source('remarks').remarks,
    nodeIds: joined,
  }

  let next: Station = {
    ...s,
    tracks: s.tracks.filter((t) => t.id !== aId && t.id !== bId).concat(merged),
  }
  // Assets stay in the drawing and follow the kept line id.
  next = withAssets(next, {
    signals: next.assets.signals.map((x) => (x.trackId === bId ? { ...x, trackId: aId } : x)),
    joints: next.assets.joints.map((x) => (x.trackId === bId ? { ...x, trackId: aId } : x)),
    lineArrows: next.assets.lineArrows.map((x) => (x.trackId === bId ? { ...x, trackId: aId } : x)),
    trackCircuits: next.assets.trackCircuits.map((tc) => ({
      ...tc,
      spans: tc.spans.map((span) => ('trackId' in span && span.trackId === bId ? { ...span, trackId: aId } : span)),
    })),
  })
  return { station: fixNodeKinds(next), ref: { type: 'track', id: aId } }
}

/** Draw a new line through the anchors. Anchors on existing lines join them. */
export function addTrack(s: Station, anchors: Anchor[], spec: TrackSpec): OpResult {
  const original = new Set(nodeIds(s))
  let cur = s
  const ids: string[] = []
  for (const a of anchors) {
    const r = resolveAnchor(cur, a)
    if (!r) continue
    cur = r.station
    if (ids[ids.length - 1] !== r.nodeId) ids.push(r.nodeId)
  }
  if (ids.length < 2) return { station: s }

  // New free ends take the end style of the line: boundary for running lines, buffer stop otherwise.
  const endKind: NodeKind = spec.kind === 'main' || spec.kind === 'loop' ? 'boundary' : 'bufferStop'
  const ends = new Set([ids[0]!, ids[ids.length - 1]!])
  cur = { ...cur, nodes: cur.nodes.map((n) => (ends.has(n.id) && !original.has(n.id) && n.kind === 'plain' ? { ...n, kind: endKind } : n)) }

  const numbered = spec.kind === 'main' || spec.kind === 'loop'
  const lineNo = numbered ? nextLineNumber(cur) : undefined
  const track: Track = {
    id: nextId('T', cur.tracks.map((t) => t.id), 2),
    name: trackNameFor(cur, spec.kind),
    lineNo,
    kind: spec.kind,
    direction: spec.direction,
    nodeIds: ids,
  }
  return { station: fixNodeKinds({ ...cur, tracks: [...cur.tracks, track] }), ref: { type: 'track', id: track.id } }
}

export const insertVertex = (s: Station, trackId: string, p: Point): OpResult => {
  const r = splitTrackAt(s, trackId, p, 'plain')
  return r ? { station: r.station, ref: { type: 'node', id: r.nodeId } } : { station: s }
}

// --- connections and points ------------------------------------------------------------------

const isRunning = (t: Track | undefined) => t?.kind === 'main' || t?.kind === 'loop'
const tracksOfNode = (s: Station, nodeId: string) => s.tracks.filter((t) => t.nodeIds.includes(nodeId))

function addPointAt(s: Station, code: string, nodeId: string, other: Point, connectionId?: string): Station {
  const node = s.nodes.find((n) => n.id === nodeId)
  if (!node || s.assets.points.some((p) => p.nodeId === nodeId)) return s
  const point = newPoint(code, nodeId, node, other, connectionId)
  point.id = uniqueId(point.id, s.assets.points.map((p) => p.id))
  return withAssets(s, { points: [...s.assets.points, point] })
}

/** A crossover (two running lines) or turnout (running line to siding), optionally with its point machines. */
export function addConnection(s: Station, a: Anchor, b: Anchor, withPoints: boolean): OpResult {
  const ra = resolveAnchor(s, a)
  if (!ra) return { station: s }
  const rb = resolveAnchor(ra.station, b)
  if (!rb || ra.nodeId === rb.nodeId) return { station: s }
  let cur = rb.station

  const tracksA = tracksOfNode(cur, ra.nodeId)
  const tracksB = tracksOfNode(cur, rb.nodeId)
  const crossover = tracksA.some(isRunning) && tracksB.some(isRunning)
  const number = nextPointNumber(cur)
  const connection = {
    id: nextId('C', cur.connections.map((c) => c.id), 2),
    kind: crossover ? ('crossover' as const) : ('turnout' as const),
    from: ra.nodeId,
    to: rb.nodeId,
    via: [],
    label: withPoints ? String(number) : undefined,
  }
  cur = fixNodeKinds({ ...cur, connections: [...cur.connections, connection] })

  if (withPoints) {
    const na = cur.nodes.find((n) => n.id === ra.nodeId)!
    const nb = cur.nodes.find((n) => n.id === rb.nodeId)!
    if (crossover) {
      cur = addPointAt(cur, `${number}A`, na.id, nb, connection.id)
      cur = addPointAt(cur, `${number}B`, nb.id, na, connection.id)
    } else {
      // The point sits where the connection leaves the running line.
      const onRunning = tracksA.some(isRunning) ? na : nb
      cur = addPointAt(cur, String(number), onRunning.id, onRunning === na ? nb : na, connection.id)
    }
  }
  return { station: cur, ref: { type: 'connection', id: connection.id } }
}

export function addPoint(s: Station, a: Anchor): OpResult {
  const r = resolveAnchor(s, a)
  if (!r) return { station: s }
  const existing = r.station.assets.points.find((p) => p.nodeId === r.nodeId)
  if (existing) return { station: r.station, ref: { type: 'point', id: existing.id } }
  const link = r.station.connections.find((c) => c.from === r.nodeId || c.to === r.nodeId)
  const otherId = link ? (link.from === r.nodeId ? link.to : link.from) : null
  const node = r.station.nodes.find((n) => n.id === r.nodeId)!
  const other = r.station.nodes.find((n) => n.id === otherId) ?? { x: node.x, y: node.y + 20 }
  const code = String(nextPointNumber(r.station))
  const next = fixNodeKinds(addPointAt(r.station, code, r.nodeId, other, link?.id))
  const placed = next.assets.points.find((p) => p.nodeId === r.nodeId)
  return { station: next, ref: placed ? { type: 'point', id: placed.id } : undefined }
}

// --- signals, joints, circuits ---------------------------------------------------------------

export function addSignal(s: Station, trackId: string, x: number, clickY: number, presetId: string): OpResult {
  const track = s.tracks.find((t) => t.id === trackId)
  const y = trackYAt(s, trackId, x)
  if (!track || y === null) return { station: s }
  const preset = presetById(presetId)
  const orient = signalOrientation(track, y, clickY)
  const n = nextSignalNumber(s, orient.direction)
  const code = String(n)
  const footX = round2(x)
  const signal = {
    id: uniqueId(`SIG_${idSafe(code)}`, s.assets.signals.map((g) => g.id)),
    code,
    name: `Signal ${code}`,
    kind: preset.kind,
    ...orient,
    trackId,
    footX,
    anchorX: round2(signalAnchorX({ footX, headDir: orient.headDir })),
    elements: preset.elements.map((e) => ({ ...e })),
    control: n,
  }
  return { station: withAssets(s, { signals: [...s.assets.signals, signal] }), ref: { type: 'signal', id: signal.id } }
}

export function addJoint(s: Station, trackId: string, x: number): OpResult {
  if (!s.tracks.some((t) => t.id === trackId)) return { station: s }
  const near = s.assets.joints.find((j) => j.trackId === trackId && Math.abs(j.x - x) < 0.5)
  if (near) return { station: s, ref: { type: 'joint', id: near.id } }
  const joint = { id: uniqueId(`IJ_${trackId}_${Math.round(x)}`, s.assets.joints.map((j) => j.id)), trackId, x: round2(x) }
  return { station: withAssets(s, { joints: [...s.assets.joints, joint] }), ref: { type: 'joint', id: joint.id } }
}

/** Drop a direction arrow on a line. Any number may be placed, anywhere along the line. */
export function addLineArrow(s: Station, trackId: string, x: number, direction: LineArrowDirection): OpResult {
  if (!s.tracks.some((t) => t.id === trackId)) return { station: s }
  const arrow: LineArrow = {
    id: nextId('ARW_', s.assets.lineArrows.map((a) => a.id), 2),
    trackId,
    x: round2(x),
    direction,
  }
  return { station: withAssets(s, { lineArrows: [...s.assets.lineArrows, arrow] }), ref: { type: 'lineArrow', id: arrow.id } }
}

function makeCircuit(s: Station, trackId: string, x0: number, x1: number): TrackCircuit {
  const code = circuitCode(s, trackId, x0, x1, s.assets.trackCircuits.map((t) => t.code))
  const mid = (x0 + x1) / 2
  const y = trackYAt(s, trackId, mid) ?? 0
  return {
    id: uniqueId(`TC_${idSafe(code)}`, s.assets.trackCircuits.map((t) => t.id)),
    code,
    kind: 'trackCircuit',
    spans: [{ trackId, x0: round2(x0), x1: round2(x1) }],
    label: { x: round2(mid), y: round2(y - 7) },
    approx: true,
  }
}

/** Track circuit for the section between the joints around x. */
export function addCircuitAt(s: Station, trackId: string, x: number): OpResult {
  const limits = circuitLimits(s, trackId, x)
  if (!limits) return { station: s }
  const existing = s.assets.trackCircuits.find((tc) => circuitCovers(tc, trackId, limits[0], limits[1]))
  if (existing) return { station: s, ref: { type: 'trackCircuit', id: existing.id } }
  const tc = makeCircuit(s, trackId, limits[0], limits[1])
  return { station: withAssets(s, { trackCircuits: [...s.assets.trackCircuits, tc] }), ref: { type: 'trackCircuit', id: tc.id } }
}

/** Create a circuit for every joint-to-joint section that has none. Returns how many were added. */
export function autoCircuits(s: Station): { station: Station; added: number } {
  let cur = s
  let added = 0
  for (const track of s.tracks) {
    for (const [x0, x1] of trackSections(cur, track)) {
      if (cur.assets.trackCircuits.some((tc) => circuitCovers(tc, track.id, x0, x1))) continue
      cur = withAssets(cur, { trackCircuits: [...cur.assets.trackCircuits, makeCircuit(cur, track.id, x0, x1)] })
      added++
    }
  }
  return { station: cur, added }
}

// --- platforms, structures, bridges, text ----------------------------------------------------

export function addPlatform(s: Station, a: Point, b: Point): OpResult {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  if (x1 - x0 < 2 || y1 - y0 < 2) return { station: s }
  const scale = s.meta.chainage
  const n = s.assets.platforms.length + 1
  const lengthM = scale ? Math.round((x1 - x0) * scale.metresPerUnit) : 0
  const widthM = scale ? Math.round((y1 - y0) * verticalMetresPerUnit(s, scale) * 10) / 10 : 0
  const platform = {
    id: uniqueId(`PF${n}`, s.assets.platforms.map((p) => p.id)),
    name: `PLATFORM No. ${n}`,
    kind: 'high' as const,
    text: `HIGH LEVEL PASSENGER PLATFORM No.-${n}`,
    lengthM,
    widthM,
    startChainage: scale ? round2(chainageAt(scale, x0)) : undefined,
    endChainage: scale ? round2(chainageAt(scale, x1)) : undefined,
    polygon: [
      { x: round2(x0), y: round2(y0) },
      { x: round2(x1), y: round2(y0) },
      { x: round2(x1), y: round2(y1) },
      { x: round2(x0), y: round2(y1) },
    ],
    label: { x: round2((x0 + x1) / 2), y: round2((y0 + y1) / 2) },
  }
  return { station: withAssets(s, { platforms: [...s.assets.platforms, platform] }), ref: { type: 'platform', id: platform.id } }
}

/** Nearest line to a point, with the x to stand at. */
export function nearestTrack(s: Station, p: Point, maxDistance = 400): { trackId: string; x: number } | null {
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  let best: { trackId: string; x: number; d: number } | null = null
  for (const t of s.tracks) {
    for (let i = 1; i < t.nodeIds.length; i++) {
      const a = byId.get(t.nodeIds[i - 1]!)
      const b = byId.get(t.nodeIds[i]!)
      if (!a || !b) continue
      const d = distanceToSegment(p, a, b)
      if (d <= maxDistance && (!best || d < best.d)) best = { trackId: t.id, x: closestOnSegment(p, a, b).x, d }
    }
  }
  return best && { trackId: best.trackId, x: best.x }
}

export function addStructure(s: Station, kind: StructureKind, a: Point, b: Point): OpResult {
  const base = STRUCTURE_NAMES[kind]
  const sameKind = s.assets.structures.filter((x) => x.kind === kind).length
  const name = sameKind > 0 ? `${base} ${sameKind + 1}` : base
  const id = uniqueId(`${idSafe(kind).toUpperCase()}_${sameKind + 1}`, s.assets.structures.map((x) => x.id))
  const scale = s.meta.chainage
  let structure: Structure

  if (kind === 'lvv') {
    const near = nearestTrack(s, a, 30)
    if (!near) return { station: s }
    structure = { id, kind, name, at: { trackId: near.trackId, x: round2(near.x) }, chainage: scale ? round2(chainageAt(scale, near.x)) : undefined }
  } else {
    const dragged = Math.abs(b.x - a.x) > 3 || Math.abs(b.y - a.y) > 3
    const [w, h] = STRUCTURE_SIZE[kind]
    const x0 = dragged ? Math.min(a.x, b.x) : a.x - w / 2
    const x1 = dragged ? Math.max(a.x, b.x) : a.x + w / 2
    const y0 = dragged ? Math.min(a.y, b.y) : a.y - h / 2
    const y1 = dragged ? Math.max(a.y, b.y) : a.y + h / 2
    const cx = (x0 + x1) / 2
    structure = {
      id,
      kind,
      name,
      shape: { type: 'rect', x0: round2(x0), y0: round2(y0), x1: round2(x1), y1: round2(y1) },
      label: { x: round2(cx), y: round2(y1 + 9) },
      chainage: kind === 'building' && scale ? round2(chainageAt(scale, cx)) : undefined,
    }
    // Boxes sit beside a line on a stem to it.
    if (kind === 'goomty' || kind === 'detector' || kind === 'locoPilotBoard') {
      const near = nearestTrack(s, { x: cx, y: (y0 + y1) / 2 })
      if (near) structure.foot = { trackId: near.trackId, x: round2(cx) }
    }
  }
  return { station: withAssets(s, { structures: [...s.assets.structures, structure] }), ref: { type: 'structure', id } }
}

export function addBridge(s: Station, x: number): OpResult {
  const scale = s.meta.chainage
  const bridge: Bridge = {
    id: nextId('BR', s.assets.bridges.map((b) => b.id), 2),
    number: '',
    chainage: scale ? round2(chainageAt(scale, x)) : 0,
    x: round2(x),
    spec: '',
  }
  return { station: withAssets(s, { bridges: [...s.assets.bridges, bridge] }), ref: { type: 'bridge', id: bridge.id } }
}

export function addAnnotation(s: Station, p: Point, text = 'TEXT'): OpResult {
  const a = { id: nextId('A_', s.assets.annotations.map((x) => x.id), 2), text, x: round2(p.x), y: round2(p.y), tone: 'line' as const }
  return { station: withAssets(s, { annotations: [...s.assets.annotations, a] }), ref: { type: 'annotation', id: a.id } }
}

// --- update ----------------------------------------------------------------------------------

const COLLECTION: Partial<Record<EntityType, keyof StationAssets>> = {
  point: 'points',
  signal: 'signals',
  joint: 'joints',
  lineArrow: 'lineArrows',
  trackCircuit: 'trackCircuits',
  platform: 'platforms',
  structure: 'structures',
  bridge: 'bridges',
  chainageMark: 'chainageMarks',
  gradient: 'gradients',
  dimension: 'dimensions',
  annotation: 'annotations',
}

/** Shallow-merge `patch` into the entity. */
export function updateEntity(s: Station, ref: EntityRef, patch: Record<string, unknown>): Station {
  const merge = <T extends { id: string }>(list: T[]): T[] => list.map((x) => (x.id === ref.id ? ({ ...x, ...patch } as T) : x))
  switch (ref.type) {
    case 'node':
      return fixNodeKinds({ ...s, nodes: merge(s.nodes) })
    case 'track':
      return { ...s, tracks: merge(s.tracks) }
    case 'connection':
      return { ...s, connections: merge(s.connections) }
    default: {
      const key = COLLECTION[ref.type]
      return key ? withAssets(s, { [key]: merge(s.assets[key] as { id: string }[]) } as Partial<StationAssets>) : s
    }
  }
}

// --- move ------------------------------------------------------------------------------------

const shift = (p: Point, dx: number, dy: number): Point => ({ x: round2(p.x + dx), y: round2(p.y + dy) })
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export interface MoveOptions {
  /** Pointer position: decides which side of the line a dragged signal ends up on. Without it the side is kept. */
  cursor?: Point
  /** Point machines: 'body' moves the point itself (its junction, with the label); 'label' moves only the code. */
  part?: 'body' | 'label'
}

/**
 * Entity as it would be after the pointer moved by (dx, dy) from where `base` was grabbed.
 * Always computed from `base`, so a drag never accumulates rounding.
 */
export function moveEntity(base: Station, ref: EntityRef, dx: number, dy: number, { cursor, part = 'body' }: MoveOptions = {}): Station {
  const { assets } = base
  switch (ref.type) {
    case 'node': {
      const node = base.nodes.find((n) => n.id === ref.id)
      if (!node) return base
      const moved = shift(node, dx, dy)
      return {
        ...base,
        nodes: base.nodes.map((n) => (n.id === ref.id ? { ...n, ...moved } : n)),
        // Point labels travel with their node.
        assets: { ...assets, points: assets.points.map((p) => (p.nodeId === ref.id ? { ...p, label: shift(p.label, dx, dy) } : p)) },
      }
    }
    case 'signal': {
      const sig = assets.signals.find((g) => g.id === ref.id)
      const track = base.tracks.find((t) => t.id === sig?.trackId)
      if (!sig || !track) return base
      const [lo, hi] = trackXRange(base, track)
      const footX = round2(clamp(sig.footX + dx, lo, hi))
      const y = trackYAt(base, track.id, footX)
      const side = y === null || !cursor ? sig.side : cursor.y < y ? 'above' : 'below'
      return updateEntity(base, ref, {
        footX,
        anchorX: round2(sig.anchorX + (footX - sig.footX)),
        side,
        label: sig.label ? shift(sig.label, footX - sig.footX, 0) : undefined,
      })
    }
    case 'joint': {
      const j = assets.joints.find((j) => j.id === ref.id)
      const track = base.tracks.find((t) => t.id === j?.trackId)
      if (!j || !track) return base
      const [lo, hi] = trackXRange(base, track)
      return updateEntity(base, ref, { x: round2(clamp(j.x + dx, lo, hi)) })
    }
    case 'lineArrow': {
      const a = assets.lineArrows.find((a) => a.id === ref.id)
      const track = base.tracks.find((t) => t.id === a?.trackId)
      if (!a || !track) return base
      const [lo, hi] = trackXRange(base, track)
      return updateEntity(base, ref, { x: round2(clamp(a.x + dx, lo, hi)) })
    }
    case 'point': {
      const p = assets.points.find((p) => p.id === ref.id)
      if (!p) return base
      // The point is drawn on its junction, so moving the point moves that vertex (and the label with it).
      if (part === 'body') return moveEntity(base, { type: 'node', id: p.nodeId }, dx, dy)
      return updateEntity(base, ref, { label: shift(p.label, dx, dy) })
    }
    case 'trackCircuit': {
      const tc = assets.trackCircuits.find((t) => t.id === ref.id)
      return tc ? updateEntity(base, ref, { label: shift(tc.label, dx, dy) }) : base
    }
    case 'platform': {
      const p = assets.platforms.find((p) => p.id === ref.id)
      if (!p) return base
      const scale = base.meta.chainage
      const xs = p.polygon.map((q) => q.x + dx)
      return updateEntity(base, ref, {
        polygon: p.polygon.map((q) => shift(q, dx, dy)),
        label: shift(p.label, dx, dy),
        startChainage: scale ? round2(chainageAt(scale, Math.min(...xs))) : p.startChainage,
        endChainage: scale ? round2(chainageAt(scale, Math.max(...xs))) : p.endChainage,
      })
    }
    case 'structure': {
      const st = assets.structures.find((t) => t.id === ref.id)
      if (!st) return base
      const scale = base.meta.chainage
      const shape: Shape | undefined =
        st.shape &&
        (st.shape.type === 'polygon'
          ? { type: 'polygon', points: st.shape.points.map((q) => shift(q, dx, dy)) }
          : { ...st.shape, x0: round2(st.shape.x0 + dx), x1: round2(st.shape.x1 + dx), y0: round2(st.shape.y0 + dy), y1: round2(st.shape.y1 + dy) })
      const cx = shape ? shapeCentre(shape).x : st.at ? st.at.x + dx : 0
      return updateEntity(base, ref, {
        shape,
        label: st.label && shift(st.label, dx, dy),
        foot: st.foot && { ...st.foot, x: round2(st.foot.x + dx) },
        at: st.at && { ...st.at, x: round2(st.at.x + dx) },
        chainage: st.chainage !== undefined && scale ? round2(chainageAt(scale, cx)) : st.chainage,
      })
    }
    case 'bridge': {
      const b = assets.bridges.find((b) => b.id === ref.id)
      if (!b) return base
      const x = round2(b.x + dx)
      const scale = base.meta.chainage
      return updateEntity(base, ref, { x, chainage: scale ? round2(chainageAt(scale, x)) : b.chainage })
    }
    case 'annotation': {
      const a = assets.annotations.find((a) => a.id === ref.id)
      return a ? updateEntity(base, ref, { ...shift(a, dx, dy) }) : base
    }
    default:
      return base
  }
}

export const isMovable = (ref: EntityRef): boolean =>
  ['node', 'signal', 'joint', 'lineArrow', 'point', 'platform', 'structure', 'bridge', 'annotation'].includes(ref.type)

// --- delete ----------------------------------------------------------------------------------

function removeConnection(s: Station, id: string): Station {
  const trimmed = s.assets.trackCircuits.flatMap((tc): TrackCircuit[] => {
    const spans = tc.spans.filter((sp) => !('connectionId' in sp) || sp.connectionId !== id)
    return spans.length === 0 ? [] : spans.length === tc.spans.length ? [tc] : [{ ...tc, spans }]
  })
  return {
    ...s,
    connections: s.connections.filter((c) => c.id !== id),
    assets: { ...s.assets, points: s.assets.points.filter((p) => p.connectionId !== id), trackCircuits: trimmed },
  }
}

/** Remove the line and everything standing on it. Vertices are cleaned up by `pruneOrphans`. */
function removeTrackOnly(s: Station, id: string): Station {
  const a = s.assets
  const trackCircuits = a.trackCircuits.flatMap((tc): TrackCircuit[] => {
    const spans = tc.spans.filter((sp) => !('trackId' in sp) || sp.trackId !== id)
    return spans.length === 0 ? [] : spans.length === tc.spans.length ? [tc] : [{ ...tc, spans }]
  })
  return {
    ...s,
    tracks: s.tracks.filter((t) => t.id !== id),
    assets: {
      ...a,
      trackCircuits,
      joints: a.joints.filter((j) => j.trackId !== id),
      lineArrows: a.lineArrows.filter((l) => l.trackId !== id),
      signals: a.signals.filter((g) => g.trackId !== id),
      breaks: a.breaks.filter((b) => b.trackId !== id),
      structures: a.structures.flatMap((st): Structure[] => {
        if (st.at?.trackId === id) return []
        if (st.foot?.trackId === id) {
          const { foot: _foot, ...rest } = st
          return [rest]
        }
        return [st]
      }),
    },
  }
}

function removeNode(s: Station, id: string): Station {
  let cur = s
  for (const c of s.connections) if (c.from === id || c.to === id) cur = removeConnection(cur, c.id)
  cur = withAssets(cur, { points: cur.assets.points.filter((p) => p.nodeId !== id) })
  for (const t of s.tracks) {
    if (!t.nodeIds.includes(id)) continue
    const ids = t.nodeIds.filter((n) => n !== id)
    cur = ids.length < 2 ? removeTrackOnly(cur, t.id) : { ...cur, tracks: cur.tracks.map((x) => (x.id === t.id ? { ...x, nodeIds: ids } : x)) }
  }
  return pruneOrphans({ ...cur, nodes: cur.nodes.filter((n) => n.id !== id) })
}

/** Drop vertices that no line passes through any more (and what hangs off them). */
export function pruneOrphans(s: Station): Station {
  const used = new Set(s.tracks.flatMap((t) => t.nodeIds))
  const orphan = s.nodes.find((n) => !used.has(n.id))
  return orphan ? removeNode(s, orphan.id) : s
}

export function deleteEntity(s: Station, ref: EntityRef): Station {
  switch (ref.type) {
    case 'track':
      return pruneOrphans(removeTrackOnly(s, ref.id))
    case 'connection':
      return removeConnection(s, ref.id)
    case 'node':
      return removeNode(s, ref.id)
    default: {
      const key = COLLECTION[ref.type]
      return key ? withAssets(s, { [key]: (s.assets[key] as { id: string }[]).filter((x) => x.id !== ref.id) } as Partial<StationAssets>) : s
    }
  }
}

// --- lookup ----------------------------------------------------------------------------------

/** Which entity an id (from a validation issue) belongs to. */
export function findEntityById(s: Station, id: string): EntityRef | null {
  if (s.tracks.some((t) => t.id === id)) return { type: 'track', id }
  if (s.connections.some((c) => c.id === id)) return { type: 'connection', id }
  if (s.nodes.some((n) => n.id === id)) return { type: 'node', id }
  for (const [type, key] of Object.entries(COLLECTION) as [EntityType, keyof StationAssets][]) {
    if ((s.assets[key] as { id: string }[]).some((x) => x.id === id)) return { type, id }
  }
  return null
}
