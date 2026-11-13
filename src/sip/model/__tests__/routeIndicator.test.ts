import { describe, expect, it } from 'vitest'
import jrt from '@/sip/data/jrt.json'
import { loadStation, routeIndicatorRoutesOf, sortRoutes, type RouteIndicatorRoute } from '@/sip/model'
import { routeIndicatorArms } from '@/sip/render'

const part = (routes: RouteIndicatorRoute[]) => ({ element: { kind: 'routeIndicator' as const, routes }, cx: 100, cy: 50, w: 15 })
const ALL: RouteIndicatorRoute[] = ['left', 'upperLeft', 'upperRight', 'right']

describe('route indicator arms', () => {
  it('draws |<| for a head facing east: left up, diagonals outward, right down', () => {
    const arms = Object.fromEntries(routeIndicatorArms(part(ALL), { r: 10, dir: 1 }).map((a) => [a.route, a]))
    const pivot = { x: 92.5, y: 50 }
    for (const a of Object.values(arms)) expect(a.from).toEqual(pivot)
    expect(arms.left!.to.x).toBe(pivot.x)
    expect(arms.left!.to.y).toBeLessThan(50)
    expect(arms.right!.to.x).toBe(pivot.x)
    expect(arms.right!.to.y).toBeGreaterThan(50)
    expect(arms.upperLeft!.to.x).toBeGreaterThan(pivot.x)
    expect(arms.upperLeft!.to.y).toBeLessThan(50)
    expect(arms.upperRight!.to.x).toBeGreaterThan(pivot.x)
    expect(arms.upperRight!.to.y).toBeGreaterThan(50)
  })

  it('draws the mirror |>| for a head facing west', () => {
    const arms = Object.fromEntries(routeIndicatorArms(part(ALL), { r: 10, dir: -1 }).map((a) => [a.route, a]))
    const pivot = { x: 107.5, y: 50 }
    expect(arms.left!.from).toEqual(pivot)
    expect(arms.left!.to.y).toBeGreaterThan(50)
    expect(arms.right!.to.y).toBeLessThan(50)
    expect(arms.upperLeft!.to.x).toBeLessThan(pivot.x)
    expect(arms.upperLeft!.to.y).toBeGreaterThan(50)
    expect(arms.upperRight!.to.y).toBeLessThan(50)
  })

  it('draws only the arms the indicator has', () => {
    expect(routeIndicatorArms(part(['left', 'upperLeft']), { r: 10, dir: 1 }).map((a) => a.route)).toEqual(['left', 'upperLeft'])
  })

  it('keeps arms distinct and in order', () => {
    expect(sortRoutes(['right', 'left', 'right', 'upperRight'])).toEqual(['left', 'upperRight', 'right'])
  })
})

describe('reading stored route indicators', () => {
  it('reads current data', () => {
    expect(routeIndicatorRoutesOf({ routes: ['right', 'left', 'bogus'] }, 'east')).toEqual(['left', 'right'])
  })

  it('reads older data so the same lines are drawn as before', () => {
    expect(routeIndicatorRoutesOf({}, 'east')).toEqual(['upperLeft', 'upperRight'])
    expect(routeIndicatorRoutesOf({ direction: 'both' }, 'west')).toEqual(['upperLeft', 'upperRight'])
    expect(routeIndicatorRoutesOf({ direction: 'left' }, 'west')).toEqual(['upperLeft'])
    expect(routeIndicatorRoutesOf({ direction: 'right' }, 'east')).toEqual(['upperRight'])
    // Drawn-leg names: upleft / downright = upper diagonal, upright / downleft = lower diagonal.
    expect(routeIndicatorRoutesOf({ direction: 'upleft' }, 'east')).toEqual(['upperLeft'])
    expect(routeIndicatorRoutesOf({ direction: 'downright' }, 'west')).toEqual(['upperRight'])
    expect(routeIndicatorRoutesOf({ direction: 'upright' }, 'east')).toEqual(['upperRight'])
    expect(routeIndicatorRoutesOf({ direction: 'downleft' }, 'west')).toEqual(['upperLeft'])
    expect(routeIndicatorRoutesOf({ routes: [] }, 'east')).toEqual(['upperLeft', 'upperRight'])
  })

  it('loads an old station file into arms', () => {
    const raw = structuredClone(jrt) as { assets: { signals: { code: string; elements: Record<string, unknown>[] }[] } }
    const sig = raw.assets.signals.find((s) => s.code === '13')!
    const i = sig.elements.findIndex((e) => e.kind === 'routeIndicator')
    sig.elements[i] = { kind: 'routeIndicator', direction: 'upleft' }
    const loaded = loadStation(raw).station.assets.signals.find((s) => s.code === '13')!
    expect(loaded.headDir).toBe('east')
    expect(loaded.elements[i]).toEqual({ kind: 'routeIndicator', routes: ['upperLeft'] })
  })

  it('bundled stations carry arms', () => {
    for (const s of loadStation(jrt).station.assets.signals) {
      for (const e of s.elements) if (e.kind === 'routeIndicator') expect(e.routes.length).toBeGreaterThan(0)
    }
  })
})
