import type { LampStyle } from '@/sip/model'
import { arrowHead, line } from './draw'
import { routeIndicatorArms, signalGeometry, type SignalGeometry } from './signalGeometry'
import { emphasisOf, type DrawArgs } from './types'

function lamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, style: LampStyle, ink: string, paper: string): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = style === 'solid' ? ink : paper
  ctx.fill()
  ctx.stroke()
  if (style === 'solid') return
  const k = r * 0.72
  if (style === 'slash') line(ctx, cx - k, cy + k, cx + k, cy - k)
  else if (style === 'vbar') line(ctx, cx, cy - r, cx, cy + r)
  else line(ctx, cx - r, cy, cx + r, cy)
}

function shuntDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, dir: number, sgn: number, ink: string, paper: string): void {
  // Quarter disc: flat edges toward the stem and the track, round edge outward, three holes.
  const cornerX = cx - dir * r * 1.1
  const cornerY = cy - sgn * r
  const from = sgn === -1 ? -Math.PI / 2 : Math.PI / 2
  const to = dir === 1 ? 0 : Math.PI
  ctx.beginPath()
  ctx.moveTo(cornerX, cornerY)
  ctx.lineTo(cornerX, cornerY + sgn * 2 * r)
  ctx.arc(cornerX, cornerY, 2 * r, from, to, (sgn === -1) !== (dir === 1))
  ctx.closePath()
  ctx.fillStyle = paper
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = ink
  for (const [ox, oy] of [[0.55, 0.55], [1.25, 0.5], [0.5, 1.25]] as const) {
    ctx.beginPath()
    ctx.arc(cornerX + dir * ox * r, cornerY + sgn * oy * r, Math.max(1, r * 0.16), 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawElements(ctx: CanvasRenderingContext2D, g: SignalGeometry, ink: string, paper: string, text: (s: string, x: number, y: number) => void): void {
  const { r, dir, sgn } = g
  for (const { element, cx, cy, w } of g.parts) {
    switch (element.kind) {
      case 'lamp':
        lamp(ctx, cx, cy, r, element.style, ink, paper)
        break
      case 'marker':
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2)
        ctx.fillStyle = paper
        ctx.fill()
        ctx.stroke()
        text(element.text, cx, cy)
        break
      case 'callingOn': {
        const hw = w / 2
        const hh = r * 0.8
        ctx.beginPath()
        ctx.roundRect(cx - hw, cy - hh, w, hh * 2, hh)
        ctx.fillStyle = paper
        ctx.fill()
        ctx.stroke()
        line(ctx, cx - r * 0.5, cy + r * 0.5, cx + r * 0.5, cy - r * 0.5)
        break
      }
      case 'routeIndicator': {
        // Arms from the pivot: |<| (head facing east) or |>| (west), only the ones this indicator has.
        for (const arm of routeIndicatorArms({ element, cx, cy, w }, g)) line(ctx, arm.from.x, arm.from.y, arm.to.x, arm.to.y)
        break
      }
      case 'shunt':
        shuntDisc(ctx, cx, cy, r, dir, sgn, ink, paper)
        break
    }
  }
}

/** Signal posts: stem to the track, wire to the head, lamps in printed order, board and code. */
export function drawSignals({ ctx, layout, camera, theme, state, placer, regions }: DrawArgs): void {
  if (!state.layers.signals) return
  ctx.setLineDash([])
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const signal of layout.station.assets.signals) {
    const g = signalGeometry(layout, camera, signal)
    if (!g) continue
    const emphasis = emphasisOf(state, 'signal', signal.id)
    const ink = emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : theme.signal
    ctx.strokeStyle = ink
    ctx.fillStyle = ink
    ctx.lineWidth = emphasis ? 2 : 1.4

    // stem: arrow on the track, up to the wire row, across to the head
    const first = g.parts[0]
    const wireEnd = first ? first.cx - g.dir * first.w / 2 : g.anchor.x
    ctx.beginPath()
    ctx.moveTo(g.foot.x, g.foot.y + g.sgn * 6)
    ctx.lineTo(g.foot.x, g.anchor.y)
    ctx.lineTo(wireEnd, g.anchor.y)
    ctx.stroke()
    arrowHead(ctx, g.foot.x, g.foot.y, 0, -g.sgn, 6)

    ctx.fillStyle = ink
    drawElements(ctx, g, ink, theme.background, (s, x, y) => {
      ctx.save()
      ctx.font = `600 ${Math.max(7, g.r * 1.05)}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = ink
      ctx.fillText(s, x, y + 0.5)
      ctx.restore()
    })

    if (g.boardAt) {
      const bw = g.r * 2.6
      const bh = g.r * 2
      ctx.beginPath()
      ctx.rect(g.boardAt.x - bw / 2, g.boardAt.y - bh / 2, bw, bh)
      ctx.fillStyle = theme.background
      ctx.fill()
      ctx.stroke()
      line(ctx, g.anchor.x, g.anchor.y, g.anchor.x, g.boardAt.y)
      line(ctx, g.anchor.x, g.boardAt.y, g.boardAt.x - bw / 2 * g.dir, g.boardAt.y)
      ctx.save()
      ctx.font = `600 ${Math.max(7, g.r)}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillStyle = ink
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(signal.board ?? '', g.boardAt.x, g.boardAt.y + 0.5)
      ctx.restore()
    }

    regions.push({ ref: { type: 'signal', id: signal.id }, ...g.bbox })

    // code label on the far side of the head
    const xs = g.parts.map((p) => p.cx)
    const mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : g.anchor.x
    const labelY = g.anchor.y + g.sgn * (g.r + (g.boardAt ? g.r * 4.4 : 9))
    placer.reserve(g.bbox)
    placer.text(ctx, theme, signal.code, mid, labelY, ink, {
      font: '600 12px ui-sans-serif, system-ui, sans-serif',
      height: 14,
      force: true,
    })
  }
}
