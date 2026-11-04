import type { CanvasTheme } from './theme'
import type { TrackKind } from '@/sip/model'
import { emphasisColor, tracePath } from './draw'
import { emphasisOf, type DrawArgs } from './types'

const WIDTH: Record<TrackKind, number> = { main: 4.5, loop: 3, siding: 3, overrun: 2.6 }

function baseColor(theme: CanvasTheme, kind: TrackKind): string {
  switch (kind) {
    case 'main':
      return theme.trackMain
    case 'loop':
      return theme.trackLoop
    case 'siding':
      return theme.trackSiding
    case 'overrun':
      return theme.trackOverrun
  }
}

export function drawTracks({ ctx, layout, camera, theme, state }: DrawArgs): void {
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  for (const { track, points } of layout.tracks) {
    const emphasis = emphasisOf(state, 'track', track.id)
    ctx.lineWidth = WIDTH[track.kind] + (emphasis ? 1.5 : 0)
    ctx.strokeStyle = emphasisColor(theme, emphasis, baseColor(theme, track.kind))
    ctx.setLineDash(track.kind === 'overrun' ? [9, 5] : [])
    tracePath(ctx, camera, points)
    ctx.stroke()
  }
  ctx.setLineDash([])
}
