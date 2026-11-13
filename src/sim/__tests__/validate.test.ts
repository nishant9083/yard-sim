import { describe, expect, it } from 'vitest'
import jrt from '@/sip/data/jrt.json'
import { loadStation } from '@/sip/model'
import { Network } from '../engine/network'
import { parseRcc } from '../rcc/parse'
import { validateRcc } from '../validate/rccValidate'
import raw from '../data/jrt.rcc.json'
import cfg from '../data/jrt.sim.json'

describe('JRT chart vs layout', () => {
  const station = loadStation(jrt as never).station
  const rcc = parseRcc(raw as never)
  const net = new Network(station, cfg as never, rcc)
  const { issues, walks } = validateRcc(rcc, net)
  it('report', () => {
    for (const i of issues) console.log(`${i.level.toUpperCase()} ${i.code} ${i.where ?? ''} :: ${i.message}`)
    console.log('walked', walks.size, 'of', rcc.routes.length)
    expect(rcc.routes.length).toBe(30)
  })
})
