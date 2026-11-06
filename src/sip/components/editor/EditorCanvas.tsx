import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { entityAnchor, layoutStation } from '@/sip/layout'
import {
  addAnnotation,
  addBridge,
  addConnection,
  addJoint,
  addCircuitAt,
  addPlatform,
  addPoint,
  addSignal,
  addStructure,
  anchorOfSnap,
  anchorPoint,
  gridPitch,
  insertVertex,
  isMovable,
  moveEntity,
  nearestTrack,
  snapPoint,
  snapToGrid,
  type Draft,
  type OpResult,
  type Snap,
  type ToolId,
  type ToolOptions,
} from '@/sip/edit'
import { chainageAt, sameEntity, type EntityRef, type Point, type Station } from '@/sip/model'
import {
  drawEditorOverlay,
  centerOn,
  drawEditorUnderlay,
  fitBounds,
  hitTest,
  panBy,
  readCanvasTheme,
  renderStation,
  screenToWorld,
  zoomAt,
  type Camera,
  type HitRegion,
  type LayerVisibility,
} from '@/sip/render'
import { useElementSize } from '@/sip/hooks'

interface EditorCanvasProps {
  station: Station
  tool: ToolId
  options: ToolOptions
  grid: boolean
  layers: LayerVisibility
  selected: EntityRef | null
  draft: Draft | null
  fitToken: number
  /** Centre the view on an entity when the token changes. */
  focus: { ref: EntityRef; token: number } | null
  onDraft: (draft: Draft | null) => void
  onSelect: (ref: EntityRef | null) => void
  /** Apply a finished edit. A returned ref is selected. */
  onCommit: (result: OpResult) => void
  /** Live update while dragging; `onGestureEnd` closes it as one undo step. */
  onLive: (station: Station) => void
  onGestureEnd: () => void
  onFinishTrack: () => void
  onNotice: (text: string) => void
}

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number; moved: boolean; downAt: Point; tap: EntityRef | null }
  | { kind: 'move'; ref: EntityRef; base: Station; startWorld: Point; moved: boolean }
  | { kind: 'rect'; a: Point; moved: boolean }

const HIT_PX = 8
const NODE_PX = 9
const NEAR_TRACK_PX = 28
const DRAG_PX = 4
const DEFAULT_VIEW = { minX: 0, minY: -120, maxX: 2400, maxY: 480 }

const POINT_ON_LINE_TOOLS: ToolId[] = ['signal', 'joint', 'circuit', 'bridge']
const DRAW_TOOLS: ToolId[] = ['track', 'connect', 'point', 'text', 'origin', ...POINT_ON_LINE_TOOLS]

export function EditorCanvas({
  station,
  tool,
  options,
  grid,
  layers,
  selected,
  draft,
  fitToken,
  focus,
  onDraft,
  onSelect,
  onCommit,
  onLive,
  onGestureEnd,
  onFinishTrack,
  onNotice,
}: EditorCanvasProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const regionsRef = useRef<HitRegion[]>([])
  const gesture = useRef<Gesture | null>(null)
  const theme = useMemo(() => readCanvasTheme(), [])
  const [camera, setCamera] = useState<Camera>({ originX: 0, originY: 0, zoom: 1 })
  const [cursor, setCursor] = useState<Point | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [hovered, setHovered] = useState<EntityRef | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const hasSize = size.width > 0 && size.height > 0

  // Fixed origin and no stretch: editor coordinates are drawing coordinates.
  const layout = useMemo(() => layoutStation(station, { yExaggeration: 1, originY: 0 }), [station])

  // Fit once the canvas has a size, and whenever "Fit" is pressed.
  useEffect(() => {
    if (!hasSize) return
    const bounds = station.nodes.length >= 2 ? layout.bounds : DEFAULT_VIEW
    setCamera(fitBounds(bounds, size, 70))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, hasSize])

  // Centre on an entity picked from a list.
  useEffect(() => {
    if (!focus || !hasSize) return
    const anchor = entityAnchor(layout, focus.ref)
    if (anchor) setCamera((c) => centerOn(anchor, size, Math.max(c.zoom, 2)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token])

  // Wheel zoom.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      setCamera((c) => zoomAt(c, { x: e.clientX - rect.left, y: e.clientY - rect.top }, Math.exp(-e.deltaY * 0.0015)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Space = temporary pan tool.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const gridPitchNow = grid ? gridPitch(camera.zoom) : null
  const blocked = false

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasSize) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    regionsRef.current = renderStation({
      ctx,
      layout,
      camera,
      theme,
      state: { hovered, selected, layers },
      viewport: size,
      dpr,
      underlay: (c) => drawEditorUnderlay(c, { camera, viewport: size, theme, station, grid }),
    })
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawEditorOverlay({ ctx, camera, theme, station, tool, draft, snap, selected, hovered, cursor, blocked })
  }, [layout, camera, theme, hovered, selected, layers, size, hasSize, station, grid, tool, draft, snap, cursor])

  // --- helpers -------------------------------------------------------------------------------

  const local = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** Entity under the pointer. Vertices of the selected / hovered line count, as do junctions and line ends. */
  const pick = useCallback(
    (screen: Point): EntityRef | null => {
      const world = screenToWorld(camera, screen)
      const tol = NODE_PX / camera.zoom
      const onSelectedTrack = new Set(
        [selected, hovered].flatMap((r) => (r?.type === 'track' ? (station.tracks.find((t) => t.id === r.id)?.nodeIds ?? []) : [])),
      )
      let best: { id: string; d: number } | null = null
      for (const n of station.nodes) {
        const eligible = n.kind !== 'plain' || onSelectedTrack.has(n.id) || (selected?.type === 'node' && selected.id === n.id)
        if (!eligible) continue
        const d = Math.hypot(n.x - world.x, n.y - world.y)
        if (d <= tol && (!best || d < best.d)) best = { id: n.id, d }
      }
      // Symbols and labels win over bare vertices; vertices win over the line itself.
      const symbol = hitTest(layout, camera, screen, { includeNodes: false, regions: regionsRef.current, tolerance: HIT_PX })
      if (symbol && symbol.type !== 'track' && symbol.type !== 'connection' && symbol.type !== 'platform') return symbol
      if (best) return { type: 'node', id: best.id }
      return symbol
    },
    [camera, hovered, layout, selected, station],
  )

  /** What the pointer would snap to under the current tool. */
  const snapFor = useCallback(
    (world: Point, shift: boolean, last?: Point): Snap => {
      const tol = NODE_PX / camera.zoom
      const pitch = gridPitchNow
      if (POINT_ON_LINE_TOOLS.includes(tool)) {
        const near = nearestTrack(station, world, NEAR_TRACK_PX / camera.zoom)
        if (near) {
          const y = layout.trackY(near.trackId, near.x)
          if (y !== null) return { kind: 'track', trackId: near.trackId, p: { x: near.x, y } }
        }
        return { kind: 'free', p: world }
      }
      if (tool === 'point') return snapPoint(station, world, { tolerance: 12 / camera.zoom, grid: null })
      if (tool === 'connect') return snapPoint(station, world, { tolerance: 10 / camera.zoom, grid: null })
      const s = snapPoint(station, shift && last ? { x: world.x, y: last.y } : world, { tolerance: tol, grid: pitch })
      return s.kind === 'free' && shift && last ? { kind: 'free', p: { x: snapToGrid(world, pitch).x, y: last.y } } : s
    },
    [camera.zoom, gridPitchNow, layout, station, tool],
  )

  const create = (result: OpResult, notice?: string) => {
    if (result.station === station) return onNotice(notice ?? 'Nothing was added there.')
    onCommit(result)
  }

  // --- pointer events ------------------------------------------------------------------------

  const startPan = (e: PointerEvent<HTMLCanvasElement>, tap: EntityRef | null = null) => {
    gesture.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY, moved: false, downAt: { x: e.clientX, y: e.clientY }, tap }
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const screen = local(e)
    const world = screenToWorld(camera, screen)
    if (e.button === 1 || e.button === 2 || spaceDown || tool === 'pan') return startPan(e)

    if (tool === 'select') {
      const hit = pick(screen)
      if (hit && isMovable(hit)) {
        onSelect(hit)
        gesture.current = { kind: 'move', ref: hit, base: station, startWorld: world, moved: false }
        return
      }
      return startPan(e, hit)
    }
    if (tool === 'platform' || (tool === 'structure' && options.structureKind !== 'lvv')) {
      const a = snapToGrid(world, gridPitchNow)
      gesture.current = { kind: 'rect', a, moved: false }
      onDraft({ kind: 'rect', a, b: a })
      return
    }
    startPan(e)
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const screen = local(e)
    const world = screenToWorld(camera, screen)
    const g = gesture.current

    if (g?.kind === 'pan') {
      if (!g.moved && Math.hypot(e.clientX - g.downAt.x, e.clientY - g.downAt.y) > DRAG_PX) g.moved = true
      if (g.moved) {
        const dx = e.clientX - g.lastX
        const dy = e.clientY - g.lastY
        setCamera((c) => panBy(c, dx, dy))
      }
      g.lastX = e.clientX
      g.lastY = e.clientY
      return
    }

    if (g?.kind === 'move') {
      if (!g.moved && Math.hypot(world.x - g.startWorld.x, world.y - g.startWorld.y) * camera.zoom > DRAG_PX) g.moved = true
      if (!g.moved) return
      const pitch = e.altKey ? null : gridPitchNow
      let dx = world.x - g.startWorld.x
      let dy = world.y - g.startWorld.y
      if (g.ref.type === 'node') {
        const node = g.base.nodes.find((n) => n.id === g.ref.id)
        if (!node) return
        const target = snapToGrid({ x: node.x + dx, y: node.y + dy }, pitch)
        dx = target.x - node.x
        dy = target.y - node.y
      } else if (pitch) {
        dx = Math.round(dx / pitch) * pitch
        dy = Math.round(dy / pitch) * pitch
      }
      onLive(moveEntity(g.base, g.ref, dx, dy, world))
      return
    }

    if (g?.kind === 'rect') {
      const b = snapToGrid(world, gridPitchNow)
      g.moved = true
      onDraft({ kind: 'rect', a: g.a, b })
      return
    }

    setCursor(world)
    if (tool === 'select' || tool === 'pan') {
      const ref = spaceDown || tool === 'pan' ? null : pick(screen)
      if (!sameEntity(ref, hovered)) setHovered(ref)
      setSnap(null)
    } else {
      if (hovered) setHovered(null)
      const lastAnchor = draft?.kind === 'track' ? draft.anchors[draft.anchors.length - 1] : undefined
      setSnap(snapFor(world, e.shiftKey, lastAnchor ? (anchorPoint(station, lastAnchor) ?? undefined) : undefined))
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current
    gesture.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!g) return
    const screen = local(e)
    const world = screenToWorld(camera, screen)

    if (g.kind === 'move') return onGestureEnd()

    if (g.kind === 'rect') {
      const b = snapToGrid(world, gridPitchNow)
      onDraft(null)
      if (tool === 'platform') {
        if (!g.moved) return onNotice('Drag a rectangle to draw a platform.')
        return create(addPlatform(station, g.a, b), 'That platform is too small.')
      }
      return create(addStructure(station, options.structureKind, g.a, g.moved ? b : g.a))
    }

    if (g.moved) return
    // A click, not a drag.
    if (tool === 'select' || tool === 'pan') return onSelect(tool === 'select' ? g.tap : null)
    tap(world, e.shiftKey)
  }

  const tap = (world: Point, shift: boolean) => {
    const lastAnchor = draft?.kind === 'track' ? draft.anchors[draft.anchors.length - 1] : undefined
    const last = lastAnchor ? (anchorPoint(station, lastAnchor) ?? undefined) : undefined
    const s = snapFor(world, shift, last)

    switch (tool) {
      case 'track': {
        const a = anchorOfSnap(s)
        const p = anchorPoint(station, a)
        if (!p) return
        const pts = draft?.kind === 'track' ? draft.anchors.flatMap((x) => anchorPoint(station, x) ?? []) : []
        const prev = pts[pts.length - 1]
        if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.5) return
        // Lines run one way along x: later points may not turn back.
        if (pts.length >= 2) {
          const dir = Math.sign(pts[1]!.x - pts[0]!.x) || Math.sign(pts[pts.length - 1]!.x - pts[0]!.x)
          if (dir !== 0 && Math.sign(p.x - prev!.x) !== dir) return onNotice('A line cannot double back along the track. Place the next point further along.')
        } else if (pts.length === 1 && p.x === prev!.x) {
          return onNotice('Place the next point to the left or right of the last one.')
        }
        onDraft({ kind: 'track', anchors: [...(draft?.kind === 'track' ? draft.anchors : []), a] })
        return
      }
      case 'connect': {
        if (s.kind === 'free') return onNotice('Click on a line.')
        const a = anchorOfSnap(s)
        if (draft?.kind !== 'connect') return onDraft({ kind: 'connect', a })
        onDraft(null)
        return create(addConnection(station, draft.a, a, options.connectWithPoints), 'Pick two different spots.')
      }
      case 'point':
        if (s.kind === 'free') return onNotice('Click a junction or a line.')
        return create(addPoint(station, anchorOfSnap(s)))
      case 'signal':
        if (s.kind !== 'track') return onNotice('Click beside a line.')
        return create(addSignal(station, s.trackId, s.p.x, world.y, options.signalPreset))
      case 'joint':
        if (s.kind !== 'track') return onNotice('Click on a line.')
        return create(addJoint(station, s.trackId, s.p.x))
      case 'circuit':
        if (s.kind !== 'track') return onNotice('Click on a line.')
        return create(addCircuitAt(station, s.trackId, s.p.x), 'Could not work out the section here.')
      case 'bridge':
        if (s.kind !== 'track') return onNotice('Click on a line.')
        return create(addBridge(station, s.p.x))
      case 'text':
        return create(addAnnotation(station, snapToGrid(world, gridPitchNow)))
      case 'structure':
        // Only the LVV is placed by a click; the others use the rectangle gesture.
        return create(addStructure(station, options.structureKind, world, world), 'Place the LVV on a line.')
      case 'origin': {
        const scale = station.meta.chainage
        if (!scale) return
        const originX = Math.round(world.x * 10) / 10
        onCommit({ station: { ...station, meta: { ...station.meta, chainage: { ...scale, originX } } } })
        onNotice(`Centre line set (CH ${chainageAt({ ...scale, originX }, world.x).toFixed(0)} M here).`)
        return
      }
    }
  }

  const onDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'track') return onFinishTrack()
    if (tool !== 'select') return
    const rect = e.currentTarget.getBoundingClientRect()
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const hit = pick(screen)
    if (hit?.type === 'track') {
      const world = screenToWorld(camera, screen)
      create(insertVertex(station, hit.id, world))
    }
  }

  const cursorClass =
    spaceDown || tool === 'pan'
      ? 'cursor-grab'
      : tool === 'select'
        ? hovered && isMovable(hovered)
          ? 'cursor-move'
          : hovered
            ? 'cursor-pointer'
            : 'cursor-default'
        : DRAW_TOOLS.includes(tool) || tool === 'platform' || tool === 'structure'
          ? 'cursor-crosshair'
          : 'cursor-default'

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height }}
        className={`block touch-none ${cursorClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!gesture.current) {
            setCursor(null)
            setSnap(null)
            setHovered(null)
          }
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault()
          if (draft?.kind === 'track') onFinishTrack()
          else onDraft(null)
        }}
      />
      {cursor && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-outline-variant bg-surface-container/90 px-2 py-1 text-xs text-on-surface-variant tabular-nums">
          x {(snap?.p ?? cursor).x.toFixed(1)} · y {(snap?.p ?? cursor).y.toFixed(1)}
          {station.meta.chainage && <span className="text-on-surface"> · CH {chainageAt(station.meta.chainage, (snap?.p ?? cursor).x).toFixed(1)} M</span>}
          {snap?.kind === 'node' && <span className="text-secondary"> · node {snap.nodeId}</span>}
          {snap?.kind === 'track' && <span className="text-secondary"> · on {station.tracks.find((t) => t.id === snap.trackId)?.name}</span>}
        </div>
      )}
    </div>
  )
}
