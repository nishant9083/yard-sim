import type { EntityRef, Point, Station } from '@/sip/model'
import { clipPolylineX } from '@/sip/layout'
import { anchorPoint, circuitLimits, gridPitch, trackPoints, type Draft, type Snap, type ToolId } from '@/sip/edit'
import { screenToWorld, worldToScreen, type Camera, type Viewport } from './camera'
import { line, tracePath } from './draw'
import type { CanvasTheme } from './theme'

/** Grid dots and the chainage centre line, drawn beneath the station. */
export function drawEditorUnderlay(
  ctx: CanvasRenderingContext2D,
  { camera, viewport, theme, station, grid }: { camera: Camera; viewport: Viewport; theme: CanvasTheme; station: Station; grid: boolean },
): void {
  if (grid) {
    const pitch = gridPitch(camera.zoom)
    const tl = screenToWorld(camera, { x: 0, y: 0 })
    const br = screenToWorld(camera, { x: viewport.width, y: viewport.height })
    ctx.fillStyle = theme.dimension
    ctx.globalAlpha = 0.35
    for (let x = Math.ceil(tl.x / pitch) * pitch; x <= br.x; x += pitch) {
      for (let y = Math.ceil(tl.y / pitch) * pitch; y <= br.y; y += pitch) {
        const s = worldToScreen(camera, { x, y })
        ctx.fillRect(s.x - 0.75, s.y - 0.75, 1.5, 1.5)
      }
    }
    ctx.globalAlpha = 1
  }
  const origin = station.meta.chainage?.originX
  if (origin !== undefined) {
    const x = worldToScreen(camera, { x: origin, y: 0 }).x
    ctx.strokeStyle = theme.chainage
    ctx.setLineDash([6, 5])
    ctx.lineWidth = 1
    line(ctx, x, 0, x, viewport.height)
    ctx.setLineDash([])
    ctx.fillStyle = theme.chainage
    ctx.font = theme.fontSmall
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('CENTRE LINE · CH 0', x + 5, 6)
  }
}

export interface OverlayArgs {
  ctx: CanvasRenderingContext2D
  camera: Camera
  theme: CanvasTheme
  station: Station
  tool: ToolId
  draft: Draft | null
  snap: Snap | null
  selected: EntityRef | null
  hovered: EntityRef | null
  /** Pointer in world space. */
  cursor: Point | null
  /** The pointer is on a spot the current tool cannot use. */
  blocked: boolean
}

function marker(ctx: CanvasRenderingContext2D, theme: CanvasTheme, camera: Camera, snap: Snap, blocked: boolean): void {
  const s = worldToScreen(camera, snap.p)
  ctx.lineWidth = 1.6
  ctx.setLineDash([])
  ctx.strokeStyle = blocked ? '#ff6b81' : snap.kind === 'node' ? theme.hover : theme.selected
  if (snap.kind === 'node') {
    ctx.strokeRect(s.x - 6, s.y - 6, 12, 12)
  } else if (snap.kind === 'track') {
    ctx.beginPath()
    ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    line(ctx, s.x - 5, s.y, s.x + 5, s.y)
    line(ctx, s.x, s.y - 5, s.x, s.y + 5)
  }
}

function handles(ctx: CanvasRenderingContext2D, theme: CanvasTheme, camera: Camera, station: Station, trackId: string, colour: string): void {
  const track = station.tracks.find((t) => t.id === trackId)
  if (!track) return
  ctx.fillStyle = theme.background
  ctx.strokeStyle = colour
  ctx.lineWidth = 1.5
  for (const p of trackPoints(station, track)) {
    const s = worldToScreen(camera, p)
    ctx.fillRect(s.x - 4, s.y - 4, 8, 8)
    ctx.strokeRect(s.x - 4, s.y - 4, 8, 8)
  }
}

/** Handles, the line being drawn and the snap marker, drawn above the station. */
export function drawEditorOverlay({ ctx, camera, theme, station, tool, draft, snap, selected, hovered, cursor, blocked }: OverlayArgs): void {
  ctx.setLineDash([])
  if (tool === 'select') {
    if (hovered?.type === 'track' && hovered.id !== selected?.id) handles(ctx, theme, camera, station, hovered.id, theme.hover)
    if (selected?.type === 'track') handles(ctx, theme, camera, station, selected.id, theme.selected)
    if (selected?.type === 'node') {
      const n = station.nodes.find((n) => n.id === selected.id)
      if (n) {
        const s = worldToScreen(camera, n)
        ctx.strokeStyle = theme.selected
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(s.x, s.y, 9, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  // Track circuit tool: show the section that would be created.
  if (tool === 'circuit' && snap?.kind === 'track') {
    const limits = circuitLimits(station, snap.trackId, snap.p.x)
    const track = station.tracks.find((t) => t.id === snap.trackId)
    if (limits && track) {
      tracePath(ctx, camera, clipPolylineX(trackPoints(station, track), limits[0], limits[1]))
      ctx.strokeStyle = theme.selected
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 8
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.lineCap = 'butt'
    }
  }

  ctx.strokeStyle = theme.selected
  ctx.fillStyle = theme.selected
  ctx.lineWidth = 1.6
  if (draft?.kind === 'track') {
    const pts = draft.anchors.flatMap((a) => anchorPoint(station, a) ?? [])
    if (pts.length) {
      tracePath(ctx, camera, pts)
      ctx.stroke()
      for (const p of pts) {
        const s = worldToScreen(camera, p)
        ctx.beginPath()
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      const to = snap?.p ?? cursor
      if (to) {
        ctx.setLineDash([5, 4])
        tracePath(ctx, camera, [pts[pts.length - 1]!, to])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  } else if (draft?.kind === 'connect') {
    const a = anchorPoint(station, draft.a)
    const to = snap?.p ?? cursor
    if (a && to) {
      ctx.setLineDash([5, 4])
      tracePath(ctx, camera, [a, to])
      ctx.stroke()
      ctx.setLineDash([])
      const s = worldToScreen(camera, a)
      ctx.beginPath()
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (draft?.kind === 'rect') {
    const a = worldToScreen(camera, draft.a)
    const b = worldToScreen(camera, draft.b)
    ctx.setLineDash([5, 4])
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    ctx.setLineDash([])
  }

  if (snap && tool !== 'select' && tool !== 'pan') marker(ctx, theme, camera, snap, blocked)
}
