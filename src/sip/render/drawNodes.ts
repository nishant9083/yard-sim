import type { Point } from '@/sip/model'
import { worldToScreen } from './camera'
import { emphasisColor } from './draw'
import { emphasisOf, type DrawArgs } from './types'

/** Screen size of the sand hump symbol: a box running on past the end of the line. */
export const SAND_HUMP = { length: 48, half: 5 } as const

/** Centre of the sand hump box in screen space (`tangent` points away from the track). */
export function sandHumpCentre(s: Point, tangent: Point): Point {
  return { x: s.x + tangent.x * (SAND_HUMP.length / 2), y: s.y + tangent.y * (SAND_HUMP.length / 2) }
}

/**
 * Sand hump, as drawn on SIPs: an open box continuing the line past its end. The rails run into
 * the near half; the far half is the sand bed, drawn stippled.
 */
function drawSandHump(ctx: CanvasRenderingContext2D, s: Point, tangent: Point, color: string, emphasised: boolean): void {
  const { length: len, half } = SAND_HUMP
  const mid = len / 2
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(Math.atan2(tangent.y, tangent.x))
  ctx.strokeStyle = color
  ctx.fillStyle = color

  // End bar where the line meets the hump.
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -half - 2)
  ctx.lineTo(0, half + 2)
  ctx.stroke()

  // Box outline and the rails running into the near half.
  ctx.lineWidth = emphasised ? 1.6 : 1.1
  ctx.strokeRect(0, -half, len, half * 2)
  ctx.beginPath()
  ctx.moveTo(0, -1.5)
  ctx.lineTo(mid, -1.5)
  ctx.moveTo(0, 1.5)
  ctx.lineTo(mid, 1.5)
  ctx.stroke()

  // Sand bed: light wash plus a fixed stipple (deterministic, so it does not shimmer on redraw).
  ctx.globalAlpha = 0.18
  ctx.fillRect(mid, -half, len - mid, half * 2)
  ctx.globalAlpha = 1
  let row = 0
  for (let y = -half + 1.2; y < half - 0.6; y += 1.8, row++) {
    for (let x = mid + 1 + (row % 2) * 0.9; x < len - 0.6; x += 1.8) ctx.fillRect(x, y, 0.9, 0.9)
  }
  ctx.restore()
}

export function drawNodes({ ctx, layout, camera, theme, state }: DrawArgs): void {
  ctx.setLineDash([])
  ctx.lineCap = 'butt'

  for (const laid of layout.nodes.values()) {
    const { node } = laid
    const s = worldToScreen(camera, laid)
    const trackIds = layout.nodeTrackIds.get(node.id) ?? []
    const viaTrack = trackIds.some((id) => emphasisOf(state, 'track', id) !== null)
    const emphasis = emphasisOf(state, 'node', node.id) ?? (viaTrack ? 'hovered' : null)

    if (node.kind === 'sandHump') {
      drawSandHump(ctx, s, laid.tangent ?? { x: 1, y: 0 }, emphasisColor(theme, emphasis, theme.nodeEnd), emphasis !== null)
      continue
    }

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
