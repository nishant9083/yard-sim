import { shapeBox, shapeCentre, shapePoints, type Structure } from '@/sip/model'
import { worldToScreen } from './camera'
import { arrowHead, line, withAlpha } from './draw'
import { clampPx } from './scales'
import { emphasisOf, type DrawArgs } from './types'

const isBox = (s: Structure) => s.kind === 'goomty' || s.kind === 'detector' || s.kind === 'locoPilotBoard'

function inkFor(args: DrawArgs, s: Structure): string {
  const e = emphasisOf(args.state, 'structure', s.id)
  return e === 'selected' ? args.theme.selected : e === 'hovered' ? args.theme.hover : args.theme.structure
}

/** Buildings, FOB and S.M. room are drawn to scale, along their outline. */
function drawSolid(args: DrawArgs, s: Structure): void {
  const { ctx, layout, camera, regions } = args
  if (!s.shape) return
  const pts = shapePoints(s.shape).map((p) => worldToScreen(camera, layout.place(p)))
  if (pts.length < 3) return
  const trace = () => {
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
  }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(...xs) - x
  const h = Math.max(...ys) - y
  const ink = inkFor(args, s)
  ctx.strokeStyle = ink
  ctx.lineWidth = s.kind === 'building' ? 1.6 : 1.3
  ctx.setLineDash([])
  ctx.fillStyle = ink
  trace()
  withAlpha(ctx, s.kind === 'fob' ? 0.14 : 0.07, () => ctx.fill())
  ctx.stroke()
  if (s.kind === 'smRoom') {
    ctx.save()
    trace()
    ctx.clip()
    ctx.lineWidth = 1
    withAlpha(ctx, 0.6, () => {
      for (let k = -h; k < w; k += 5) line(ctx, x + k, y + h, x + k + h, y)
    })
    ctx.restore()
  }
  regions.push({ ref: { type: 'structure', id: s.id }, x, y, w, h })
}

/** Boxes on a post (goomty, detection point, loco pilot board): pixel-sized, joined to the line by a stem. */
function drawBox(args: DrawArgs, s: Structure): void {
  const { ctx, layout, camera, theme, regions } = args
  if (!s.shape) return
  const box = shapeBox(s.shape)
  const centre = worldToScreen(camera, layout.place(shapeCentre(s.shape)))
  const w = clampPx((box.x1 - box.x0) * camera.zoom, 22, 44)
  const h = w * 0.62
  const x = centre.x - w / 2
  const y = centre.y - h / 2
  const ink = inkFor(args, s)
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 1.4
  ctx.setLineDash([])

  if (s.foot) {
    const ty = layout.trackY(s.foot.trackId, s.foot.x)
    if (ty !== null) {
      const foot = worldToScreen(camera, { x: s.foot.x, y: ty })
      const towardTrack = Math.sign(foot.y - centre.y) || 1
      const sideX = foot.x < centre.x ? x : x + w
      ctx.beginPath()
      if (s.kind === 'goomty') {
        ctx.moveTo(foot.x, foot.y - towardTrack * 6)
        ctx.lineTo(foot.x, centre.y + (towardTrack * h) / 2)
      } else {
        ctx.moveTo(foot.x, foot.y - towardTrack * 6)
        ctx.lineTo(foot.x, centre.y)
        ctx.lineTo(sideX, centre.y)
      }
      ctx.stroke()
      arrowHead(ctx, foot.x, foot.y, 0, towardTrack, 6)
    }
  }

  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.save()
  ctx.fillStyle = theme.background
  ctx.fill()
  ctx.restore()
  ctx.stroke()

  if (s.kind === 'detector') {
    ctx.beginPath()
    ctx.arc(centre.x, centre.y, h * 0.32, 0, Math.PI * 2)
    ctx.stroke()
  } else if (s.kind === 'locoPilotBoard') {
    ctx.save()
    ctx.font = `${Math.round(h * 0.8)}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('※', centre.x, centre.y + 1)
    ctx.restore()
  } else {
    ctx.save()
    ctx.font = `600 ${Math.round(h * 0.42)}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('G', centre.x, centre.y + 0.5)
    ctx.restore()
  }
  regions.push({ ref: { type: 'structure', id: s.id }, x, y, w, h })
}

/** LVV: two dots either side of the rail, at both ends of a short bar (the SIP's last-vehicle-check symbol). */
function drawLvv(args: DrawArgs, s: Structure): void {
  const { ctx, layout, camera, regions } = args
  if (!s.at) return
  const ty = layout.trackY(s.at.trackId, s.at.x)
  if (ty === null) return
  const c = worldToScreen(camera, { x: s.at.x, y: ty })
  const dx = clampPx(7 * camera.zoom, 6, 14)
  const dy = clampPx(8 * camera.zoom, 5.5, 10)
  const ink = inkFor(args, s)
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 1.2
  ctx.setLineDash([])
  for (const row of [-dy, dy]) {
    line(ctx, c.x - dx - 3, c.y + row, c.x + dx + 3, c.y + row)
    for (const col of [-dx, dx]) {
      ctx.beginPath()
      ctx.arc(c.x + col, c.y + row, 2.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  regions.push({ ref: { type: 'structure', id: s.id }, x: c.x - dx - 5, y: c.y - dy - 4, w: dx * 2 + 10, h: dy * 2 + 8 })
}

export function drawStructures(args: DrawArgs): void {
  if (!args.state.layers.structures) return
  for (const s of args.layout.station.assets.structures) {
    if (s.kind === 'lvv') drawLvv(args, s)
    else if (isBox(s)) drawBox(args, s)
    else drawSolid(args, s)
  }
}

/** Names, drawn after every symbol so labels never sit under a shape. */
export function drawStructureLabels(args: DrawArgs): void {
  if (!args.state.layers.structures) return
  const { ctx, layout, camera, theme, placer } = args
  {
    for (const s of layout.station.assets.structures) {
      if (!s.label) continue
      const at = worldToScreen(camera, layout.place(s.label))
      const hi = emphasisOf(args.state, 'structure', s.id)
      placer.text(ctx, theme, s.name, at.x, at.y, hi ? theme.selected : theme.structure, {
        font: theme.fontSmall,
        height: 12,
        ref: { type: 'structure', id: s.id },
        regions: args.regions,
      })
    }
  }
}
