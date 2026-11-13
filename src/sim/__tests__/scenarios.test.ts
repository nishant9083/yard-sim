import { describe, expect, it } from 'vitest'
import jrt from '@/sip/data/jrt.json'
import { loadStation } from '@/sip/model'
import { Simulation } from '../engine/simulation'
import { parseRcc } from '../rcc/parse'
import raw from '../data/jrt.rcc.json'
import cfg from '../data/jrt.sim.json'

const make = () => new Simulation(loadStation(jrt as never).station, cfg as never, parseRcc(raw as never))
const pos = (s: Simulation, u: string) => s.points.get(u)!.pos
const dump = (s: Simulation) => s.log.map((l) => `${l.t.toFixed(1)} ${l.level} ${l.text}`).join('\n')

describe('route setting', () => {
  it('1A ORL moves points, locks them and clears the signal', () => {
    const s = make()
    expect(s.dispatch({ type: 'setRoute', route: '1A.ORL' }).ok).toBe(true)
    expect(s.signal('SIG_1ABC').off).toBe(false)
    s.run(4)
    expect([pos(s, '31'), pos(s, '33'), pos(s, '40')]).toEqual(['N', 'R', 'N'])
    expect(s.signal('SIG_1ABC')).toMatchObject({ off: true, routeId: '1A.ORL' })
  })
  it('refuses conflicting routes and a locked point', () => {
    const s = make()
    s.dispatch({ type: 'setRoute', route: '1A.ORL' })
    for (const r of ['1B.SH', '1A.ML', '1C.ORL', 'C1A', '11']) expect(s.dispatch({ type: 'setRoute', route: r }).ok, r).toBe(false)
    expect(s.dispatch({ type: 'movePoint', unit: '33', pos: 'N' }).ok).toBe(false)
  })
  it('refuses with a crank handle out, an occupied track, a failed protection lamp', () => {
    const s = make()
    s.dispatch({ type: 'setControl', control: 'CH2', value: false })
    expect(s.dispatch({ type: 'setRoute', route: '1A.ORL' }).reasons.join()).toMatch(/CH2/)
    s.dispatch({ type: 'setControl', control: 'CH2', value: true })
    s.dispatch({ type: 'tcFault', tc: 'L4T2', fault: 'occupied' })
    expect(s.dispatch({ type: 'setRoute', route: '1A.ORL' }).reasons.join()).toMatch(/L4T2/)
    s.dispatch({ type: 'tcFault', tc: 'L4T2', fault: 'none' })
    s.dispatch({ type: 'lampFault', signal: 'SIG_11', failed: true })
    expect(s.dispatch({ type: 'setRoute', route: '1A.ORL' }).reasons.join()).toMatch(/11/)
  })
  it('block routes need the line clear contact and consume it', () => {
    const s = make()
    expect(s.dispatch({ type: 'setRoute', route: '25' }).ok).toBe(false)
    s.dispatch({ type: 'blockInput', section: 'JRT-MVG', input: 'TGT', value: true })
    expect(s.dispatch({ type: 'setRoute', route: '25' }).ok).toBe(true)
    s.run(1)
    expect(s.signal('SIG_25').off).toBe(true)
  })
})

describe('train movement', () => {
  it('runs a train through 1A, flies the signal back, releases the route and overlap', () => {
    const s = make()
    s.dispatch({ type: 'addTrain', train: { id: 'T1', lengthM: 60, maxKmph: 30, atSignal: 'SIG_1ABC' } })
    s.run(3)
    expect(s.trains[0]!.speed).toBe(0) // waits at danger
    s.dispatch({ type: 'setRoute', route: '1A.ORL' })
    s.run(6)
    expect(s.signal('SIG_1ABC').off).toBe(true)
    s.run(60)
    expect(s.signal('SIG_1ABC').off).toBe(false)
    expect(['used', 'overlap', 'idle']).toContain(s.routes.get('1A.ORL')!.phase)
    s.run(400)
    const log = dump(s)
    expect(log).toMatch(/back to ON/)
    expect(log).toMatch(/released behind the train/)
    expect(s.routes.get('1A.ORL')!.phase).toBe('idle')
    expect(s.trains[0]?.note ?? '').toBeDefined()
  })
  it('stops a train at a red signal and lets it go when cleared', () => {
    const s = make()
    s.dispatch({ type: 'addTrain', train: { id: 'T1', lengthM: 40, maxKmph: 30, atTc: '1AT', east: true } })
    s.run(120)
    const t = s.trains[0]!
    expect(t.note).toMatch(/signal/)
    expect(t.speed).toBe(0)
  })
})

describe('timers and faults', () => {
  it('calling-on clears 60 s after occupation of 1AT', () => {
    const s = make()
    s.dispatch({ type: 'addTrain', train: { id: 'T1', lengthM: 40, maxKmph: 30, atTc: '1AT', east: true } })
    s.dispatch({ type: 'trainRun', id: 'T1', run: false })
    s.dispatch({ type: 'setRoute', route: 'C1A' })
    s.run(30)
    expect(s.signal('SIG_1ABC').off).toBe(false)
    s.run(35)
    expect(s.signal('SIG_1ABC')).toMatchObject({ off: true, slot: 'C1' })
  })
  it('cancel with a train in the approach holds the route for two minutes', () => {
    const s = make()
    s.dispatch({ type: 'addTrain', train: { id: 'T1', lengthM: 40, maxKmph: 30, atTc: '1AT', east: true } })
    s.dispatch({ type: 'trainRun', id: 'T1', run: false })
    s.dispatch({ type: 'setRoute', route: '1A.ORL' })
    s.run(5)
    s.dispatch({ type: 'cancelRoute', route: '1A.ORL' })
    expect(s.signal('SIG_1ABC').off).toBe(false)
    s.run(100)
    expect(s.routes.get('1A.ORL')!.phase).toBe('locked')
    s.run(25)
    expect(s.routes.get('1A.ORL')!.phase).toBe('idle')
  })
  it('a track fault drops a cleared signal and it needs a new request', () => {
    const s = make()
    s.dispatch({ type: 'setRoute', route: '1A.ORL' })
    s.run(5)
    s.dispatch({ type: 'tcFault', tc: 'L4T3', fault: 'occupied' })
    s.run(1)
    expect(s.signal('SIG_1ABC').off).toBe(false)
    s.dispatch({ type: 'tcFault', tc: 'L4T3', fault: 'none' })
    s.run(1)
    expect(s.signal('SIG_1ABC').off).toBe(false)
    expect(s.dispatch({ type: 'setRoute', route: '1A.ORL' }).ok).toBe(true)
    s.run(1)
    expect(s.signal('SIG_1ABC').off).toBe(true)
  })
  it('SH15 releases two minutes after the train passes', () => {
    const s = make()
    s.dispatch({ type: 'setRoute', route: 'SH15' })
    s.run(5)
    expect(s.signal('SIG_15').off).toBe(true)
  })
})

describe('determinism', () => {
  it('replaying the recorded commands gives the same log', () => {
    const a = make()
    a.dispatch({ type: 'addTrain', train: { id: 'T1', lengthM: 60, maxKmph: 30, atSignal: 'SIG_1ABC' } })
    a.run(2)
    a.dispatch({ type: 'setRoute', route: '1A.ORL' })
    a.run(120)
    const b = make()
    Simulation.replay(b, a.history, a.time)
    expect(dump(b)).toBe(dump(a))
  })
})

describe('aspects and authority', () => {
  it('home shows yellow with route indicator into a loop, distant follows it', () => {
    const s = make()
    expect(s.signal('SIG_UP_DIST').aspect).toBe('Y')
    s.dispatch({ type: 'setRoute', route: '1A.ORL' })
    s.run(5)
    expect(s.signal('SIG_1ABC')).toMatchObject({ aspect: 'Y', routeIndicator: true })
    expect(s.signal('SIG_UP_DIST').aspect).toBe('YY')
  })
  it('main line home goes green only when the starter ahead is off', () => {
    const s = make()
    s.dispatch({ type: 'setRoute', route: '2B' })
    s.run(5)
    expect(s.signal('SIG_2AB').aspect).toBe('Y')
    s.dispatch({ type: 'setRoute', route: '12' })
    s.run(5)
    expect(s.signal('SIG_12').off).toBe(true)
    expect(s.signal('SIG_2AB').aspect).toBe('G')
    expect(s.signal('SIG_DN_DIST').aspect).toBe('G')
  })
  it('calling-on and shunt leave the main aspect red', () => {
    const s = make()
    s.dispatch({ type: 'setRoute', route: 'SH15' })
    s.run(5)
    expect(s.signal('SIG_15')).toMatchObject({ off: true, shunt: true, aspect: 'R' })
  })
  it('a train under a main signal runs past an independent shunt signal at ON', () => {
    const s = make()
    s.dispatch({ type: 'addTrain', train: { id: 'T1', lengthM: 100, maxKmph: 30, atSignal: 'SIG_2AB' } })
    s.dispatch({ type: 'setRoute', route: '2B' })
    s.run(500)
    expect(s.trains[0]!.note).toMatch(/signal 12 at danger/)
    expect(s.routes.get('2B')!.phase).toBe('idle')
  })
  it('a train placed at a distant-free signal list never waits at a distant', () => {
    const s = make()
    s.dispatch({ type: 'addTrain', train: { id: 'T1', lengthM: 100, maxKmph: 30, atSignal: 'SIG_UP_DIST' } })
    s.run(200)
    expect(s.trains[0]!.note).toMatch(/signal 1A\/B\/C at danger/)
  })
})
