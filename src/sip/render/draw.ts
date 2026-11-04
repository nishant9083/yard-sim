import type { Point } from '@/sip/model'
import { worldToScreen, type Camera } from './camera'
import type { CanvasTheme } from './theme'
import type { Emphasis } from './types'

export function tracePath(ctx: CanvasRenderingContext2D, camera: Camera, points: Point[]): void {
  ctx.beginPath()
  points.forEach((p, i) => {
    const s = worldToScreen(camera, p)
    if (i === 0) ctx.moveTo(s.x, s.y)
    else ctx.lineTo(s.x, s.y)
  })
}

export function emphasisColor(theme: CanvasTheme, emphasis: Emphasis, base: string): string {
  if (emphasis === 'selected') return theme.selected
  if (emphasis === 'hovered') return theme.hover
  return base
}

/** Text with a background-coloured halo so it stays legible over lines. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  theme: CanvasTheme,
  text: string,
  x: number,
  y: number,
  fill: string,
  align: CanvasTextAlign = 'center',
): void {
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4
  ctx.strokeStyle = theme.background
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

export function line(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
}

/** Filled arrow head with its tip at (tx, ty), pointing along (dx, dy). */
export function arrowHead(ctx: CanvasRenderingContext2D, tx: number, ty: number, dx: number, dy: number, size = 6): void {
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(tx - ux * size + uy * size * 0.38, ty - uy * size - ux * size * 0.38)
  ctx.lineTo(tx - ux * size - uy * size * 0.38, ty - uy * size + ux * size * 0.38)
  ctx.closePath()
  ctx.fill()
}

export const withAlpha = (ctx: CanvasRenderingContext2D, alpha: number, fn: () => void): void => {
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * alpha
  fn()
  ctx.globalAlpha = prev
}
