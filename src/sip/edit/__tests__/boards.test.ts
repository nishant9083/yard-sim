import { describe, expect, it } from 'vitest'
import jrt from '@/sip/data/jrt.json'
import { bridgeTitle, loadStation, showsAspect, type Station } from '@/sip/model'
import { layoutStation } from '@/sip/layout'
import { DEFAULT_LAYERS, readCanvasTheme, renderStation, rotatedBox, signalGeometry, speedBoardTriangle, trackScreenAngle, type HitRegion } from '@/sip/render'
import { addBridge, addSignal, addTrack, blankStation, deleteEntity, splitTrack } from '@/sip/edit'
import { Network } from '@/sim/engine/network'
import { parseRcc } from '@/sim/rcc/parse'
import raw from '@/sim/data/jrt.rcc.json'
import cfg from '@/sim/data/jrt.sim.json'

/** A level line (y = 0) and a line that climbs from (0, 100) to (400, 0). */
function yard(): Station {
  let s = blankStation({ code: 'TST', name: 'Test' })
  s = addTrack(s, [{ p: { x: 0, y: 0 } }, { p: { x: 400, y: 0 } }], { kind: 'main', direction: 'BOTH' }).station
  s = addTrack(s, [{ p: { x: 0, y: 100 } }, { p: { x: 400, y: 0 } }], { kind: 'siding', direction: 'BOTH' }).station
  return s
}

const camera = { originX: 0, originY: 0, zoom: 1 }

/** Render to a canvas that records nothing, and return the click regions. */
function render(station: Station): HitRegion[] {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : key === 'measureText' ? () => ({ width: 10 }) : () => undefined),
    set: (target, key, value) => ((target[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
  return renderStation({
    ctx,
    layout: layoutStation(station, { yExaggeration: 1 }),
    camera,
    viewport: { width: 800, height: 600 },
    theme: readCanvasTheme(),
    state: { hovered: null, selected: null, layers: DEFAULT_LAYERS },
    dpr: 1,
  })
}

describe('speed restriction boards', () => {
  it('are numbered SB1, SB2 ... without using up signal numbers', () => {
    let s = yard()
    const level = s.tracks[0]!.id
    s = addSignal(s, level, 100, -10, 'speedBoard').station
    const board = s.assets.signals[0]!
    expect(board).toMatchObject({ code: 'SB1', kind: 'speedBoard', elements: [{ kind: 'speedBoard', limit: '30' }] })
    expect(board.control).toBeUndefined()
    expect(showsAspect(board)).toBe(false)

    s = addSignal(s, level, 200, -10, 'starter').station
    expect(s.assets.signals[1]!.code).toBe('1')
    s = addSignal(s, level, 300, -10, 'speedBoard').station
    expect(s.assets.signals[2]!.code).toBe('SB2')
  })

  it('point the way the head faces', () => {
    const part = { element: { kind: 'speedBoard' as const, limit: '30' }, cx: 100, cy: 50, w: 20 }
    const [eastApex, eastBase] = speedBoardTriangle(part, { r: 10, dir: 1 })
    expect(eastApex.x).toBeGreaterThan(eastBase.x)
    expect(eastApex.y).toBe(50)
    const [westApex, westBase] = speedBoardTriangle(part, { r: 10, dir: -1 })
    expect(westApex.x).toBeLessThan(westBase.x)
  })

  it('never become stop posts in the simulator', () => {
    const { station } = loadStation(jrt as never)
    const any = station.assets.signals.find(showsAspect)!
    const withBoard: Station = {
      ...station,
      assets: {
        ...station.assets,
        signals: [...station.assets.signals, { ...any, id: 'SB_T', code: 'SB1', kind: 'speedBoard', elements: [{ kind: 'speedBoard', limit: '30' }] }],
      },
    }
    const net = new Network(withBoard, cfg as never, parseRcc(raw as never))
    expect(net.posts.has(any.id)).toBe(true)
    expect(net.posts.has('SB_T')).toBe(false)
  })
})

describe('boards on a signal post', () => {
  it('hangs SL / DL and the loco pilot board from the wire, outward from the head', () => {
    let s = yard()
    s = addSignal(s, s.tracks[0]!.id, 200, -10, 'home').station
    const sig = s.assets.signals[0]!
    const layout = layoutStation(s, { yExaggeration: 1 })
    const plain = signalGeometry(layout, camera, sig)!
    const sl = signalGeometry(layout, camera, { ...sig, board: 'SL' })!
    const both = signalGeometry(layout, camera, { ...sig, board: 'SL', locoPilotBoard: true })!
    const lpOnly = signalGeometry(layout, camera, { ...sig, locoPilotBoard: true })!

    expect(plain.boards).toEqual([])
    expect(both.boards.map((b) => b.kind)).toEqual(['SL', 'LP'])
    expect(lpOnly.boards.map((b) => b.kind)).toEqual(['LP'])
    // Above the line (sgn -1): each board further up than the last, and the hit box grows to hold them.
    expect(both.boards[1]!.y).toBeLessThan(both.boards[0]!.y)
    expect(lpOnly.boards[0]!.y).toBe(sl.boards[0]!.y)
    expect(both.bbox.h).toBeGreaterThan(sl.bbox.h)
    expect(sl.bbox.h).toBeGreaterThan(plain.bbox.h)
  })
})

describe('level crossing gates', () => {
  it('are bridges of kind levelCrossing, titled LC', () => {
    const s = addBridge(yard(), 150, 'levelCrossing').station
    const lc = s.assets.bridges[0]!
    expect(lc.kind).toBe('levelCrossing')
    expect(lc.id.startsWith('LC')).toBe(true)
    expect(bridgeTitle({ ...lc, number: '15' })).toBe('LC 15')
    const br = addBridge(s, 250).station.assets.bridges[1]!
    expect(br.kind).toBeUndefined()
    expect(bridgeTitle({ ...br, number: '7', isNew: true })).toBe('BR 7 (NEW)')
  })
})

describe('crossings over chosen lines', () => {
  it('cross only the clicked line, and follow it through split and delete', () => {
    const s0 = yard()
    const [level, climb] = s0.tracks.map((t) => t.id)
    const all = addBridge(s0, 150, 'levelCrossing').station.assets.bridges[0]!
    expect(all.trackIds).toBeUndefined()

    let s = addBridge(s0, 300, 'levelCrossing', [level!]).station
    expect(s.assets.bridges[0]!.trackIds).toEqual([level])
    s = { ...s, assets: { ...s.assets, bridges: s.assets.bridges.map((b) => ({ ...b, trackIds: [level!, climb!] })) } }

    // Split the level line west of the crossing: the crossing follows the eastern half.
    s = splitTrack(s, level!, { x: 200, y: 0 }).station
    const east = s.tracks.find((t) => t.id !== level && t.id !== climb)!.id
    expect(s.assets.bridges[0]!.trackIds).toEqual([east, climb])

    // Deleting one chosen line keeps the crossing over the other; deleting the last removes it.
    s = deleteEntity(s, { type: 'track', id: climb! })
    expect(s.assets.bridges[0]!.trackIds).toEqual([east])
    s = deleteEntity(s, { type: 'track', id: east })
    expect(s.assets.bridges).toHaveLength(0)
  })
})

describe('symbols stand square to their line', () => {
  it('measures the slope of the line on screen', () => {
    const layout = layoutStation(yard(), { yExaggeration: 1 })
    const [level, climb] = layout.station.tracks
    expect(trackScreenAngle(layout, camera, level!.id, 200)).toBeCloseTo(0)
    // Climbs 100 over 400: up the screen, so a negative angle.
    expect(trackScreenAngle(layout, camera, climb!.id, 200)).toBeCloseTo(-Math.atan(100 / 400))
  })

  it('turns a signal post with the line', () => {
    let s = yard()
    s = addSignal(s, s.tracks[1]!.id, 200, 0, 'starter').station
    const layout = layoutStation(s, { yExaggeration: 1 })
    const g = signalGeometry(layout, camera, s.assets.signals[0]!)!
    expect(g.angle).toBeCloseTo(-Math.atan(100 / 400))
    // The hit box still contains the foot of the post.
    expect(g.foot.x).toBeGreaterThanOrEqual(g.bbox.x)
    expect(g.foot.x).toBeLessThanOrEqual(g.bbox.x + g.bbox.w)
  })

  it('turns posted boxes and crossings with a sloping line', () => {
    let s = yard()
    const climb = s.tracks[1]!.id
    s = addBridge(s, 300, 'levelCrossing', [climb]).station
    // A loco pilot board on a post, drawn just above the climbing line at x = 200 (line y = 50).
    s = {
      ...s,
      assets: {
        ...s.assets,
        structures: [{ id: 'SB', kind: 'locoPilotBoard', name: 'S.B.', shape: { type: 'rect', x0: 180, y0: 20, x1: 200, y1: 30 }, foot: { trackId: climb, x: 205 } }],
      },
    }
    const regions = render(s)
    const box = regions.find((r) => r.ref.type === 'structure')!
    // Level, the 22 x 13.6 px box would be boxed tightly; turned by ~14 degrees its bounding box grows.
    expect(box.w).toBeGreaterThan(23)
    expect(box.h).toBeGreaterThan(14)
    // The crossing over the single sloping line leans with it: its bounding box is wider than the upright one.
    const lc = regions.find((r) => r.ref.type === 'bridge')!
    const level = render(addBridge(yard(), 300, 'levelCrossing', [s.tracks[0]!.id]).station).find((r) => r.ref.type === 'bridge')!
    expect(lc.w).toBeGreaterThan(level.w + 5)
  })

  it('draws a posted box at a fixed rise and run from its foot, wherever it was stored', () => {
    const level = yard().tracks[0]!.id
    const at = (y0: number, x0: number) => {
      const s = yard()
      const st = { id: 'SB', kind: 'locoPilotBoard' as const, name: 'S.B.', shape: { type: 'rect' as const, x0, y0, x1: x0 + 20, y1: y0 + 10 }, foot: { trackId: level, x: 205 } }
      return render({ ...s, assets: { ...s.assets, structures: [st] } }).find((r) => r.ref.type === 'structure')!
    }
    // Near or far above the line, a little or a lot west of the foot: the same place on screen.
    const near = at(-20, 180)
    const far = at(-90, 100)
    expect(far).toEqual(near)
    // Stored below and east: mirrored on both axes about the foot.
    const below = at(30, 230)
    expect(below.y).toBeGreaterThan(0)
    expect(below.x).toBeGreaterThan(205)
  })

  it('boxes a turned rectangle', () => {
    const b = rotatedBox({ x: -10, y: -1, w: 20, h: 2 }, { x: 0, y: 0 }, Math.PI / 2)
    expect(b.w).toBeCloseTo(2)
    expect(b.h).toBeCloseTo(20)
  })
})
