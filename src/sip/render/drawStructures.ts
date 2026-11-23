import { shapeBox, shapeCentre, shapePoints, type Point, type Structure } from '@/sip/model'
import { worldToScreen } from './camera'
import { arrowHead, line, withAlpha } from './draw'
import { clampPx, symbolRadius } from './scales'
import { rotateAbout, rotatedBox, trackScreenAngle } from './trackAngle'
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

/** Stem of a box on a post, in px: up from the line to the turn, then along to the box (scaled like signal heads). */
export const POST_STEM = {
  /** From the foot on the line to the turn (to the box itself for a goomty), as for a signal's wire row. */
  rise: (r: number) => r * 3.5 + 5,
  /** From the turn to the near side of the box. */
  run: (r: number) => r * 1.4,
}

interface PostedBox {
  /** Foot on the line (screen); the frame turns about it. */
  origin: Point
  /** The line's screen angle at the foot. */
  angle: number
  /** Box centre and size in the frame of the line (as if the line were level). */
  centre: Point
  w: number
  h: number
  /** Turn of the stem in the frame, or null for a straight stem (goomty) or a box with no foot. */
  turn: Point | null
  foot: Point | null
  /** Screen offset that carries the stored label along with the box. */
  labelShift: Point
}

/**
 * Where a box on a post is drawn. With a foot on a line the stem has a fixed rise and run (POST_STEM), so every
 * post looks alike; the stored box only decides which side of the line it stands and which way the stem turns.
 * Without a foot the box is drawn where it was stored.
 */
function postedBox(args: DrawArgs, s: Structure): PostedBox | null {
  const { layout, camera } = args
  if (!s.shape) return null
  const box = shapeBox(s.shape)
  const stored = worldToScreen(camera, layout.place(shapeCentre(s.shape)))
  const w = clampPx((box.x1 - box.x0) * camera.zoom, 22, 44)
  const h = w * 0.62
  const ty = s.foot ? layout.trackY(s.foot.trackId, s.foot.x) : null
  if (!s.foot || ty === null) return { origin: stored, angle: 0, centre: stored, w, h, turn: null, foot: null, labelShift: { x: 0, y: 0 } }

  const foot = worldToScreen(camera, { x: s.foot.x, y: ty })
  const angle = trackScreenAngle(layout, camera, s.foot.trackId, s.foot.x)
  // Side and turn direction, read from where the box was drawn relative to its foot (in the line's frame).
  const rel = rotateAbout(stored, foot, -angle)
  const sgn = rel.y < foot.y ? -1 : 1
  const dir = rel.x < foot.x ? -1 : 1
  const r = symbolRadius(camera.zoom)
  const rise = POST_STEM.rise(r)
  let centre: Point
  let turn: Point | null
  if (s.kind === 'goomty') {
    centre = { x: foot.x, y: foot.y + sgn * (rise + h / 2) }
    turn = null
  } else {
    turn = { x: foot.x, y: foot.y + sgn * rise }
    centre = { x: foot.x + dir * (POST_STEM.run(r) + w / 2), y: turn.y }
  }
  const drawn = rotateAbout(centre, foot, angle)
  return { origin: foot, angle, centre, w, h, turn, foot, labelShift: { x: drawn.x - stored.x, y: drawn.y - stored.y } }
}

/**
 * Boxes on a post (goomty, detection point, loco pilot board, S.B. ...): pixel-sized, joined to the line by a stem
 * of fixed rise and run that leaves the line at a right angle; the box is turned square to the line.
 */
function drawBox(args: DrawArgs, s: Structure): void {
  const { ctx, theme, regions } = args
  const g = postedBox(args, s)
  if (!g) return
  const { origin, angle, centre, w, h, turn, foot } = g
  const x = centre.x - w / 2
  const y = centre.y - h / 2
  const ink = inkFor(args, s)

  ctx.save()
  if (angle !== 0) {
    ctx.translate(origin.x, origin.y)
    ctx.rotate(angle)
    ctx.translate(-origin.x, -origin.y)
  }
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 1.4
  ctx.setLineDash([])

  if (foot) {
    const away = Math.sign(centre.y - foot.y) || 1
    ctx.beginPath()
    ctx.moveTo(foot.x, foot.y + away * 6)
    if (turn) {
      ctx.lineTo(turn.x, turn.y)
      ctx.lineTo(centre.x - Math.sign(centre.x - turn.x) * (w / 2), turn.y)
    } else {
      ctx.lineTo(foot.x, centre.y - away * (h / 2))
    }
    ctx.stroke()
    arrowHead(ctx, foot.x, foot.y, 0, -away, 6)
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
  ctx.restore()
  regions.push({ ref: { type: 'structure', id: s.id }, ...rotatedBox({ x, y, w, h }, origin, angle) })
}

/** LVV: two dots either side of the rail, at both ends of a short bar (the SIP's last-vehicle-check symbol), square to the line. */
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
  const angle = trackScreenAngle(layout, camera, s.at.trackId, s.at.x)
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.rotate(angle)
  for (const row of [-dy, dy]) {
    line(ctx, -dx - 3, row, dx + 3, row)
    for (const col of [-dx, dx]) {
      ctx.beginPath()
      ctx.arc(col, row, 2.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
  regions.push({ ref: { type: 'structure', id: s.id }, ...rotatedBox({ x: c.x - dx - 5, y: c.y - dy - 4, w: dx * 2 + 10, h: dy * 2 + 8 }, c, angle) })
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
      // A box on a post is drawn at a fixed distance from its foot; its label keeps its place beside the box.
      const shift = isBox(s) ? (postedBox(args, s)?.labelShift ?? { x: 0, y: 0 }) : { x: 0, y: 0 }
      const at = worldToScreen(camera, layout.place(s.label))
      const hi = emphasisOf(args.state, 'structure', s.id)
      placer.text(ctx, theme, s.name, at.x + shift.x, at.y + shift.y, hi ? theme.selected : theme.structure, {
        font: theme.fontSmall,
        height: 12,
        ref: { type: 'structure', id: s.id },
        regions: args.regions,
      })
    }
  }
}
