import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadStation, type Station } from '@/sip/model'
import { straightenStation } from '@/sip/edit/straighten'

const load = (file: string): Station => loadStation(JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8'))).station

describe('straightenStation', () => {
  const original = load('rydd.json')
  const { station, report } = straightenStation(original)
  const nodes = new Map(station.nodes.map((n) => [n.id, n]))
  const before = new Map(original.nodes.map((n) => [n.id, n]))

  it('produces a valid station with no new crossings', () => {
    expect(loadStation(station).issues.filter((i) => i.level === 'error')).toEqual([])
    expect(report.crossingsAfter).toBeLessThanOrEqual(report.crossingsBefore)
  })

  it('keeps every x and every referenced node', () => {
    for (const n of station.nodes) if (before.has(n.id)) expect(n.x).toBe(before.get(n.id)!.x)
    for (const c of station.connections) expect(nodes.has(c.from) && nodes.has(c.to)).toBe(true)
    for (const p of station.assets.points) expect(nodes.has(p.nodeId)).toBe(true)
    expect(station.assets.signals.map((s) => s.footX)).toEqual(original.assets.signals.map((s) => s.footX))
  })

  it('draws every track as level runs joined by at most one diagonal at each end', () => {
    for (const t of station.tracks) {
      const ys = t.nodeIds.map((id) => nodes.get(id)!.y)
      const inner = ys.slice(1, -1)
      // Interior vertices all sit on the line's lane.
      expect(new Set(inner).size).toBeLessThanOrEqual(1)
    }
  })
})
