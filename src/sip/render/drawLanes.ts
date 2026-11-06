import { chainageAt } from '@/sip/model'
import { worldToScreen } from './camera'
import { line } from './draw'
import { emphasisOf, type DrawArgs } from './types'

const ROW = 14

interface LaneItem {
  x: number
  text: string
  colour: string
  ref: { type: 'chainageMark' | 'bridge' | 'gradient'; id: string }
  emphasised: boolean
}

/** Greedy row assignment: first row where the label clears the previous one. Items that fit nowhere are dropped. */
function pack(ctx: CanvasRenderingContext2D, items: LaneItem[], rows: number): { item: LaneItem; row: number; w: number }[] {
  const ends = new Array<number>(rows).fill(-Infinity)
  const out: { item: LaneItem; row: number; w: number }[] = []
  for (const item of [...items].sort((a, b) => Number(b.emphasised) - Number(a.emphasised) || a.x - b.x)) {
    const w = ctx.measureText(item.text).width
    const left = item.x - w / 2
    let row = ends.findIndex((end) => left > end + 8)
    if (item.emphasised && row < 0) row = 0
    if (row < 0) continue
    ends[row] = Math.max(ends[row] ?? -Infinity, item.x + w / 2)
    out.push({ item, row, w })
  }
  return out
}

const niceStep = (pxPerMetre: number): number => [10, 25, 50, 100, 200, 250, 500, 1000, 2000].find((s) => s * pxPerMetre >= 62) ?? 5000

/**
 * Everything that is anchored by x only (chainage ruler, marks, bridges, gradients) lives in strips above and
 * below the yard at a fixed pixel height, so it stays readable whatever the zoom or vertical stretch.
 */
export function drawLanes(args: DrawArgs): void {
  const { ctx, layout, camera, theme, state, placer, regions } = args
  const { layers } = state
  const { assets, meta } = layout.station
  const scale = meta.chainage
  const top = worldToScreen(camera, { x: 0, y: layout.bounds.minY }).y - 10
  const bottom = worldToScreen(camera, { x: 0, y: layout.bounds.maxY }).y + 10
  const sx = (x: number) => worldToScreen(camera, { x, y: 0 }).x
  const small = theme.fontSmall
  ctx.font = small
  ctx.setLineDash([])

  const leader = (x: number, from: number, to: number, colour: string, alpha: number) => {
    ctx.save()
    ctx.strokeStyle = colour
    ctx.globalAlpha = alpha
    ctx.lineWidth = 0.8
    ctx.setLineDash([2, 3])
    line(ctx, x, from, x, to)
    ctx.restore()
  }

  const draw = (items: LaneItem[], rows: number, baseY: number, dirY: 1 | -1, leaderTo: number, colour: string) => {
    for (const { item, row, w } of pack(ctx, items, rows)) {
      const y = baseY + dirY * (row * ROW + ROW / 2)
      leader(item.x, y - dirY * (ROW / 2 - 1), leaderTo, colour, 0.45)
      placer.text(ctx, theme, item.text, item.x, y, item.colour, {
        font: small,
        height: 12,
        force: true,
        ref: item.ref,
        regions,
      })
      void w
    }
    // ticks for items that lost their label
    ctx.strokeStyle = colour
    ctx.lineWidth = 1
    for (const it of items) line(ctx, it.x, leaderTo, it.x, leaderTo + dirY * 6)
  }

  // ----- top stack (from the yard outward): marks, bridges, gradients, ruler
  let cursor = top
  if (layers.chainage && scale) {
    const items: LaneItem[] = assets.chainageMarks
      .filter((m) => m.lane === 'top')
      .map((m) => {
        const e = emphasisOf(state, 'chainageMark', m.id)
        return { x: sx(m.x), text: `${m.kind} ${m.chainage.toFixed(2)}`, colour: e ? theme.selected : theme.chainage, ref: { type: 'chainageMark', id: m.id }, emphasised: e !== null }
      })
    draw(items, 3, cursor, -1, top, theme.chainage)
    cursor -= 3 * ROW + 6
  }
  if (layers.bridges) {
    const showSpec = camera.zoom >= 0.9
    const items: LaneItem[] = assets.bridges.map((b) => {
      const e = emphasisOf(state, 'bridge', b.id)
      const text = `BR ${b.number}${b.isNew ? ' (NEW)' : ''}  CH:${b.chainage.toFixed(2)}M${showSpec ? '  ' + b.spec : ''}`
      return { x: sx(b.x), text, colour: e ? theme.selected : theme.bridge, ref: { type: 'bridge', id: b.id }, emphasised: e !== null }
    })
    draw(items, 2, cursor, -1, top, theme.bridge)
    cursor -= 2 * ROW + 6
  }
  if (layers.gradients) {
    const items: LaneItem[] = assets.gradients
      .filter((g) => g.direction !== 'DN')
      .map((g) => {
        const e = emphasisOf(state, 'gradient', g.id)
        return { x: sx(g.x), text: gradientText(g.direction, g.from, g.to), colour: e ? theme.selected : theme.label, ref: { type: 'gradient', id: g.id }, emphasised: e !== null }
      })
    draw(items, 1, cursor, -1, top, theme.label)
    cursor -= ROW + 8
  }

  // ----- ruler
  if (layers.chainage && scale && layout.nodes.size > 0) {
    const xs = [...layout.nodes.values()].map((n) => n.x)
    const x0 = sx(Math.min(...xs))
    const x1 = sx(Math.max(...xs))
    const baseY = cursor - 4
    ctx.strokeStyle = theme.chainage
    ctx.fillStyle = theme.chainage
    ctx.lineWidth = 1
    line(ctx, x0, baseY, x1, baseY)
    const step = niceStep(camera.zoom / scale.metresPerUnit)
    const maxC = Math.max(chainageAt(scale, Math.min(...xs)), chainageAt(scale, Math.max(...xs)))
    ctx.font = small
    for (let c = 0; c <= maxC; c += step) {
      for (const sign of c === 0 ? [1] : [-1, 1]) {
        const x = scale.originX + (sign * c) / scale.metresPerUnit
        if (x < Math.min(...xs) || x > Math.max(...xs)) continue
        const px = sx(x)
        line(ctx, px, baseY, px, baseY + (c % (step * 2) === 0 || step >= 500 ? 7 : 4))
        placer.text(ctx, theme, `${c}`, px, baseY - 8, theme.chainage, { font: small, height: 12, halo: false })
      }
    }
    placer.text(ctx, theme, 'CHAINAGE (m) F/CSB', x0, baseY - 22, theme.chainage, { align: 'left', font: small, height: 12, force: true, halo: false })

    // centre line of the station building, through the whole yard
    const csb = sx(scale.originX)
    ctx.save()
    ctx.strokeStyle = theme.selected
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 1
    ctx.setLineDash([8, 5])
    line(ctx, csb, baseY, csb, bottom)
    ctx.restore()
    ctx.fillStyle = theme.selected
    placer.text(ctx, theme, `CSB  CH 0.00M  ${scale.origin ? '(' + scale.origin.replace('Centre line of station building, ', '') + ')' : ''}`, csb, baseY - 22, theme.selected, {
      font: '600 11px ui-sans-serif, system-ui, sans-serif',
      height: 13,
      force: true,
    })
  }

  // ----- bottom stack: marks, DN gradients
  cursor = bottom
  if (layers.chainage && scale) {
    const items: LaneItem[] = assets.chainageMarks
      .filter((m) => m.lane === 'bottom')
      .map((m) => {
        const e = emphasisOf(state, 'chainageMark', m.id)
        return { x: sx(m.x), text: `${m.kind} ${m.chainage.toFixed(2)}`, colour: e ? theme.selected : theme.chainage, ref: { type: 'chainageMark', id: m.id }, emphasised: e !== null }
      })
    draw(items, 4, cursor, 1, bottom, theme.chainage)
    cursor += 4 * ROW + 6
  }
  if (layers.gradients) {
    const items: LaneItem[] = assets.gradients
      .filter((g) => g.direction === 'DN')
      .map((g) => {
        const e = emphasisOf(state, 'gradient', g.id)
        return { x: sx(g.x), text: gradientText(g.direction, g.from, g.to), colour: e ? theme.selected : theme.label, ref: { type: 'gradient', id: g.id }, emphasised: e !== null }
      })
    draw(items, 1, cursor, 1, bottom, theme.label)
  }
}

export function gradientText(direction: string, from?: string | null, to?: string | null): string {
  const tag = direction === 'BOTH' ? 'UP&DN ' : direction + ' '
  const a = from ? `1:${from}` : ''
  const b = to ? `1:${to}` : ''
  return `${tag}${a}${a && b ? ' ▸ ' : ''}${b}`
}
