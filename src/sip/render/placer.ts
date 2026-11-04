import type { EntityRef } from '@/sip/model'
import type { Viewport } from './camera'
import type { CanvasTheme } from './theme'
import type { HitRegion } from './types'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface TextOptions {
  align?: CanvasTextAlign
  /** Draw sideways (reading bottom to top), as the SIP prints vertical dimensions. */
  rotate?: boolean
  /** Draw even when it collides with something already placed. */
  force?: boolean
  font?: string
  /** Text height in px, used for the collision box. */
  height?: number
  ref?: EntityRef
  regions?: HitRegion[]
  halo?: boolean
}

/**
 * Greedy label placement: the first label to claim a spot keeps it, later ones that would overlap
 * are dropped. Draw order therefore decides priority.
 */
export class LabelPlacer {
  private readonly boxes: Box[] = []

  constructor(private readonly viewport: Viewport) {}

  private visible(b: Box): boolean {
    return b.x + b.w > 0 && b.y + b.h > 0 && b.x < this.viewport.width && b.y < this.viewport.height
  }

  private free(b: Box): boolean {
    for (const o of this.boxes) {
      if (b.x < o.x + o.w + 2 && b.x + b.w + 2 > o.x && b.y < o.y + o.h + 1 && b.y + b.h + 1 > o.y) return false
    }
    return true
  }

  /** Reserve a screen rectangle (for symbols that labels must not cover). */
  reserve(b: Box): void {
    this.boxes.push(b)
  }

  /** Try to claim a rectangle without drawing. */
  claim(b: Box): boolean {
    if (!this.visible(b) || !this.free(b)) return false
    this.boxes.push(b)
    return true
  }

  text(ctx: CanvasRenderingContext2D, theme: CanvasTheme, text: string, x: number, y: number, fill: string, opts: TextOptions = {}): boolean {
    if (opts.font) ctx.font = opts.font
    const align = opts.align ?? 'center'
    const textW = ctx.measureText(text).width
    const textH = opts.height ?? 13
    const w = opts.rotate ? textH : textW
    const h = opts.rotate ? textW : textH
    let bx = x - w / 2
    if (!opts.rotate) bx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2
    const box: Box = { x: bx, y: y - h / 2, w, h }
    if (!this.visible(box)) return false
    if (!opts.force && !this.free(box)) return false
    this.boxes.push(box)

    ctx.save()
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    if (opts.rotate) {
      ctx.translate(x, y)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      if (opts.halo !== false) {
        ctx.lineWidth = 4
        ctx.strokeStyle = theme.background
        ctx.strokeText(text, 0, 0)
      }
      ctx.fillStyle = fill
      ctx.fillText(text, 0, 0)
    } else {
      ctx.textAlign = align
      if (opts.halo !== false) {
        ctx.lineWidth = 4
        ctx.strokeStyle = theme.background
        ctx.strokeText(text, x, y)
      }
      ctx.fillStyle = fill
      ctx.fillText(text, x, y)
    }
    ctx.restore()
    if (opts.ref && opts.regions) opts.regions.push({ ref: opts.ref, ...box })
    return true
  }
}
