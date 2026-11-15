import { isTrackEnd, type Station } from './types'

export type IssueLevel = 'error' | 'warning'

export interface ValidationIssue {
  level: IssueLevel
  code: string
  message: string
  entityId?: string
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id)
    seen.add(id)
  }
  return [...dupes]
}

/** Structural checks every station JSON must pass before it is rendered. */
export function validateStation(station: Station): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const add = (level: IssueLevel, code: string, message: string, entityId?: string) =>
    issues.push({ level, code, message, entityId })

  for (const id of duplicates(station.nodes.map((n) => n.id))) add('error', 'node.duplicate', `Duplicate node id ${id}`, id)
  for (const id of duplicates(station.tracks.map((t) => t.id))) add('error', 'track.duplicate', `Duplicate track id ${id}`, id)
  for (const id of duplicates(station.connections.map((c) => c.id)))
    add('error', 'connection.duplicate', `Duplicate connection id ${id}`, id)

  const nodes = new Map(station.nodes.map((n) => [n.id, n]))
  const usedByTrack = new Set<string>()

  for (const track of station.tracks) {
    if (track.nodeIds.length < 2) add('error', 'track.short', `Track ${track.id} needs at least 2 nodes`, track.id)

    track.nodeIds.forEach((id, i) => {
      const node = nodes.get(id)
      if (!node) return add('error', 'track.node-missing', `Track ${track.id} references unknown node ${id}`, track.id)
      usedByTrack.add(id)

      const interior = i > 0 && i < track.nodeIds.length - 1
      if (interior && isTrackEnd(node.kind))
        add('warning', 'track.end-inside', `Track ${track.id}: ${node.kind} ${id} sits inside the track`, track.id)

      const next = nodes.get(track.nodeIds[i + 1] ?? '')
      if (next && next.x === node.x && next.y === node.y)
        add('error', 'track.zero-length', `Track ${track.id}: ${id} and ${next.id} share a position`, track.id)
    })

    const xs = track.nodeIds.flatMap((id) => (nodes.has(id) ? [nodes.get(id)!.x] : []))
    const rising = xs.every((x, i) => i === 0 || x >= xs[i - 1]!)
    const falling = xs.every((x, i) => i === 0 || x <= xs[i - 1]!)
    if (!rising && !falling) add('warning', 'track.not-monotonic', `Track ${track.id} doubles back along x`, track.id)
  }

  const tracksOf = new Map<string, Set<string>>()
  for (const track of station.tracks)
    for (const id of track.nodeIds) tracksOf.set(id, (tracksOf.get(id) ?? new Set()).add(track.id))

  for (const c of station.connections) {
    const a = nodes.get(c.from)
    const b = nodes.get(c.to)
    if (!a) add('error', 'connection.node-missing', `Connection ${c.id} references unknown node ${c.from}`, c.id)
    if (!b) add('error', 'connection.node-missing', `Connection ${c.id} references unknown node ${c.to}`, c.id)
    if (c.from === c.to) add('error', 'connection.loop', `Connection ${c.id} starts and ends at ${c.from}`, c.id)
    const ta = tracksOf.get(c.from)
    const tb = tracksOf.get(c.to)
    if (a && !ta) add('error', 'connection.off-track', `Connection ${c.id}: node ${c.from} is on no track`, c.id)
    if (b && !tb) add('error', 'connection.off-track', `Connection ${c.id}: node ${c.to} is on no track`, c.id)
    if (ta && tb && [...ta].some((t) => tb.has(t)))
      add('warning', 'connection.same-track', `Connection ${c.id} joins a track to itself`, c.id)
  }

  for (const node of station.nodes)
    if (!usedByTrack.has(node.id)) add('warning', 'node.unused', `Node ${node.id} is on no track`, node.id)

  // Whole yard should be one connected graph.
  const parent = new Map<string, string>(station.nodes.map((n) => [n.id, n.id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => {
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b))
  }
  for (const t of station.tracks) t.nodeIds.forEach((id, i) => i > 0 && union(t.nodeIds[i - 1]!, id))
  for (const c of station.connections) union(c.from, c.to)
  const groups = new Set(station.nodes.map((n) => find(n.id)))
  if (groups.size > 1) add('warning', 'graph.disconnected', `Yard splits into ${groups.size} disconnected parts`)

  validateAssets(station, nodes, add)

  return issues
}

type Add = (level: IssueLevel, code: string, message: string, entityId?: string) => void

/** Checks that every asset points at something that exists, and that ids are unique per kind. */
function validateAssets(station: Station, nodes: Map<string, { id: string }>, add: Add): void {
  const { assets } = station
  const trackIds = new Set(station.tracks.map((t) => t.id))
  const connectionIds = new Set(station.connections.map((c) => c.id))
  const groups: [string, { id: string }[]][] = [
    ['point', assets.points],
    ['signal', assets.signals],
    ['joint', assets.joints],
    ['lineArrow', assets.lineArrows],
    ['trackCircuit', assets.trackCircuits],
    ['platform', assets.platforms],
    ['structure', assets.structures],
    ['bridge', assets.bridges],
    ['chainageMark', assets.chainageMarks],
    ['gradient', assets.gradients],
    ['dimension', assets.dimensions],
  ]
  for (const [kind, list] of groups)
    for (const id of duplicates(list.map((a) => a.id))) add('error', `${kind}.duplicate`, `Duplicate ${kind} id ${id}`, id)

  const needTrack = (kind: string, id: string, trackId: string) => {
    if (!trackIds.has(trackId)) add('error', `${kind}.track-missing`, `${kind} ${id} references unknown track ${trackId}`, id)
  }

  for (const p of assets.points) {
    if (!nodes.has(p.nodeId)) add('error', 'point.node-missing', `Point ${p.code} references unknown node ${p.nodeId}`, p.id)
    if (p.connectionId && !connectionIds.has(p.connectionId))
      add('error', 'point.connection-missing', `Point ${p.code} references unknown connection ${p.connectionId}`, p.id)
  }
  for (const s of assets.signals) {
    needTrack('signal', s.id, s.trackId)
    if (s.elements.length === 0) add('warning', 'signal.empty', `Signal ${s.code} has no head elements`, s.id)
  }
  for (const j of assets.joints) needTrack('joint', j.id, j.trackId)
  for (const a of assets.lineArrows) needTrack('lineArrow', a.id, a.trackId)
  for (const tc of assets.trackCircuits) {
    for (const span of tc.spans) {
      if ('trackId' in span) {
        needTrack('trackCircuit', tc.id, span.trackId)
        if (span.x1 <= span.x0) add('error', 'trackCircuit.span', `Track circuit ${tc.code} has an empty span`, tc.id)
      } else if (!connectionIds.has(span.connectionId)) {
        add('error', 'trackCircuit.connection-missing', `Track circuit ${tc.code} references unknown connection ${span.connectionId}`, tc.id)
      }
    }
  }
  for (const s of assets.structures) {
    if (s.foot) needTrack('structure', s.id, s.foot.trackId)
    if (s.at) needTrack('structure', s.id, s.at.trackId)
  }
  for (const b of assets.breaks) needTrack('break', b.trackId, b.trackId)
  if (!station.meta.chainage && (assets.chainageMarks.length > 0 || assets.bridges.length > 0))
    add('warning', 'meta.chainage-missing', 'Chainage marks exist but meta.chainage is not set')
}
