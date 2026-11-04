import type { Point, TrackCircuit } from '@/sip/model'
import { worldToScreen } from './camera'
import { tracePath, withAlpha } from './draw'
import { emphasisOf, type DrawArgs } from './types'

function spanPoints(args: DrawArgs, tc: TrackCircuit): Point[][] {
  const { layout } = args
  return tc.spans.map((span) => {
    if ('trackId' in span) return layout.trackSpan(span.trackId, span.x0, span.x1)
    return layout.connections.find((c) => c.connection.id === span.connectionId)?.points ?? []
  })
}

/** Soft coloured bands under the rails, one colour per circuit, so the section boundaries read at a glance. */
export function drawTrackCircuitBands(args: DrawArgs): void {
  const { ctx, camera, theme, state } = args
  if (!state.layers.trackCircuits) return
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  let n = 0
  for (const tc of args.layout.station.assets.trackCircuits) {
    const emphasis = emphasisOf(state, 'trackCircuit', tc.id)
    const axle = tc.kind === 'axleCounter'
    const colour = axle ? theme.labelMuted : theme.trackCircuit[n++ % theme.trackCircuit.length]!
    ctx.strokeStyle = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : colour
    ctx.lineWidth = emphasis ? 15 : axle ? 7 : 11
    ctx.setLineDash(axle ? [10, 6] : [])
    withAlpha(ctx, emphasis ? 0.4 : axle ? 0.22 : 0.2, () => {
      for (const pts of spanPoints(args, tc)) {
        if (pts.length < 2) continue
        tracePath(ctx, camera, pts)
        ctx.stroke()
      }
    })
  }
  ctx.setLineDash([])
}

/** Track circuit codes, placed where the SIP prints them. */
export function drawTrackCircuitLabels({ ctx, layout, camera, theme, state, placer, regions }: DrawArgs): void {
  if (!state.layers.trackCircuits) return
  for (const tc of layout.station.assets.trackCircuits) {
    const at = worldToScreen(camera, layout.place(tc.label))
    const emphasis = emphasisOf(state, 'trackCircuit', tc.id)
    const text = tc.kind === 'axleCounter' ? (tc.text ?? tc.code) : tc.code
    const fill = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : tc.kind === 'axleCounter' ? theme.labelMuted : theme.trackCircuit[0]
    placer.text(ctx, theme, text, at.x, at.y, fill, {
      font: theme.fontSmall,
      height: 12,
      ref: { type: 'trackCircuit', id: tc.id },
      regions,
      force: emphasis !== null,
    })
  }
}
