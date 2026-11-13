import { shapeCentre, type EntityRef, type Point } from '@/sip/model'
import type { StationLayout } from './layoutStation'

/** A representative world position for an entity, used to centre the camera on it. */
export function entityAnchor(layout: StationLayout, ref: EntityRef): Point | null {
  const { assets } = layout.station
  const at = (x: number, trackId: string): Point | null => {
    const y = layout.trackY(trackId, x)
    return y === null ? null : { x, y }
  }
  switch (ref.type) {
    case 'node':
      return layout.nodes.get(ref.id) ?? null
    case 'track': {
      const t = layout.tracks.find((t) => t.track.id === ref.id)
      return t ? (t.points[Math.floor(t.points.length / 2)] ?? null) : null
    }
    case 'connection': {
      const c = layout.connections.find((c) => c.connection.id === ref.id)
      return c ? (c.points[Math.floor(c.points.length / 2)] ?? null) : null
    }
    case 'point': {
      const p = assets.points.find((p) => p.id === ref.id)
      return p ? (layout.nodes.get(p.nodeId) ?? null) : null
    }
    case 'signal': {
      const s = assets.signals.find((s) => s.id === ref.id)
      return s ? at(s.footX, s.trackId) : null
    }
    case 'trackCircuit': {
      const tc = assets.trackCircuits.find((t) => t.id === ref.id)
      return tc ? layout.place(tc.label) : null
    }
    case 'joint': {
      const j = assets.joints.find((j) => j.id === ref.id)
      return j ? at(j.x, j.trackId) : null
    }
    case 'platform': {
      const p = assets.platforms.find((p) => p.id === ref.id)
      return p ? layout.place(p.label) : null
    }
    case 'structure': {
      const s = assets.structures.find((s) => s.id === ref.id)
      if (!s) return null
      if (s.shape) return layout.place(shapeCentre(s.shape))
      const pos = s.at ?? s.foot
      return pos ? at(pos.x, pos.trackId) : null
    }
    case 'bridge': {
      const b = assets.bridges.find((b) => b.id === ref.id)
      if (!b) return null
      const ys = layout.tracksAt(b.x).map((t) => t.y)
      return { x: b.x, y: ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0 }
    }
    case 'dimension': {
      const d = assets.dimensions.find((d) => d.id === ref.id)
      if (!d) return null
      return d.kind === 'vertical'
        ? layout.place({ x: d.x, y: (d.y0 + d.y1) / 2 })
        : layout.place({ x: (d.x0 + d.x1) / 2, y: d.y })
    }
    case 'chainageMark': {
      const m = assets.chainageMarks.find((m) => m.id === ref.id)
      return m ? { x: m.x, y: m.lane === 'top' ? layout.bounds.minY : layout.bounds.maxY } : null
    }
    case 'annotation': {
      const a = assets.annotations.find((a) => a.id === ref.id)
      return a ? layout.place(a) : null
    }
    case 'gradient': {
      const g = assets.gradients.find((g) => g.id === ref.id)
      return g ? { x: g.x, y: g.direction === 'DN' ? layout.bounds.maxY : layout.bounds.minY } : null
    }
  }
}
