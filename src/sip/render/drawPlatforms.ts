import { worldToScreen } from './camera'
import { tracePath, withAlpha } from './draw'
import { emphasisOf, type DrawArgs } from './types'

/** Platform outlines, drawn beneath the tracks. */
export function drawPlatforms({ ctx, layout, camera, theme, state, placer, regions }: DrawArgs): void {
  if (!state.layers.platforms) return
  ctx.setLineDash([])
  for (const platform of layout.station.assets.platforms) {
    const pts = platform.polygon.map(layout.place)
    const emphasis = emphasisOf(state, 'platform', platform.id)
    tracePath(ctx, camera, pts)
    ctx.closePath()
    ctx.fillStyle = emphasis ? theme.selected : theme.platform
    withAlpha(ctx, emphasis ? 0.28 : 0.16, () => ctx.fill())
    ctx.lineWidth = emphasis ? 2 : 1.2
    ctx.strokeStyle = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.platform
    ctx.stroke()

    const screen = pts.map((p) => worldToScreen(camera, p))
    const xs = screen.map((p) => p.x)
    const ys = screen.map((p) => p.y)
    regions.push({ ref: { type: 'platform', id: platform.id }, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })

    const at = worldToScreen(camera, layout.place(platform.label))
    const size = `${platform.lengthM}M × ${platform.widthM}M`
    placer.text(ctx, theme, `${platform.text}  (${size})`, at.x, at.y, theme.platform, { font: theme.fontSmall, height: 12, halo: false })
  }
}
