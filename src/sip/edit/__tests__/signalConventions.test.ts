import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadStation, type Station } from '@/sip/model'
import { addBoundaryArrows, applySignalConventions, signalNumber } from '@/sip/edit/signalConventions'

const load = (file: string): Station => loadStation(JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8'))).station

describe('signal conventions', () => {
  it('matches the hand-corrected ryd-cyd sheet: odd east/above, even west/below', () => {
    for (const s of load('ryd-cyd.json').assets.signals) {
      const n = signalNumber(s.code)
      if (n === null) continue
      expect([s.code, s.headDir, s.side]).toEqual([s.code, n % 2 ? 'east' : 'west', n % 2 ? 'above' : 'below'])
    }
  })

  it('orients and names every numbered signal, and is idempotent', () => {
    const { station } = applySignalConventions(load('rydd.json'))
    for (const s of station.assets.signals) {
      const n = signalNumber(s.code)
      if (n === null) continue
      expect(s.headDir).toBe(n % 2 ? 'east' : 'west')
      expect(s.side).toBe(n % 2 ? 'above' : 'below')
      expect(Math.sign(s.anchorX - s.footX)).toBe(n % 2 ? 1 : -1)
    }
    const codes = new Map(station.assets.signals.map((s) => [s.id, s.code]))
    expect(codes.get('SIG_SH25_A_C') ?? [...codes.values()].find((c) => c.endsWith(' 25'))).toBe('SH25(A-C) 25')
    expect(applySignalConventions(station).changed).toEqual([])
  })

  it('puts an arrow near every boundary end once', () => {
    const once = addBoundaryArrows(load('rydd.json')).station
    expect(once.assets.lineArrows.length).toBeGreaterThan(0)
    expect(addBoundaryArrows(once).added).toEqual([])
  })
})
