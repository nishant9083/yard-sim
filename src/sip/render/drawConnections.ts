import { emphasisColor, tracePath } from './draw'
import { emphasisOf, type DrawArgs } from './types'

export function drawConnections({ ctx, layout, camera, theme, state }: DrawArgs): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  for (const { connection, points } of layout.connections) {
    const emphasis = emphasisOf(state, 'connection', connection.id)
    ctx.lineWidth = emphasis ? 4 : 2.6
    ctx.strokeStyle = emphasisColor(theme, emphasis, theme.connection)
    tracePath(ctx, camera, points)
    ctx.stroke()
  }
}
