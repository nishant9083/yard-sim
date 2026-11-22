import { describe, expect, it } from 'vitest'
import { destinationPostOf, expandRouteName, parseControls, parseRouteName, parseRouteTokens, parseTcList, parseRcc } from '../rcc/parse'
import type { RawRcc } from '../rcc/types'

/** The chart grammar the parser accepts, independent of any station. */
describe('route names', () => {
  it('reads main, calling-on, shunt, starter and slot names in any punctuation', () => {
    expect(parseRouteName('1A')).toMatchObject({ prefix: 'S', num: '1', letters: 'A' })
    expect(parseRouteName('C-1A')).toMatchObject({ prefix: 'C', num: '1', letters: 'A' })
    expect(parseRouteName('C3M')).toMatchObject({ prefix: 'C', num: '3', letters: 'M' })
    expect(parseRouteName('SH42B')).toMatchObject({ prefix: 'SH', num: '42', letters: 'B' })
    expect(parseRouteName('S17')).toMatchObject({ prefix: 'S', num: '17', letters: '' })
    expect(parseRouteName('42A')).toMatchObject({ prefix: 'S', num: '42', letters: 'A' })
    for (const s of ['SL71', 'SLOT-71', 'SLOT- 71', 'slot 71']) expect(parseRouteName(s)).toMatchObject({ prefix: 'SLOT', num: '71' })
    expect(parseRouteName('LINE 5')).toBeNull()
  })
  it('expands lock lists', () => {
    expect(expandRouteName('C-1A/B/C')).toEqual(['C1A', 'C1B', 'C1C'])
    expect(expandRouteName('42A/B')).toEqual(['42A', '42B'])
    expect(expandRouteName('SH4C/D')).toEqual(['SH4C', 'SH4D'])
    expect(expandRouteName('17')).toEqual(['17'])
    expect(expandRouteName('SL73')).toEqual(['SLOT-73'])
    const { tokens, unknown } = parseRouteTokens('(1A SET TO M/L). 1B/C. C-1A/B. 3A 3B SH9A SH42A 28 SLOT-71 SL72.')
    expect(unknown).toEqual([])
    expect(tokens.map((t) => t.name)).toEqual(['1A', '1B', '1C', 'C1A', 'C1B', '3A', '3B', 'SH9A', 'SH42A', '28', 'SLOT-71', 'SLOT-72'])
  })
})

describe('cells', () => {
  it('reads controls written with or without IN', () => {
    expect(parseControls('CH1IN. CH2IN.')).toEqual(['CH1', 'CH2'])
    expect(parseControls('CH3. CH4. CH15')).toEqual(['CH3', 'CH4', 'CH15'])
    expect(parseControls('CH4IN. CONT.37 IN.')).toEqual(['CH4', 'CONT.37'])
  })
  it('keeps hyphenated circuit codes whole', () => {
    expect(parseTcList('102/104AXT. BULB-XT').tcs).toEqual(['102/104AXT', 'BULB-XT'])
    expect(parseTcList('103BXT. OR 9AXT').anyOf).toBe(true)
    expect(parseTcList('140XT. (144XT)').tcs).toEqual(['140XT'])
  })
  it('names the destination post, with a qualifier for other cabins', () => {
    expect(destinationPostOf('S11')).toBe('11')
    expect(destinationPostOf('S-25')).toBe('25')
    expect(destinationPostOf('SS19')).toBe('19')
    expect(destinationPostOf('SH9')).toBe('9')
    expect(destinationPostOf("S6 OF 'F' CABIN")).toBe('6@F')
    expect(destinationPostOf("SH18 OF 'E' CABIN")).toBe('18@E')
    expect(destinationPostOf('S15 OF VPT R&D YARD')).toBe('15@VPT')
    expect(destinationPostOf('SS4 OF DUMPER CABIN')).toBe('4@DUMPER')
    for (const t of ['DE', 'SB', 'MVG UP HOME', '']) expect(destinationPostOf(t)).toBeNull()
  })
})

const row = (over: Partial<RawRcc['routes'][number]>): RawRcc['routes'][number] => ({
  sl: 1, sig: 'S1', route: '1A', dest: 'SS19', vdu: '', ptsRoute: '111N. 113R', ptsOverlap: '', isolation: '', tcRoute: '111BXT. 113XT', tcOverlap: '',
  controls: 'CH3. CH4', approach: 'DEAD APPROACH', backLock: '111BXT', ovCleared: '', ovOccupied: '', locksRoutes: '1B 1C', locksOverlaps: '', remarks: '', ...over,
})

describe('remarks', () => {
  const parse = (remarks: string) => parseRcc({ station: 'X', routes: [row({ remarks }), row({ sl: 2, route: '1B' }), row({ sl: 3, route: '1C' })], pointChart: [], handleChart: [] }).routes[0]!
  it('reads bullets joined by ".. " and the lamp state of the destination', () => {
    const r = parse("S1 & SS19 ARE RED.. SH9 IS LIT.. SLOT-1 OF 'F' CABIN IS. NOT RECEIVED.")
    expect(r.protections).toEqual([{ post: '1', kind: 'red' }, { post: '19', kind: 'red' }, { post: '9', kind: 'noLight' }])
  })
  it('reads fly-back, release delay and calling-on timer across line breaks', () => {
    const r = parse('SIGNAL FLY BACK AFTER. 3 SEC ON OCCUPATION OF. REPLACEMENT TRACK.. AUTOMATIC ROUTE. RELEASES AFTER. 30 SEC ON CLEARANCE. OF 103BXT.')
    expect(r.flyBack).toEqual({ tc: null, seconds: 3 })
    expect(r.releaseDelaySeconds).toBe(30)
    expect(parse('CLEARS AFTER 1 MINUTE. ON OCCUPATION OF. 1AXT.').clearAfter).toEqual({ tc: '1AXT', seconds: 60 })
  })
  it('classifies rows', () => {
    const t = parseRcc({ station: 'X', routes: [row({}), row({ sl: 2, sig: 'C1', route: 'C1A' }), row({ sl: 3, sig: 'SH1', route: 'SH1A' }), row({ sl: 4, sig: 'SLOT- 71', route: 'SL71', ptsRoute: '', backLock: '' }), row({ sl: 5, sig: 'S42', route: '42A', dest: "S6 OF 'F' CABIN" })], pointChart: [], handleChart: [] })
    expect(t.routes.map((r) => [r.id, r.kind, r.post, r.destinationPost])).toEqual([
      ['1A', 'main', '1', '19'],
      ['C1A', 'callingOn', '1', '19'],
      ['SH1A', 'shunt', '1', '19'],
      ['SLOT-71', 'slot', 'SLOT-71', '19'],
      ['42A', 'main', '42', '6@F'],
    ])
  })
})
