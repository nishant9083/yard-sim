import { worldToScreen } from './camera'
import { emphasisOf, type DrawArgs } from './types'

/** Point machines: a ring at the toe and the code where the SIP prints it. */
export function drawPoints({ ctx, layout, camera, theme, state, placer, regions }: DrawArgs): void {
  if (!state.layers.points) return
  ctx.setLineDash([])
  const showRatio = camera.zoom >= 0.7
  for (const point of layout.station.assets.points) {
    const node = layout.nodes.get(point.nodeId)
    if (!node) continue
    const emphasis = emphasisOf(state, 'point', point.id)
    const colour = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.point
    const s = worldToScreen(camera, node)
    ctx.lineWidth = emphasis ? 2.4 : 1.6
    ctx.strokeStyle = colour
    ctx.fillStyle = theme.background
    ctx.beginPath()
    ctx.arc(s.x, s.y, emphasis ? 5.2 : 3.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    regions.push({ ref: { type: 'point', id: point.id }, x: s.x - 6, y: s.y - 6, w: 12, h: 12 })

    const at = worldToScreen(camera, layout.place(point.label))
    placer.text(ctx, theme, point.code, at.x, at.y, colour, {
      font: '600 11.5px ui-sans-serif, system-ui, sans-serif',
      height: 13,
      ref: { type: 'point', id: point.id },
      regions,
      force: emphasis !== null,
    })
    if (showRatio) {
      const ratio = `${point.ratioInferred ? '(' : ''}${point.ratio} ${point.switch}${point.ratioInferred ? ')' : ''}`
      placer.text(ctx, theme, ratio, at.x, at.y + 12, theme.labelMuted, { font: theme.fontSmall, height: 12 })
    }
  }
}
