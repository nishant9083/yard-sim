import type { Point, Track } from '@/sip/model'
import { polylineLength, polylineMidpoint } from '@/sip/layout'
import { worldToScreen, type Camera } from './camera'
import type { DrawArgs } from './types'

/** Midpoint of the longest near-horizontal segment, in screen space. */
function labelSpot(points: Point[], camera: Camera, minLength: number): Point | null {
  let best: { len: number; at: Point } | null = null
  for (let i = 1; i < points.length; i++) {
    const a = worldToScreen(camera, points[i - 1]!)
    const b = worldToScreen(camera, points[i]!)
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    if (dy > dx * 0.25) continue
    if (!best || dx > best.len) best = { len: dx, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }
  return best && best.len >= minLength ? best.at : null
}

/** Track names (with the clear standing length), end labels, connection labels and node ids. */
export function drawLabels({ ctx, layout, camera, theme, state, placer }: DrawArgs): void {
  const { layers } = state
  ctx.setLineDash([])
  const csl = new Map(layout.station.info.lines.map((l) => [l.track, l.cslM]))
  const trackLabel = (t: Track): string => {
    const base = t.lineNo ? `LINE ${t.lineNo}  ${t.name}` : t.name
    const m = csl.get(t.id)
    return m ? `${base}  ·  CSL ${m}M` : base
  }

  if (layers.trackLabels) {
    ctx.font = theme.font
    for (const { track, points } of layout.tracks) {
      const text = trackLabel(track)
      const spot = labelSpot(points, camera, ctx.measureText(text).width + 28)
      if (spot) placer.text(ctx, theme, text, spot.x, spot.y - 13, theme.label, { font: theme.font, height: 14 })
    }
    for (const laid of layout.nodes.values()) {
      const { node, tangent } = laid
      if (!node.label || (node.kind !== 'boundary' && node.kind !== 'bufferStop')) continue
      const s = worldToScreen(camera, laid)
      const dir = tangent?.x ?? 1
      placer.text(ctx, theme, node.label, s.x + (dir >= 0 ? 16 : -16), s.y, theme.labelMuted, {
        font: theme.font,
        height: 14,
        align: dir >= 0 ? 'left' : 'right',
      })
    }
  }

  if (layers.connectionLabels) {
    ctx.font = theme.font
    for (const { connection, points } of layout.connections) {
      if (!connection.label) continue
      const screenLen = polylineLength(points) * camera.zoom
      if (screenLen < ctx.measureText(connection.label).width + 16) continue
      const mid = worldToScreen(camera, polylineMidpoint(points))
      placer.text(ctx, theme, connection.label, mid.x + 8, mid.y + 12, theme.nodeJunction, { align: 'left', font: theme.font, height: 14 })
    }
  }

  if (layers.nodeLabels) {
    for (const laid of layout.nodes.values()) {
      if (laid.node.kind !== 'junction') continue
      const s = worldToScreen(camera, laid)
      placer.text(ctx, theme, laid.node.id, s.x + 5, s.y - 9, theme.labelMuted, { align: 'left', font: theme.font, height: 14 })
    }
  }
}
