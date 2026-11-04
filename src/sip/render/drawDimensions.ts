import { worldToScreen } from './camera'
import { arrowHead, line } from './draw'
import { emphasisOf, type DrawArgs } from './types'

/** Printed lengths: vertical track spacings and horizontal distances, with arrows at both ends. */
export function drawDimensions({ ctx, layout, camera, theme, state, placer, regions }: DrawArgs): void {
  if (!state.layers.dimensions) return
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
  for (const dim of layout.station.assets.dimensions) {
    const emphasis = emphasisOf(state, 'dimension', dim.id)
    const ink = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.dimension
    ctx.strokeStyle = ink
    ctx.fillStyle = ink
    ctx.lineWidth = emphasis ? 1.8 : 1

    if (dim.kind === 'vertical') {
      const a = worldToScreen(camera, layout.place({ x: dim.x, y: dim.y0 }))
      const b = worldToScreen(camera, layout.place({ x: dim.x, y: dim.y1 }))
      const len = b.y - a.y
      if (len < 7) continue
      line(ctx, a.x, a.y, b.x, b.y)
      line(ctx, a.x - 4, a.y, a.x + 4, a.y)
      line(ctx, b.x - 4, b.y, b.x + 4, b.y)
      if (len > 14) {
        arrowHead(ctx, a.x, a.y, 0, -1, 5)
        arrowHead(ctx, b.x, b.y, 0, 1, 5)
      }
      regions.push({ ref: { type: 'dimension', id: dim.id }, x: a.x - 5, y: a.y, w: 10, h: len })
      if (len > 22) {
        const at = dim.label ? worldToScreen(camera, layout.place(dim.label)) : { x: a.x - 7, y: (a.y + b.y) / 2 }
        placer.text(ctx, theme, dim.text, at.x, Math.min(Math.max(at.y, a.y + 14), b.y - 14), ink, {
          rotate: true,
          font: theme.fontSmall,
          height: 12,
          ref: { type: 'dimension', id: dim.id },
          regions,
          force: emphasis !== null,
        })
      }
      continue
    }

    const left = worldToScreen(camera, layout.place({ x: dim.x0, y: dim.y }))
    const right = worldToScreen(camera, layout.place({ x: dim.x1, y: dim.y }))
    if (right.x - left.x < 12) continue
    const worldY = layout.place({ x: 0, y: dim.y }).y

    // extension lines down to the nearest track at each end
    ctx.save()
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 0.8
    for (const x of [dim.x0, dim.x1]) {
      const near = layout.tracksAt(x).sort((p, q) => Math.abs(p.y - worldY) - Math.abs(q.y - worldY))[0]
      if (!near) continue
      const t = worldToScreen(camera, { x, y: near.y })
      const sx = worldToScreen(camera, { x, y: worldY }).x
      line(ctx, sx, left.y, sx, t.y)
    }
    ctx.restore()

    line(ctx, left.x, left.y, right.x, right.y)
    line(ctx, left.x, left.y - 5, left.x, left.y + 5)
    line(ctx, right.x, right.y - 5, right.x, right.y + 5)
    arrowHead(ctx, left.x, left.y, -1, 0, 6)
    arrowHead(ctx, right.x, right.y, 1, 0, 6)
    regions.push({ ref: { type: 'dimension', id: dim.id }, x: left.x, y: left.y - 5, w: right.x - left.x, h: 10 })
    const at = worldToScreen(camera, layout.place(dim.label))
    placer.text(ctx, theme, dim.text, Math.min(Math.max(at.x, left.x + 24), right.x - 24), left.y, ink, {
      font: '600 11px ui-sans-serif, system-ui, sans-serif',
      height: 13,
      ref: { type: 'dimension', id: dim.id },
      regions,
      force: true,
    })
  }
}
