import { isLevelCrossing } from '@/sip/model'
import { worldToScreen } from './camera'
import { line } from './draw'
import { rotatedBox, trackScreenAngle } from './trackAngle'
import { emphasisOf, type DrawArgs, type HitRegion } from './types'

type Box = Omit<HitRegion, 'ref'>

/**
 * Level crossing gate as printed on the SIP: the road crosses every line as a dashed pair (like a bridge) with a
 * solid centre pair, splays out at both ends, and has a gate boom at each end beyond the outer lines. A boom is a
 * dark tapered bar with a crossed box at its pivot (west of the road), pointing east across the road.
 */
function drawLevelCrossing(ctx: CanvasRenderingContext2D, sx: number, yTop: number, yBottom: number, half: number, ink: string, paper: string, bold: boolean): Box {
  const ext = Math.max(22, half * 3.4) // road beyond the outer lines
  const top = yTop - ext
  const bottom = yBottom + ext
  const wing = Math.max(5, half * 1.1)

  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = bold ? 2 : 1.2
  ctx.setLineDash([6, 4])
  line(ctx, sx - half, top, sx - half, bottom)
  line(ctx, sx + half, top, sx + half, bottom)
  ctx.setLineDash([])
  ctx.lineWidth = bold ? 1.6 : 1
  const inner = Math.max(1.2, half * 0.2)
  line(ctx, sx - inner, top + wing * 0.4, sx - inner, bottom - wing * 0.4)
  line(ctx, sx + inner, top + wing * 0.4, sx + inner, bottom - wing * 0.4)
  // Splayed ends of the road.
  ctx.lineWidth = bold ? 2 : 1.2
  for (const [y, out] of [
    [top, -1],
    [bottom, 1],
  ] as const) {
    line(ctx, sx - half, y, sx - half - wing * 0.8, y + out * wing)
    line(ctx, sx + half, y, sx + half + wing * 0.8, y + out * wing)
  }

  // Booms, half-way between the outer line and the end of the road.
  const thick = Math.max(5, half * 1.25)
  const tail = sx - half * 3.6
  const pivot = sx - half * 2.4
  const tip = sx + half * 4.4
  for (const y of [yTop - ext * 0.55, yBottom + ext * 0.55]) {
    ctx.beginPath()
    ctx.moveTo(tail, y)
    ctx.lineTo(pivot, y - thick / 2)
    ctx.lineTo(tip, y)
    ctx.lineTo(pivot, y + thick / 2)
    ctx.closePath()
    ctx.fill()
    const b = thick * 0.95
    ctx.beginPath()
    ctx.rect(pivot - b / 2, y - b / 2, b, b)
    ctx.fillStyle = paper
    ctx.fill()
    ctx.fillStyle = ink
    ctx.lineWidth = 1
    ctx.stroke()
    line(ctx, pivot - b / 2, y - b / 2, pivot + b / 2, y + b / 2)
    line(ctx, pivot + b / 2, y - b / 2, pivot - b / 2, y + b / 2)
  }
  return { x: tail - 2, y: top - wing - 2, w: tip - tail + 4, h: bottom - top + wing * 2 + 4 }
}

function drawBridge(ctx: CanvasRenderingContext2D, sx: number, yTop: number, yBottom: number, half: number, ink: string, bold: boolean): Box {
  const top = yTop - 16
  const bottom = yBottom + 16
  ctx.strokeStyle = ink
  ctx.lineWidth = bold ? 2 : 1.2
  ctx.setLineDash([6, 4])
  line(ctx, sx - half, top, sx - half, bottom)
  line(ctx, sx + half, top, sx + half, bottom)
  ctx.setLineDash([])
  return { x: sx - half - 3, y: top, w: half * 2 + 6, h: bottom - top }
}

/** Bridges and culverts (a dashed pair across the lines) and level crossing gates, at the printed chainage: across every line there, or only the chosen ones. */
export function drawBridges({ ctx, layout, camera, theme, state, regions }: DrawArgs): void {
  if (!state.layers.bridges) return
  const half = Math.max(3.5, 5 * camera.zoom)
  for (const bridge of layout.station.assets.bridges) {
    // Every line at this chainage, or only the chosen ones.
    const chosen = bridge.trackIds?.length ? new Set(bridge.trackIds) : null
    const crossed = layout.tracksAt(bridge.x).filter((t) => !chosen || chosen.has(t.trackId))
    if (crossed.length === 0) continue
    const ys = crossed.map((t) => t.y)
    const yTop = worldToScreen(camera, { x: bridge.x, y: Math.min(...ys) }).y
    const yBottom = worldToScreen(camera, { x: bridge.x, y: Math.max(...ys) }).y
    const sx = worldToScreen(camera, { x: bridge.x, y: 0 }).x
    const emphasis = emphasisOf(state, 'bridge', bridge.id)
    const ink = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.bridge

    // Square to the lines it crosses when they run parallel (a crossing on a sloping stretch); lines meeting at an
    // angle (a junction) leave it upright at its chainage.
    const angles = crossed.map((t) => trackScreenAngle(layout, camera, t.trackId, bridge.x))
    const parallel = Math.max(...angles) - Math.min(...angles) < 0.05
    const angle = parallel ? angles.reduce((a, b) => a + b, 0) / angles.length : 0
    // Drawn about its centre in the turned frame; parallel lines sit closer together measured square to them.
    const cy = (yTop + yBottom) / 2
    const halfSpan = ((yBottom - yTop) / 2) * Math.cos(angle)
    ctx.save()
    ctx.translate(sx, cy)
    ctx.rotate(angle)
    const local = isLevelCrossing(bridge)
      ? drawLevelCrossing(ctx, 0, -halfSpan, halfSpan, Math.max(4.5, 6 * camera.zoom), ink, theme.background, emphasis !== null)
      : drawBridge(ctx, 0, -halfSpan, halfSpan, half, ink, emphasis !== null)
    ctx.restore()
    const box = rotatedBox({ ...local, x: local.x + sx, y: local.y + cy }, { x: sx, y: cy }, angle)
    regions.push({ ref: { type: 'bridge', id: bridge.id }, ...box })
  }
}
