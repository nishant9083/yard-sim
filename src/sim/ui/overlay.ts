import { showsAspect, type Point, type TrackCircuit } from '@/sip/model'
import { routeIndicatorArms, signalGeometry, withSignalFrame, worldToScreen, type DrawArgs } from '@/sip/render'
import type { Simulation } from '../engine/simulation'

const RED = '#ff5d6c'
const GREEN = '#3ddc84'
const WHITE = '#f4f6fa'
const RESERVED = '#ffdf00'
const AMBER = '#ffb454'
const CYAN = '#4cc9f0'
const YELLOW = '#ffd23f'
const DARK = '#1c222b'

function spans(args: DrawArgs, tc: TrackCircuit): Point[][] {
  return tc.spans.map((span) => {
    if ('trackId' in span) return args.layout.trackSpan(span.trackId, span.x0, span.x1)
    return args.layout.connections.find((c) => c.connection.id === span.connectionId)?.points ?? []
  })
}

function path(args: DrawArgs, pts: Point[]): void {
  const { ctx, camera } = args
  ctx.beginPath()
  pts.forEach((p, i) => {
    const s = worldToScreen(camera, p)
    if (i === 0) ctx.moveTo(s.x, s.y)
    else ctx.lineTo(s.x, s.y)
  })
}

/** Live state drawn over the SIP: track circuits, points, signals and trains. */
export function drawSimOverlay(args: DrawArgs, sim: Simulation): void {
  const { ctx, layout, camera } = args
  const net = sim.net
  ctx.save()
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'

  // Track circuits: red when occupied, white when reserved by a route.
  const reserved = new Set<string>()
  for (const r of sim.rcc.routes) {
    const rt = sim.routes.get(r.id)!
    if (rt.phase === 'idle') continue
    if (rt.phase !== 'overlap') for (const tc of r.tcs.route) if (!(rt.phase === 'used' && rt.backSeen.has(tc) && !sim.tcs.get(tc)?.occupied)) reserved.add(tc)
    for (const tc of r.tcs.overlap) reserved.add(tc)
  }
  for (const tc of layout.station.assets.trackCircuits) {
    const st = sim.tcs.get(tc.code)
    if (!st) continue
    const colour = st.occupied ? RED : reserved.has(tc.code) ? RESERVED : null
    if (!colour) continue
    ctx.strokeStyle = colour
    ctx.globalAlpha = st.occupied ? 0.78 : 0.5
    ctx.lineWidth = tc.kind === 'axleCounter' ? 5 : 8
    if (st.fault !== 'none') ctx.setLineDash([8, 5])
    else ctx.setLineDash([])
    for (const pts of spans(args, tc)) {
      if (pts.length < 2) continue
      path(args, pts)
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // Points: ring colour is the state, the stub shows which way it is lined.
  if (args.state.layers.points) for (const [nodeId, sw] of net.switches) {
    const node = layout.nodes.get(nodeId)
    if (!node || !sw.unit) continue
    const p = sim.points.get(sw.unit)
    if (!p) continue
    const at = worldToScreen(camera, node)
    const bad = p.fault !== 'none' || (net.units.get(sw.unit)?.crankHandle ? sim.controls.get(net.units.get(sw.unit)!.crankHandle!) === false : false)
    const colour = bad ? RED : p.moving ? AMBER : p.owners.size > 0 ? CYAN : GREEN
    if (!p.moving) {
      const arm = p.pos === 'N' ? sw.normal : sw.reverse
      const e = net.edges.get(arm.edge)!
      const a = arm.end === 'start' ? e.pts[0]! : e.pts[e.pts.length - 1]!
      const b = arm.end === 'start' ? e.pts[1]! : e.pts[e.pts.length - 2]!
      const sa = worldToScreen(camera, layout.place(a))
      const sb = worldToScreen(camera, layout.place(b))
      const len = Math.hypot(sb.x - sa.x, sb.y - sa.y) || 1
      const reach = Math.min(22, len * 0.5)
      ctx.strokeStyle = colour
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(at.x, at.y)
      ctx.lineTo(at.x + ((sb.x - sa.x) / len) * reach, at.y + ((sb.y - sa.y) / len) * reach)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(at.x, at.y, 5.5, 0, Math.PI * 2)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = colour
    ctx.stroke()
    ctx.fillStyle = colour
    ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.moving ? '…' : p.pos, at.x, at.y - 12)
  }

  // Signals: every lamp of the head is drawn dark, then the ones the aspect lights.
  if (args.state.layers.signals) for (const sig of layout.station.assets.signals) {
    if (!showsAspect(sig)) continue
    const g = signalGeometry(layout, camera, sig)
    if (!g) continue
    const v = sim.signal(sig.id)
    const distant = sig.kind === 'distant'
    const lampParts = g.parts.filter((x) => x.element.kind === 'lamp')
    const styleOf = (x: (typeof lampParts)[number]) => (x.element.kind === 'lamp' ? x.element.style : 'solid')
    const isRed = (x: (typeof lampParts)[number]) => styleOf(x) === 'vbar'
    const isGreen = (x: (typeof lampParts)[number]) => styleOf(x) === 'hbar' || (distant && styleOf(x) === 'solid')
    const yellows = lampParts.filter((x) => !isRed(x) && !isGreen(x))
    const lit = new Map<(typeof lampParts)[number], string>()
    if (!v.lampFailed) {
      if (v.aspect === 'R') {
        const red = lampParts.find(isRed)
        if (red) lit.set(red, RED)
      } else if (v.aspect === 'G') {
        const green = lampParts.find(isGreen) ?? yellows[0]
        if (green) lit.set(green, GREEN)
      } else {
        const want = v.aspect === 'YY' ? 2 : 1
        const pick = yellows.length >= want ? [yellows[0]!, ...(want === 2 ? [yellows[yellows.length - 1]!] : [])] : yellows
        for (const y of pick) lit.set(y, YELLOW)
        if (pick.length === 0) {
          const any = lampParts.find((x) => !isRed(x))
          if (any) lit.set(any, YELLOW)
        }
      }
    }
    const rr = Math.max(2.6, g.r * 0.82)
    // Lamps sit in the signal's turned frame, like the drawing underneath.
    withSignalFrame(ctx, g, () => {
      for (const part of g.parts) {
        const e = part.element
        if (e.kind === 'lamp') {
          const colour = lit.get(part)
          ctx.beginPath()
          ctx.arc(part.cx, part.cy, rr, 0, Math.PI * 2)
          ctx.fillStyle = colour ?? DARK
          ctx.shadowColor = colour ?? 'transparent'
          ctx.shadowBlur = colour ? 10 : 0
          ctx.fill()
          ctx.shadowBlur = 0
        } else if (e.kind === 'callingOn') {
          ctx.beginPath()
          ctx.arc(part.cx, part.cy, rr * 0.8, 0, Math.PI * 2)
          ctx.fillStyle = v.callingOn ? YELLOW : DARK
          ctx.shadowColor = YELLOW
          ctx.shadowBlur = v.callingOn ? 10 : 0
          ctx.fill()
          ctx.shadowBlur = 0
        } else if (e.kind === 'routeIndicator') {
          if (v.routeIndicator) {
            // Light the indicator's arms as drawn on the plan. The interlocking only says "diverging", not which way,
            // so an indicator with several arms lights them all.
            ctx.strokeStyle = WHITE
            ctx.lineWidth = 2.5
            ctx.shadowColor = WHITE
            ctx.shadowBlur = 8
            ctx.beginPath()
            for (const arm of routeIndicatorArms(part, g)) {
              ctx.moveTo(arm.from.x, arm.from.y)
              ctx.lineTo(arm.to.x, arm.to.y)
            }
            ctx.stroke()
            ctx.shadowBlur = 0
          }
        } else if (e.kind === 'shunt') {
          // Position light: two whites, level when ON (independent shunt only), inclined when OFF.
          const independent = sig.kind === 'shunt'
          if (v.lampFailed || (!v.shunt && !independent)) continue
          const dx = g.r * 0.7
          const dy = v.shunt ? g.r * 0.7 : 0
          ctx.fillStyle = WHITE
          ctx.shadowColor = WHITE
          ctx.shadowBlur = v.shunt ? 9 : 0
          ctx.globalAlpha = v.shunt ? 1 : 0.75
          for (const k of [-1, 1]) {
            ctx.beginPath()
            ctx.arc(part.cx + k * dx, part.cy - k * dy, Math.max(1.8, g.r * 0.36), 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = 1
          ctx.shadowBlur = 0
        }
      }
    })
    if (v.lampFailed) {
      ctx.strokeStyle = RED
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(g.bbox.x, g.bbox.y)
      ctx.lineTo(g.bbox.x + g.bbox.w, g.bbox.y + g.bbox.h)
      ctx.moveTo(g.bbox.x + g.bbox.w, g.bbox.y)
      ctx.lineTo(g.bbox.x, g.bbox.y + g.bbox.h)
      ctx.stroke()
    }
  }

  // Trains.
  for (const t of sim.trains) {
    ctx.strokeStyle = t.leaving ? '#8fa6ff' : CYAN
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    for (const leg of t.trail) {
      const e = net.edges.get(leg.edge)
      if (!e) continue
      const pts = net.slice(e, leg.s0, leg.s1).map((q) => layout.place(q))
      if (pts.length < 2) continue
      path(args, pts)
      ctx.stroke()
    }
    const head = worldToScreen(camera, layout.place(net.pointOf(t.head)))
    ctx.fillStyle = '#ff00da'
    ctx.fillRect(head.x - 4.5, head.y - 5.5, 24, 14)
    ctx.lineWidth = 3.5
    ctx.strokeStyle = '#a500ff'
    ctx.strokeRect(head.x - 4.5, head.y - 5, 22, 12)
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#0a0c10'
    ctx.strokeText(t.name, head.x, head.y - 8)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(t.name, head.x, head.y - 8)
  }
  ctx.restore()
}
