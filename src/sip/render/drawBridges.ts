import { worldToScreen } from './camera'
import { line } from './draw'
import { emphasisOf, type DrawArgs } from './types'

/** Bridges and culverts: a dashed pair across every line at the printed chainage. */
export function drawBridges({ ctx, layout, camera, theme, state, regions }: DrawArgs): void {
  if (!state.layers.bridges) return
  const half = Math.max(3.5, 5 * camera.zoom)
  for (const bridge of layout.station.assets.bridges) {
    const ys = layout.tracksAt(bridge.x).map((t) => t.y)
    if (ys.length === 0) continue
    const top = worldToScreen(camera, { x: bridge.x, y: Math.min(...ys) }).y - 16
    const bottom = worldToScreen(camera, { x: bridge.x, y: Math.max(...ys) }).y + 16
    const sx = worldToScreen(camera, { x: bridge.x, y: 0 }).x
    const emphasis = emphasisOf(state, 'bridge', bridge.id)
    ctx.strokeStyle = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.bridge
    ctx.lineWidth = emphasis ? 2 : 1.2
    ctx.setLineDash([6, 4])
    line(ctx, sx - half, top, sx - half, bottom)
    line(ctx, sx + half, top, sx + half, bottom)
    ctx.setLineDash([])
    regions.push({ ref: { type: 'bridge', id: bridge.id }, x: sx - half - 3, y: top, w: half * 2 + 6, h: bottom - top })
  }
}
