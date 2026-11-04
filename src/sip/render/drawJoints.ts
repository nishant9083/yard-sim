import { worldToScreen } from './camera'
import { line } from './draw'
import { emphasisOf, type DrawArgs } from './types'

/** Insulated joints: a short cross-bar on the rail. */
export function drawJoints({ ctx, layout, camera, theme, state, regions }: DrawArgs): void {
  if (!state.layers.joints) return
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
  const half = Math.min(9, Math.max(5, camera.zoom * 7))
  for (const joint of layout.station.assets.joints) {
    const y = layout.trackY(joint.trackId, joint.x)
    if (y === null) continue
    const s = worldToScreen(camera, { x: joint.x, y })
    const emphasis = emphasisOf(state, 'joint', joint.id)
    ctx.lineWidth = emphasis ? 3.4 : 2.2
    ctx.strokeStyle = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.joint
    line(ctx, s.x, s.y - half, s.x, s.y + half)
    regions.push({ ref: { type: 'joint', id: joint.id }, x: s.x - 4, y: s.y - half, w: 8, h: half * 2 })
  }
}
