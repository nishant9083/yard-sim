import { describe, expect, it } from 'vitest'
import oec from '@/sip/data/oec.straight.json'
import { loadStation } from '@/sip/model'
import { Simulation } from '../engine/simulation'
import { Network } from '../engine/network'
import { parseRcc } from '../rcc/parse'
import { validateRcc } from '../validate/rccValidate'
import raw from '../data/oec.rcc.json'
import cfg from '../data/oec.sim.json'

const station = () => loadStation(oec as never).station
const make = () => new Simulation(station(), cfg as never, parseRcc(raw as never))

describe('OEC chart vs layout', () => {
  const rcc = parseRcc(raw as never)
  const { issues } = validateRcc(rcc, new Network(station(), cfg as never, rcc))
  it('reads every row of the chart', () => {
    expect(rcc.routes.length).toBe(188)
    expect(rcc.issues.filter((i) => i.level !== 'info')).toEqual([])
  })
  it('has no errors in the layout walk or the station references', () => {
    expect(issues.filter((i) => i.level === 'error').map((i) => `${i.code} ${i.where ?? ''} ${i.message}`)).toEqual([])
  })
})

describe('OEC simulation', () => {
  it('sets a main route, locks it and refuses a conflicting one', () => {
    const s = make()
    const r = s.dispatch({ type: 'setRoute', route: '1A' })
    expect(r.ok, r.reasons.join()).toBe(true)
    s.run(8)
    expect(s.signal('SIG_1_A_F').off).toBe(true)
    expect(s.dispatch({ type: 'setRoute', route: '1B' }).ok).toBe(false)
  })
})
