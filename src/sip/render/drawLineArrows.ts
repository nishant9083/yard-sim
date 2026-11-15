import { worldToScreen } from './camera'
import { line } from './draw'
import { emphasisOf, type DrawArgs } from './types'

/** Direction arrows on a line: "<", ">" or "<>" drawn along the line, wherever they were placed. */
export function drawLineArrows({ ctx, layout, camera, theme, state, regions }: DrawArgs): void {
  if (!state.layers.lineArrows) return
  ctx.setLineDash([])
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const half = Math.min(18, Math.max(11, camera.zoom * 14))
  const head = Math.min(7, Math.max(4.5, camera.zoom * 5))
  for (const arrow of layout.station.assets.lineArrows) {
    const y = layout.trackY(arrow.trackId, arrow.x)
    if (y === null) continue
    // Follow the line where it slopes: tangent from the track height just either side.
    const y0 = layout.trackY(arrow.trackId, arrow.x - 1) ?? y
    const y1 = layout.trackY(arrow.trackId, arrow.x + 1) ?? y
    const a = worldToScreen(camera, { x: arrow.x - 1, y: y0 })
    const b = worldToScreen(camera, { x: arrow.x + 1, y: y1 })
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    const c = worldToScreen(camera, { x: arrow.x, y })
    const emphasis = emphasisOf(state, 'lineArrow', arrow.id)
    ctx.lineWidth = emphasis ? 2.6 : 1.8
    ctx.strokeStyle = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.label
    const left = { x: c.x - ux * half, y: c.y - uy * half }
    const right = { x: c.x + ux * half, y: c.y + uy * half }
    line(ctx, left.x, left.y, right.x, right.y)
    // Open chevron whose tip is at `tip` and which opens away from `dir` (the way the arrow points).
    const chevron = (tip: { x: number; y: number }, dir: number) => {
      const bx = tip.x - ux * dir * head
      const by = tip.y - uy * dir * head
      const nx = -uy * head * 0.7
      const ny = ux * head * 0.7
      ctx.beginPath()
      ctx.moveTo(bx + nx, by + ny)
      ctx.lineTo(tip.x, tip.y)
      ctx.lineTo(bx - nx, by - ny)
      ctx.stroke()
    }
    if (arrow.direction !== 'right') chevron(left, -1)
    if (arrow.direction !== 'left') chevron(right, 1)
    const w = Math.abs(ux) * half + Math.abs(uy) * head
    const h = Math.abs(uy) * half + Math.abs(ux) * head
    regions.push({ ref: { type: 'lineArrow', id: arrow.id }, x: c.x - w - 2, y: c.y - h - 2, w: w * 2 + 4, h: h * 2 + 4 })
  }
}
