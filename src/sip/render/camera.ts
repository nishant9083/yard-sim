import type { Bounds, Point } from '@/sip/model'

/** screen = (world - origin) * zoom */
export interface Camera {
  originX: number
  originY: number
  zoom: number
}

export interface Viewport {
  width: number
  height: number
}

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 60

export const worldToScreen = (cam: Camera, p: Point): Point => ({
  x: (p.x - cam.originX) * cam.zoom,
  y: (p.y - cam.originY) * cam.zoom,
})

export const screenToWorld = (cam: Camera, p: Point): Point => ({
  x: p.x / cam.zoom + cam.originX,
  y: p.y / cam.zoom + cam.originY,
})

/** Zoom while keeping the world point under `screen` fixed. */
export function zoomAt(cam: Camera, screen: Point, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor))
  const world = screenToWorld(cam, screen)
  return { zoom, originX: world.x - screen.x / zoom, originY: world.y - screen.y / zoom }
}

/** Set an absolute zoom level, keeping the viewport centre fixed. */
export function zoomToCenter(cam: Camera, viewport: Viewport, zoom: number): Camera {
  return zoomAt(cam, { x: viewport.width / 2, y: viewport.height / 2 }, zoom / cam.zoom)
}

export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, originX: cam.originX - dxScreen / cam.zoom, originY: cam.originY - dyScreen / cam.zoom }
}

export interface FitInsets {
  top?: number
  bottom?: number
}

/** Fit bounds into the viewport. `insets` reserve screen pixels above/below for fixed-height strips. */
export function fitBounds(bounds: Bounds, viewport: Viewport, padding = 56, insets: FitInsets = {}): Camera {
  const top = insets.top ?? 0
  const bottom = insets.bottom ?? 0
  const bw = Math.max(1, bounds.maxX - bounds.minX)
  const bh = Math.max(1, bounds.maxY - bounds.minY)
  const availW = viewport.width - padding * 2
  const availH = viewport.height - padding * 2 - top - bottom
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(availW / bw, availH / bh)))
  return {
    zoom,
    originX: bounds.minX - (viewport.width / zoom - bw) / 2,
    originY: bounds.minY - (padding + top) / zoom - (availH / zoom - bh) / 2,
  }
}

/** Camera centred on a world point at the given zoom. */
export function centerOn(point: Point, viewport: Viewport, zoom: number): Camera {
  return { zoom, originX: point.x - viewport.width / 2 / zoom, originY: point.y - viewport.height / 2 / zoom }
}
