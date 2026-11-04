import { worldToScreen } from './camera'
import { emphasisColor } from './draw'
import { emphasisOf, type DrawArgs } from './types'

export function drawNodes({ ctx, layout, camera, theme, state }: DrawArgs): void {
  ctx.setLineDash([])
  ctx.lineCap = 'butt'

  for (const laid of layout.nodes.values()) {
    const { node } = laid
    const s = worldToScreen(camera, laid)
    const trackIds = layout.nodeTrackIds.get(node.id) ?? []
    const viaTrack = trackIds.some((id) => emphasisOf(state, 'track', id) !== null)
    const emphasis = emphasisOf(state, 'node', node.id) ?? (viaTrack ? 'hovered' : null)

    if (node.kind === 'bufferStop' || node.kind === 'boundary') {
      // Bar across the line, perpendicular to the end tangent.
      const t = laid.tangent ?? { x: 1, y: 0 }
      const half = node.kind === 'bufferStop' ? 8 : 12
      ctx.lineWidth = node.kind === 'bufferStop' ? 4 : 2
      ctx.strokeStyle = emphasisColor(theme, emphasis, node.kind === 'bufferStop' ? theme.nodeEnd : theme.labelMuted)
      ctx.beginPath()
      ctx.moveTo(s.x - t.y * half, s.y + t.x * half)
      ctx.lineTo(s.x + t.y * half, s.y - t.x * half)
      ctx.stroke()
      continue
    }

    if (node.kind === 'junction' && state.layers.nodes) {
      ctx.fillStyle = emphasisColor(theme, emphasis, theme.nodeJunction)
      ctx.beginPath()
      ctx.arc(s.x, s.y, emphasis ? 4.5 : 3.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
