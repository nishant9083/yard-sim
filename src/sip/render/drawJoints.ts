import { worldToScreen } from './camera'
import { line } from './draw'
import { trackScreenAngle } from './trackAngle'
import { emphasisOf, type DrawArgs } from './types'

/** Insulated joints: a short cross-bar on the rail, square to the line wherever it slopes. */
export function drawJoints({ ctx, layout, camera, theme, state, regions }: DrawArgs): void {
  if (!state.layers.joints) return
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
  const half = Math.min(9, Math.max(5, camera.zoom * 7))
  for (const joint of layout.station.assets.joints) {
    const y = layout.trackY(joint.trackId, joint.x)
    if (y === null) continue
    const s = worldToScreen(camera, { x: joint.x, y })
    const angle = trackScreenAngle(layout, camera, joint.trackId, joint.x)
    // Normal to the line: the east direction turned a quarter.
    const nx = -Math.sin(angle) * half
    const ny = Math.cos(angle) * half
    const emphasis = emphasisOf(state, 'joint', joint.id)
    ctx.lineWidth = emphasis ? 3.4 : 2.2
    ctx.strokeStyle = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.joint
    line(ctx, s.x - nx, s.y - ny, s.x + nx, s.y + ny)
    const w = Math.max(4, Math.abs(nx))
    const h = Math.abs(ny)
    regions.push({ ref: { type: 'joint', id: joint.id }, x: s.x - w, y: s.y - h, w: w * 2, h: h * 2 })
  }
}
