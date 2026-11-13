import {
  chainageAt,
  shapeBox,
  shapePoints,
  type EntityRef,
  type NodeKind,
  type Point,
  type Station,
  type Structure,
  type StructureKind,
  type TrackNode,
} from '@/sip/model'
import { distanceToSegment } from '@/sip/layout'
import { trackPoints, trackXRange, trackYAt } from './autogen'
import { STRUCTURE_NAMES } from './catalog'
import { idSafe, nextId, uniqueId } from './ids'
import { addPlatform, fixNodeKinds, insertVertex, moveEntity, updateEntity, type OpResult } from './ops'
import { closestOnSegment } from './snap'

/**
 * Free-form outlines (platforms, buildings), exact positions, and moving things between lines.
 * Like the rest of the engine, every function is pure: Station -> Station.
 */

const round2 = (n: number) => Math.round(n * 100) / 100
const r2 = (p: Point): Point => ({ x: round2(p.x), y: round2(p.y) })

// --- outlines --------------------------------------------------------------------------------

/** Structures drawn to scale. Boxes on posts and the LVV are symbols, so they have no outline to edit. */
export const hasOutline = (st: Structure): boolean => !!st.shape && (st.kind === 'building' || st.kind === 'smRoom' || st.kind === 'fob')

/** Corners of a platform or a to-scale structure, or null when the entity has no editable outline. */
export function outlineOf(s: Station, ref: EntityRef | null): Point[] | null {
  if (!ref) return null
  if (ref.type === 'platform') return s.assets.platforms.find((p) => p.id === ref.id)?.polygon ?? null
  if (ref.type === 'structure') {
    const st = s.assets.structures.find((x) => x.id === ref.id)
    return st && hasOutline(st) ? shapePoints(st.shape!) : null
  }
  return null
}

/** Replace the outline and refresh what is measured from it (end chainages). Typed sizes are left alone. */
export function setOutline(s: Station, ref: EntityRef, points: Point[]): Station {
  const pts = points.map(r2)
  const scale = s.meta.chainage
  const xs = pts.map((p) => p.x)
  if (ref.type === 'platform') {
    const p = s.assets.platforms.find((p) => p.id === ref.id)
    if (!p) return s
    return updateEntity(s, ref, {
      polygon: pts,
      startChainage: scale ? round2(chainageAt(scale, Math.min(...xs))) : p.startChainage,
      endChainage: scale ? round2(chainageAt(scale, Math.max(...xs))) : p.endChainage,
    })
  }
  if (ref.type === 'structure') {
    const st = s.assets.structures.find((x) => x.id === ref.id)
    if (!st) return s
    const shape = { type: 'polygon' as const, points: pts }
    const box = shapeBox(shape)
    return updateEntity(s, ref, {
      shape,
      chainage: st.chainage !== undefined && scale ? round2(chainageAt(scale, (box.x0 + box.x1) / 2)) : st.chainage,
    })
  }
  return s
}

/** Move corner `index` to `p`. */
export function moveOutlineVertex(s: Station, ref: EntityRef, index: number, p: Point): Station {
  const pts = outlineOf(s, ref)
  if (!pts || !pts[index]) return s
  return setOutline(s, ref, pts.map((q, i) => (i === index ? p : q)))
}

/** Index of the outline edge nearest to `p` (the edge from corner i to corner i+1), with the spot on it. */
export function nearestOutlineEdge(pts: Point[], p: Point): { index: number; at: Point; d: number } | null {
  let best: { index: number; at: Point; d: number } | null = null
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    const d = distanceToSegment(p, a, b)
    if (!best || d < best.d) best = { index: i, at: closestOnSegment(p, a, b), d }
  }
  return best
}

/** Add a corner on the edge nearest to `p`. Returns the new corner's index. */
export function insertOutlineVertex(s: Station, ref: EntityRef, p: Point): { station: Station; index: number } | null {
  const pts = outlineOf(s, ref)
  if (!pts) return null
  const edge = nearestOutlineEdge(pts, p)
  if (!edge) return null
  const next = [...pts]
  next.splice(edge.index + 1, 0, edge.at)
  return { station: setOutline(s, ref, next), index: edge.index + 1 }
}

/** Remove corner `index`. An outline keeps at least three corners. */
export function removeOutlineVertex(s: Station, ref: EntityRef, index: number): Station {
  const pts = outlineOf(s, ref)
  if (!pts || pts.length <= 3) return s
  return setOutline(s, ref, pts.filter((_, i) => i !== index))
}

/** Distinct corners only: clicks that land on the previous corner (as a double-click does) are dropped. */
function cleanOutline(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) >= 0.5) out.push(r2(p))
  }
  while (out.length > 1 && Math.hypot(out[0]!.x - out[out.length - 1]!.x, out[0]!.y - out[out.length - 1]!.y) < 0.5) out.pop()
  return out
}

/** A platform of any shape, from its corners. */
export function addPlatformOutline(s: Station, points: Point[]): OpResult {
  const pts = cleanOutline(points)
  if (pts.length < 3) return { station: s }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  // Build it as the bounding rectangle (which fills in size, name and chainages), then give it the real outline.
  const made = addPlatform(s, { x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) })
  if (!made.ref) return { station: s }
  return { station: updateEntity(made.station, made.ref, { polygon: pts }), ref: made.ref }
}

/** A building, S.M. room or FOB of any shape, from its corners. */
export function addStructureOutline(s: Station, kind: StructureKind, points: Point[]): OpResult {
  const pts = cleanOutline(points)
  if (pts.length < 3) return { station: s }
  const base = STRUCTURE_NAMES[kind]
  const sameKind = s.assets.structures.filter((x) => x.kind === kind).length
  const shape = { type: 'polygon' as const, points: pts }
  const box = shapeBox(shape)
  const scale = s.meta.chainage
  const cx = (box.x0 + box.x1) / 2
  const structure: Structure = {
    id: uniqueId(`${idSafe(kind).toUpperCase()}_${sameKind + 1}`, s.assets.structures.map((x) => x.id)),
    kind,
    name: sameKind > 0 ? `${base} ${sameKind + 1}` : base,
    shape,
    label: { x: round2(cx), y: round2(box.y1 + 9) },
    chainage: kind === 'building' && scale ? round2(chainageAt(scale, cx)) : undefined,
  }
  return { station: { ...s, assets: { ...s.assets, structures: [...s.assets.structures, structure] } }, ref: { type: 'structure', id: structure.id } }
}

// --- grab handles ----------------------------------------------------------------------------

/** Grab handles of the selected item: outline corners, and mid-edge "+" handles that pull out a new vertex. */
export type EditHandle =
  | { kind: 'corner'; ref: EntityRef; index: number; p: Point }
  | { kind: 'edgeMid'; ref: EntityRef; p: Point }
  | { kind: 'trackMid'; trackId: string; p: Point }

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function editHandles(s: Station, selected: EntityRef | null): EditHandle[] {
  if (!selected) return []
  const outline = outlineOf(s, selected)
  if (outline) {
    return [
      ...outline.map((p, index): EditHandle => ({ kind: 'corner', ref: selected, index, p })),
      ...outline.map((p, i): EditHandle => ({ kind: 'edgeMid', ref: selected, p: mid(p, outline[(i + 1) % outline.length]!) })),
    ]
  }
  if (selected.type === 'track') {
    const track = s.tracks.find((t) => t.id === selected.id)
    if (!track) return []
    const pts = trackPoints(s, track)
    return pts.slice(1).map((p, i): EditHandle => ({ kind: 'trackMid', trackId: track.id, p: mid(pts[i]!, p) }))
  }
  return []
}

// --- exact positions -------------------------------------------------------------------------

/**
 * Where an entity is, for typing an exact position.
 * `axes: 'x'` means it lives on a line, so only its position along the line can be set.
 * Outlines report their left / top edge.
 */
export interface EntityPosition {
  p: Point
  axes: 'xy' | 'x'
  /** What the numbers refer to, shown beside the fields. */
  what: string
}

export function entityPosition(s: Station, ref: EntityRef): EntityPosition | null {
  const { assets } = s
  switch (ref.type) {
    case 'node': {
      const n = s.nodes.find((n) => n.id === ref.id)
      return n ? { p: { x: n.x, y: n.y }, axes: 'xy', what: 'Vertex' } : null
    }
    case 'point': {
      const pm = assets.points.find((p) => p.id === ref.id)
      const n = pm && s.nodes.find((n) => n.id === pm.nodeId)
      return n ? { p: { x: n.x, y: n.y }, axes: 'xy', what: 'Point (its junction)' } : null
    }
    case 'signal': {
      const g = assets.signals.find((g) => g.id === ref.id)
      return g ? { p: { x: g.footX, y: trackYAt(s, g.trackId, g.footX) ?? 0 }, axes: 'x', what: 'Post along the line' } : null
    }
    case 'joint': {
      const j = assets.joints.find((j) => j.id === ref.id)
      return j ? { p: { x: j.x, y: trackYAt(s, j.trackId, j.x) ?? 0 }, axes: 'x', what: 'Along the line' } : null
    }
    case 'bridge': {
      const b = assets.bridges.find((b) => b.id === ref.id)
      return b ? { p: { x: b.x, y: 0 }, axes: 'x', what: 'Along the yard' } : null
    }
    case 'trackCircuit': {
      const tc = assets.trackCircuits.find((t) => t.id === ref.id)
      return tc ? { p: { ...tc.label }, axes: 'xy', what: 'Label' } : null
    }
    case 'annotation': {
      const a = assets.annotations.find((a) => a.id === ref.id)
      return a ? { p: { x: a.x, y: a.y }, axes: 'xy', what: 'Text' } : null
    }
    case 'platform': {
      const p = assets.platforms.find((p) => p.id === ref.id)
      if (!p || p.polygon.length === 0) return null
      return { p: { x: Math.min(...p.polygon.map((q) => q.x)), y: Math.min(...p.polygon.map((q) => q.y)) }, axes: 'xy', what: 'Left / top edge' }
    }
    case 'structure': {
      const st = assets.structures.find((x) => x.id === ref.id)
      if (!st) return null
      if (st.shape) {
        const b = shapeBox(st.shape)
        return { p: { x: b.x0, y: b.y0 }, axes: 'xy', what: 'Left / top edge' }
      }
      if (st.at) return { p: { x: st.at.x, y: trackYAt(s, st.at.trackId, st.at.x) ?? 0 }, axes: 'x', what: 'Along the line' }
      return null
    }
    default:
      return null
  }
}

/** Put an entity at an exact position (see `entityPosition` for what the position means). */
export function placeEntity(s: Station, ref: EntityRef, p: Point): Station {
  const cur = entityPosition(s, ref)
  if (!cur) return s
  const dx = p.x - cur.p.x
  const dy = cur.axes === 'x' ? 0 : p.y - cur.p.y
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return s
  return moveEntity(s, ref, dx, dy)
}

// --- moving things to another line -----------------------------------------------------------

/** Move a signal, joint or LVV onto another line, keeping its position along the yard where it can. */
export function moveToTrack(s: Station, ref: EntityRef, trackId: string): Station {
  const track = s.tracks.find((t) => t.id === trackId)
  if (!track) return s
  const [lo, hi] = trackXRange(s, track)
  const clampX = (x: number) => round2(Math.min(hi, Math.max(lo, x)))
  const { assets } = s
  switch (ref.type) {
    case 'signal': {
      const g = assets.signals.find((g) => g.id === ref.id)
      if (!g || g.trackId === trackId) return s
      const footX = clampX(g.footX)
      const shiftX = footX - g.footX
      const oldY = trackYAt(s, g.trackId, g.footX)
      const newY = trackYAt(s, trackId, footX)
      const shiftY = oldY !== null && newY !== null ? newY - oldY : 0
      return updateEntity(s, ref, {
        trackId,
        footX,
        anchorX: round2(g.anchorX + shiftX),
        label: g.label ? r2({ x: g.label.x + shiftX, y: g.label.y + shiftY }) : undefined,
      })
    }
    case 'joint': {
      const j = assets.joints.find((j) => j.id === ref.id)
      return j && j.trackId !== trackId ? updateEntity(s, ref, { trackId, x: clampX(j.x) }) : s
    }
    case 'structure': {
      const st = assets.structures.find((x) => x.id === ref.id)
      if (!st) return s
      if (st.at) return updateEntity(s, ref, { at: { trackId, x: clampX(st.at.x) } })
      if (st.foot) return updateEntity(s, ref, { foot: { trackId, x: clampX(st.foot.x) } })
      return s
    }
    default:
      return s
  }
}

// --- adding vertices to lines ----------------------------------------------------------------

/**
 * Add a vertex to a line at `p`: a bend when `p` is beside the line, or a new end when it lies beyond one of
 * the line's ends (the line is extended there).
 */
export function addTrackVertex(s: Station, trackId: string, p: Point): OpResult {
  const track = s.tracks.find((t) => t.id === trackId)
  if (!track || track.nodeIds.length < 2) return { station: s }
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const first = byId.get(track.nodeIds[0]!)
  const last = byId.get(track.nodeIds[track.nodeIds.length - 1]!)
  if (!first || !last) return { station: s }
  const lowEnd = first.x <= last.x ? 'first' : 'last'
  const lo = Math.min(first.x, last.x)
  const hi = Math.max(first.x, last.x)
  const atEnd: 'first' | 'last' | null = p.x < lo - 0.5 ? lowEnd : p.x > hi + 0.5 ? (lowEnd === 'first' ? 'last' : 'first') : null
  if (!atEnd) return insertVertex(s, trackId, p)

  // Extend: the new vertex takes over the end style (boundary / buffer stop), the old end becomes a bend.
  const oldEnd = atEnd === 'first' ? first : last
  const shared = s.tracks.some((t) => t.id !== trackId && t.nodeIds.includes(oldEnd.id)) || s.connections.some((c) => c.from === oldEnd.id || c.to === oldEnd.id)
  const isEndKind = oldEnd.kind === 'boundary' || oldEnd.kind === 'bufferStop'
  const kind: NodeKind = isEndKind ? oldEnd.kind : track.kind === 'main' || track.kind === 'loop' ? 'boundary' : 'bufferStop'
  const node: TrackNode = { id: nextId('N', s.nodes.map((n) => n.id), 3), x: round2(p.x), y: round2(p.y), kind }
  const nodes = s.nodes.map((n) => (n.id === oldEnd.id && isEndKind ? { ...n, kind: (shared ? 'junction' : 'plain') as NodeKind } : n))
  const ids = atEnd === 'first' ? [node.id, ...track.nodeIds] : [...track.nodeIds, node.id]
  const station = fixNodeKinds({ ...s, nodes: [...nodes, node], tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, nodeIds: ids } : t)) })
  return { station, ref: { type: 'node', id: node.id } }
}
