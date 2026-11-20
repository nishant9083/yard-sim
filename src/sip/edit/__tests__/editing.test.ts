import { describe, expect, it } from 'vitest'
import { shapePoints, validateStation, type Station } from '@/sip/model'
import {
  addJoint,
  addPlatformOutline,
  addPoint,
  addSignal,
  addStructure,
  addStructureOutline,
  addTrack,
  addTrackVertex,
  blankStation,
  entityPosition,
  fixNodeKinds,
  insertOutlineVertex,
  moveEntity,
  moveOutlineVertex,
  moveToTrack,
  placeEntity,
  removeOutlineVertex,
  splitTrack,
  mergeTracks,
} from '@/sip/edit'

/** Two level lines, y = 0 and y = 40, from x = 0 to x = 400. */
function twoLines(): Station {
  let s = blankStation({ code: 'TST', name: 'Test' })
  s = addTrack(s, [{ p: { x: 0, y: 0 } }, { p: { x: 400, y: 0 } }], { kind: 'main', direction: 'BOTH' }).station
  s = addTrack(s, [{ p: { x: 0, y: 40 } }, { p: { x: 400, y: 40 } }], { kind: 'main', direction: 'BOTH' }).station
  return s
}

describe('free-form outlines', () => {
  it('creates a platform of any shape and reshapes it', () => {
    const s = twoLines()
    const tri = [
      { x: 100, y: 10 },
      { x: 200, y: 10 },
      { x: 150, y: 30 },
    ]
    const made = addPlatformOutline(s, tri)
    const ref = made.ref!
    expect(made.station.assets.platforms[0]!.polygon).toEqual(tri)

    const inserted = insertOutlineVertex(made.station, ref, { x: 150, y: 9 })!
    expect(inserted.index).toBe(1)
    expect(inserted.station.assets.platforms[0]!.polygon).toHaveLength(4)

    const moved = moveOutlineVertex(inserted.station, ref, 1, { x: 150, y: 0 })
    expect(moved.assets.platforms[0]!.polygon[1]).toEqual({ x: 150, y: 0 })

    const removed = removeOutlineVertex(moved, ref, 1)
    expect(removed.assets.platforms[0]!.polygon).toEqual(tri)
    // Never fewer than three corners.
    expect(removeOutlineVertex(removed, ref, 0)).toBe(removed)
  })

  it('drops repeated clicks and refuses fewer than three corners', () => {
    const s = twoLines()
    expect(addPlatformOutline(s, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }]).station).toBe(s)
  })

  it('turns a rectangular building into a polygon when a corner is moved, and moves it whole', () => {
    const made = addStructure(twoLines(), 'building', { x: 100, y: 60 }, { x: 200, y: 100 })
    const ref = made.ref!
    const s = moveOutlineVertex(made.station, ref, 2, { x: 220, y: 110 })
    const shape = s.assets.structures[0]!.shape!
    expect(shape.type).toBe('polygon')
    expect(shapePoints(shape)[2]).toEqual({ x: 220, y: 110 })

    const shifted = moveEntity(s, ref, 10, 5)
    expect(shapePoints(shifted.assets.structures[0]!.shape!)[0]).toEqual({ x: 110, y: 65 })
  })

  it('creates an L-shaped building', () => {
    const L = [
      { x: 0, y: 60 },
      { x: 60, y: 60 },
      { x: 60, y: 80 },
      { x: 30, y: 80 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ]
    const r = addStructureOutline(twoLines(), 'building', L)
    expect(shapePoints(r.station.assets.structures[0]!.shape!)).toEqual(L)
  })
})

describe('exact positions', () => {
  it('places a platform by its left / top edge', () => {
    const made = addPlatformOutline(twoLines(), [
      { x: 100, y: 10 },
      { x: 200, y: 10 },
      { x: 200, y: 30 },
    ])
    const s = placeEntity(made.station, made.ref!, { x: 50, y: 12 })
    expect(entityPosition(s, made.ref!)!.p).toEqual({ x: 50, y: 12 })
    expect(s.assets.platforms[0]!.polygon[1]).toEqual({ x: 150, y: 12 })
  })

  it('moves a signal only along its line', () => {
    const s = twoLines()
    const made = addSignal(s, s.tracks[0]!.id, 100, -10, 'starter')
    const moved = placeEntity(made.station, made.ref!, { x: 250, y: 999 })
    const sig = moved.assets.signals[0]!
    expect(sig.footX).toBe(250)
    expect(sig.side).toBe(made.station.assets.signals[0]!.side)
  })
})

describe('point machines', () => {
  it('moving the point moves its junction and label; moving the label leaves the junction', () => {
    const s = twoLines()
    const made = addPoint(s, { trackId: s.tracks[0]!.id, p: { x: 120, y: 0 } })
    const pm = made.station.assets.points[0]!
    const node = made.station.nodes.find((n) => n.id === pm.nodeId)!

    const body = moveEntity(made.station, made.ref!, 15, 0)
    expect(body.nodes.find((n) => n.id === pm.nodeId)!.x).toBe(node.x + 15)
    expect(body.assets.points[0]!.label.x).toBe(pm.label.x + 15)

    const label = moveEntity(made.station, made.ref!, 15, 0, { part: 'label' })
    expect(label.nodes.find((n) => n.id === pm.nodeId)!.x).toBe(node.x)
    expect(label.assets.points[0]!.label.x).toBe(pm.label.x + 15)
  })
})

describe('line splitting and merging', () => {
  it('splits one line into two and assigns assets by position', () => {
    const s = twoLines()
    const track = s.tracks[0]!
    const s1 = addJoint(s, track.id, 100).station
    const s2 = addJoint(s1, track.id, 300).station
    const split = splitTrack(s2, track.id, { x: 200, y: 0 })
    expect(split.station.tracks.filter((t) => t.nodeIds.length >= 2)).toHaveLength(3)
    const splitTrackResult = split.station.tracks.find((t) => t.id === track.id)!
    expect(splitTrackResult.nodeIds).toHaveLength(2)
    const right = split.station.tracks.find((t) => t.id !== track.id && t.id !== s.tracks[1]!.id)!
    expect(right.nodeIds.length).toBeGreaterThanOrEqual(2)
    expect(split.station.assets.joints.find((j) => j.trackId === track.id)?.x).toBe(100)
    expect(split.station.assets.joints.find((j) => j.trackId === right.id)?.x).toBe(300)
  })

  it('merges adjacent lines and preserves chosen properties', () => {
    let s = blankStation({ code: 'TST', name: 'Test' })
    s = addTrack(s, [{ p: { x: 0, y: 0 } }, { p: { x: 100, y: 0 } }], { kind: 'main', direction: 'UP' }).station
    s = addTrack(s, [{ p: { x: 100, y: 0 } }, { p: { x: 200, y: 0 } }], { kind: 'siding', direction: 'DN' }).station
    const [a, b] = s.tracks
    const result = mergeTracks(s, a!.id, b!.id, { name: 'b', kind: 'b', direction: 'b', lineNo: 'a', remarks: 'b' })
    expect(result.station.tracks).toHaveLength(1)
    expect(result.station.tracks[0]).toMatchObject({ id: a!.id, name: b!.name, kind: 'siding', direction: 'DN' })
  })
})

describe('moving to another line', () => {
  it('moves a signal to another line at the same place along the yard', () => {
    const s = twoLines()
    const made = addSignal(s, s.tracks[0]!.id, 100, -10, 'starter')
    const moved = moveToTrack(made.station, made.ref!, s.tracks[1]!.id)
    const sig = moved.assets.signals[0]!
    expect(sig.trackId).toBe(s.tracks[1]!.id)
    expect(sig.footX).toBe(100)
  })
})

describe('adding vertices to lines', () => {
  it('adds a bend inside the line and extends it beyond an end', () => {
    const s = twoLines()
    const t = s.tracks[0]!
    const bend = addTrackVertex(s, t.id, { x: 200, y: 0 })
    expect(bend.station.tracks[0]!.nodeIds).toHaveLength(3)

    const ext = addTrackVertex(s, t.id, { x: 500, y: 10 })
    const ids = ext.station.tracks[0]!.nodeIds
    expect(ids).toHaveLength(3)
    const last = ext.station.nodes.find((n) => n.id === ids[2])!
    expect(last).toMatchObject({ x: 500, y: 10, kind: 'boundary' })
    // The old end is now an ordinary bend.
    expect(ext.station.nodes.find((n) => n.id === ids[1])!.kind).toBe('plain')

    const before = addTrackVertex(s, t.id, { x: -50, y: 0 })
    expect(before.station.tracks[0]!.nodeIds).toHaveLength(3)
    expect(before.station.nodes.find((n) => n.id === before.station.tracks[0]!.nodeIds[0])!.x).toBe(-50)
  })
})

describe('sand hump end nodes', () => {
  /** Line 0 with its east end turned into a sand hump. */
  function withSandHump(): { s: Station; endId: string } {
    const s = twoLines()
    const endId = s.tracks[0]!.nodeIds[s.tracks[0]!.nodeIds.length - 1]!
    return { s: { ...s, nodes: s.nodes.map((n) => (n.id === endId ? { ...n, kind: 'sandHump' as const } : n)) }, endId }
  }

  it('keeps the sand hump at the end when the line is extended', () => {
    const { s, endId } = withSandHump()
    const ext = addTrackVertex(s, s.tracks[0]!.id, { x: 500, y: 0 })
    const ids = ext.station.tracks[0]!.nodeIds
    expect(ext.station.nodes.find((n) => n.id === ids[ids.length - 1])!.kind).toBe('sandHump')
    expect(ext.station.nodes.find((n) => n.id === endId)!.kind).toBe('plain')
  })

  it('flags a sand hump sitting inside a line', () => {
    const { s, endId } = withSandHump()
    const t = s.tracks[0]!
    const extra = { id: 'NX', x: 500, y: 0, kind: 'plain' as const }
    const bad: Station = { ...s, nodes: [...s.nodes, extra], tracks: s.tracks.map((x) => (x.id === t.id ? { ...x, nodeIds: [...x.nodeIds, 'NX'] } : x)) }
    expect(validateStation(bad).some((i) => i.code === 'track.end-inside' && i.message.includes(endId))).toBe(true)
  })

  it('becomes a junction once another line joins it', () => {
    const { s, endId } = withSandHump()
    const fixed = fixNodeKinds({ ...s, tracks: [...s.tracks, { id: 'TX', name: 'X', kind: 'siding', direction: 'BOTH', nodeIds: [endId, s.tracks[1]!.nodeIds[1]!] }] })
    expect(fixed.nodes.find((n) => n.id === endId)!.kind).toBe('junction')
  })
})
