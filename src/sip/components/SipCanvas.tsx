import { useEffect, useMemo, useRef, useState } from 'react'
import { entityAnchor, type StationLayout } from '@/sip/layout'
import { sameEntity, type EntityRef } from '@/sip/model'
import {
  centerOn,
  fitBounds,
  hitTest,
  readCanvasTheme,
  renderStation,
  screenToWorld,
  type Camera,
  type FitInsets,
  type HitRegion,
  type DrawArgs,
  type LayerVisibility,
  zoomToCenter,
} from '@/sip/render'
import { useCameraControls, useElementSize } from '@/sip/hooks'

export interface FitRequest {
  mode: 'core' | 'all'
  /** Change the token to re-fit the view. */
  token: number
}

export interface ZoomRequest {
  zoom: number
  token: number
}

export interface FocusRequest {
  ref: EntityRef
  token: number
}

interface SipCanvasProps {
  layout: StationLayout
  layers: LayerVisibility
  hovered: EntityRef | null
  selected: EntityRef | null
  fit: FitRequest
  focus: FocusRequest | null
  /** Set an absolute zoom (from the toolbar slider). */
  zoomRequest?: ZoomRequest | null
  /** Reports the current zoom so the slider can follow wheel zoom and fits. */
  onZoomChange?: (zoom: number) => void
  onHover: (ref: EntityRef | null) => void
  onSelect: (ref: EntityRef | null) => void
  /** World x under the pointer (drawing units), or null when it leaves. */
  onCursorX?: (worldX: number | null) => void
  /** Extra drawing on top of the station; pass a new function to redraw. */
  overlay?: (args: DrawArgs) => void
}

const HIT_TOLERANCE_PX = 7
/** Screen pixels reserved for the fixed-height lanes above and below the yard. */
const FIT_INSETS: FitInsets = { top: 150, bottom: 130 }
const FOCUS_ZOOM = 3

export function SipCanvas({ layout, layers, hovered, selected, fit, focus, zoomRequest, onZoomChange, onHover, onSelect, onCursorX, overlay }: SipCanvasProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const regionsRef = useRef<HitRegion[]>([])
  const theme = useMemo(() => readCanvasTheme(), [])
  const [camera, setCamera] = useState<Camera>({ originX: 0, originY: 0, zoom: 1 })
  const hasSize = size.width > 0 && size.height > 0

  // Fit when the layout changes, the user asks, or the canvas first gets a size.
  useEffect(() => {
    if (!hasSize) return
    setCamera(fitBounds(fit.mode === 'core' ? layout.coreBounds : layout.bounds, size, 56, FIT_INSETS))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, fit.token, fit.mode, hasSize])

  // Centre on an entity picked from a list.
  useEffect(() => {
    if (!focus || !hasSize) return
    const anchor = entityAnchor(layout, focus.ref)
    if (anchor) setCamera((c) => centerOn(anchor, size, Math.max(c.zoom, FOCUS_ZOOM)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token])

  // Absolute zoom from the toolbar slider, about the viewport centre.
  useEffect(() => {
    if (!zoomRequest || !hasSize) return
    setCamera((c) => zoomToCenter(c, size, zoomRequest.zoom))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRequest?.token])

  useEffect(() => {
    onZoomChange?.(camera.zoom)
  }, [camera.zoom, onZoomChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasSize) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    regionsRef.current = renderStation({ ctx, layout, camera, theme, state: { hovered, selected, layers }, viewport: size, dpr, overlay })
  }, [layout, camera, theme, hovered, selected, layers, size, hasSize, overlay])

  const pick = (screen: { x: number; y: number }) =>
    hitTest(layout, camera, screen, { includeNodes: layers.nodes, regions: regionsRef.current, tolerance: HIT_TOLERANCE_PX, layers })

  const handlers = useCameraControls({
    canvasRef,
    setCamera,
    onMove: (screen) => {
      onCursorX?.(screenToWorld(camera, screen).x)
      const ref = pick(screen)
      if (!sameEntity(ref, hovered)) onHover(ref)
    },
    onTap: (screen) => {
      const ref = pick(screen)
      onSelect(sameEntity(ref, selected) ? null : ref)
    },
    onLeave: () => {
      onHover(null)
      onCursorX?.(null)
    },
    onDoubleClick: () => setCamera(fitBounds(layout.coreBounds, size, 56, FIT_INSETS)),
  })

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height }}
        className={`block touch-none ${hovered ? 'cursor-pointer' : 'cursor-grab'}`}
        {...handlers}
      />
    </div>
  )
}
