import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { entityAnchor, layoutStation } from '@/sip/layout'
import {
  addAnnotation,
  addBridge,
  addConnection,
  addJoint,
  addLineArrow,
  addCircuitAt,
  addPlatform,
  addPoint,
  addSignal,
  addStructure,
  addTrackVertex,
  anchorOfSnap,
  anchorPoint,
  gridPitch,
  insertOutlineVertex,
  insertVertex,
  isMovable,
  moveEntity,
  moveOutlineVertex,
  nearestOutlineEdge,
  nearestTrack,
  outlineOf,
  OUTLINE_STRUCTURES,
  removeOutlineVertex,
  snapPoint,
  snapToGrid,
  splitTrack,
  editHandles,
  type Draft,
  type EditHandle as Handle,
  type MoveOptions,
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
  worldToScreen,
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
  /** Finish the line or outline being drawn. */
  onFinishDraft: () => void
  onNotice: (text: string) => void
  onMergeRequest: (aId: string, bId: string) => void
}

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number; moved: boolean; downAt: Point; tap: EntityRef | null }
  | { kind: 'move'; ref: EntityRef; base: Station; startWorld: Point; moved: boolean; part?: MoveOptions['part'] }
  /** Dragging one corner of a platform / building outline. */
  | { kind: 'corner'; ref: EntityRef; index: number; base: Station; from: Point; startWorld: Point; moved: boolean }
  /** Platform / building tool: a drag draws a rectangle, a click adds an outline corner. */
  | { kind: 'rect'; a: Point; downAt: Point; moved: boolean }

const HIT_PX = 8
const NODE_PX = 9
const HANDLE_PX = 7
const NEAR_TRACK_PX = 28
const VERTEX_TRACK_PX = 14
const CLOSE_PX = 10
const DRAG_PX = 4
const DEFAULT_VIEW = { minX: 0, minY: -120, maxX: 2400, maxY: 480 }

const POINT_ON_LINE_TOOLS: ToolId[] = ['signal', 'joint', 'arrow', 'circuit', 'bridge']
const DRAW_TOOLS: ToolId[] = ['track', 'vertex', 'merge', 'split', 'connect', 'point', 'text', 'origin', ...POINT_ON_LINE_TOOLS]

/** Shift: keep only the larger of the two movements, so the drag runs along one axis. */
const lockAxis = (dx: number, dy: number): [number, number] => (Math.abs(dx) >= Math.abs(dy) ? [dx, 0] : [0, dy])

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
  onFinishDraft,
  onNotice,
  onMergeRequest,
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
  const handles = useMemo(() => (tool === 'select' ? editHandles(station, selected) : []), [selected, station, tool])
  const drawsOutline = tool === 'platform' || (tool === 'structure' && OUTLINE_STRUCTURES.includes(options.structureKind))

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

  /** Handle of the selected item under the pointer. Corners win over mid-edge handles. */
  const pickHandle = useCallback(
    (screen: Point): Handle | null => {
      let best: { h: Handle; d: number } | null = null
      for (const h of handles) {
        const s = worldToScreen(camera, h.p)
        const d = Math.hypot(s.x - screen.x, s.y - screen.y) + (h.kind === 'corner' ? 0 : 2)
        if (d <= HANDLE_PX && (!best || d < best.d)) best = { h, d }
      }
      return best?.h ?? null
    },
    [camera, handles],
  )

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
      const symbol = hitTest(layout, camera, screen, { includeNodes: false, regions: regionsRef.current, tolerance: HIT_PX, layers })
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
      if (tool === 'vertex') return snapPoint(station, world, { tolerance: VERTEX_TRACK_PX / camera.zoom, grid: pitch, nodes: false })
      if (tool === 'point') return snapPoint(station, world, { tolerance: 12 / camera.zoom, grid: null })
      if (tool === 'connect') return snapPoint(station, world, { tolerance: 10 / camera.zoom, grid: null })
      if (tool === 'platform' || tool === 'structure') {
        const p = shift && last ? { x: world.x, y: last.y } : world
        return { kind: 'free', p: snapToGrid(p, pitch) }
      }
      const s = snapPoint(station, shift && last ? { x: world.x, y: last.y } : world, { tolerance: tol, grid: pitch })
      return s.kind === 'free' && shift && last ? { kind: 'free', p: { x: snapToGrid(world, pitch).x, y: last.y } } : s
    },
    [camera.zoom, gridPitchNow, layout, station, tool],
  )

  /** Last fixed point of the line or outline being drawn (for Shift = keep level). */
  const lastDraftPoint = (): Point | undefined => {
    if (draft?.kind === 'track') {
      const a = draft.anchors[draft.anchors.length - 1]
      return a ? (anchorPoint(station, a) ?? undefined) : undefined
    }
    if (draft?.kind === 'poly') return draft.points[draft.points.length - 1]
    return undefined
  }

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
      // 1. handles of the selected item
      const handle = pickHandle(screen)
      if (handle?.kind === 'corner') {
        gesture.current = { kind: 'corner', ref: handle.ref, index: handle.index, base: station, from: handle.p, startWorld: world, moved: false }
        return
      }
      if (handle?.kind === 'edgeMid') {
        // Pull a new corner out of the middle of the edge.
        const r = insertOutlineVertex(station, handle.ref, handle.p)
        if (r) {
          onLive(r.station)
          gesture.current = { kind: 'corner', ref: handle.ref, index: r.index, base: r.station, from: handle.p, startWorld: world, moved: true }
          return
        }
      }
      if (handle?.kind === 'trackMid') {
        // Pull a new bend out of the middle of the segment; the line stays selected.
        const r = insertVertex(station, handle.trackId, handle.p)
        if (r.ref) {
          onLive(r.station)
          gesture.current = { kind: 'move', ref: r.ref, base: r.station, startWorld: world, moved: true }
          return
        }
      }

      // 2. anything movable
      const hit = pick(screen)
      if (hit && isMovable(hit)) {
        let part: MoveOptions['part']
        if (hit.type === 'point') {
          // The ring moves the point; the code beside it moves only the label.
          const pm = station.assets.points.find((p) => p.id === hit.id)
          const node = pm && station.nodes.find((n) => n.id === pm.nodeId)
          const ring = node ? worldToScreen(camera, node) : null
          part = ring && Math.hypot(ring.x - screen.x, ring.y - screen.y) <= NODE_PX ? 'body' : 'label'
        }
        onSelect(hit)
        gesture.current = { kind: 'move', ref: hit, base: station, startWorld: world, moved: false, part }
        return
      }
      return startPan(e, hit)
    }
    if (tool === 'platform' || tool === 'structure') {
      gesture.current = { kind: 'rect', a: snapToGrid(world, gridPitchNow), downAt: screen, moved: false }
      return
    }
    startPan(e)
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const screen = local(e)
    const world = screenToWorld(camera, screen)
    const g = gesture.current
    // Ctrl / Cmd snaps a drag to the grid (whether or not the grid is shown); otherwise drags are free.
    const pitch = e.ctrlKey || e.metaKey ? gridPitch(camera.zoom) : null

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

    if (g?.kind === 'move' || g?.kind === 'corner') {
      if (!g.moved && Math.hypot(world.x - g.startWorld.x, world.y - g.startWorld.y) * camera.zoom > DRAG_PX) g.moved = true
      if (!g.moved) return
      let dx = world.x - g.startWorld.x
      let dy = world.y - g.startWorld.y
      if (e.shiftKey) [dx, dy] = lockAxis(dx, dy)
      setCursor(world)

      if (g.kind === 'corner') {
        let target = { x: g.from.x + dx, y: g.from.y + dy }
        if (pitch) {
          const snapped = snapToGrid(target, pitch)
          target = { x: e.shiftKey && dx === 0 ? target.x : snapped.x, y: e.shiftKey && dy === 0 ? target.y : snapped.y }
        }
        onLive(moveOutlineVertex(g.base, g.ref, g.index, target))
        return
      }

      // Things whose position is a vertex snap that vertex to the grid; others snap the movement.
      const vertexId = g.ref.type === 'node' ? g.ref.id : g.ref.type === 'point' && g.part !== 'label' ? g.base.assets.points.find((p) => p.id === g.ref.id)?.nodeId : undefined
      if (pitch) {
        const node = vertexId ? g.base.nodes.find((n) => n.id === vertexId) : undefined
        if (node) {
          const target = snapToGrid({ x: node.x + dx, y: node.y + dy }, pitch)
          // With Shift one axis is already locked (0): keep it locked.
          dx = e.shiftKey && dx === 0 ? 0 : target.x - node.x
          dy = e.shiftKey && dy === 0 ? 0 : target.y - node.y
        } else {
          dx = Math.round(dx / pitch) * pitch
          dy = Math.round(dy / pitch) * pitch
        }
      }
      onLive(moveEntity(g.base, g.ref, dx, dy, { cursor: world, part: g.part }))
      return
    }

    if (g?.kind === 'rect') {
      if (!g.moved && Math.hypot(screen.x - g.downAt.x, screen.y - g.downAt.y) > DRAG_PX && draft?.kind !== 'poly') g.moved = true
      if (g.moved) onDraft({ kind: 'rect', a: g.a, b: snapToGrid(world, gridPitchNow) })
      return
    }

    setCursor(world)
    if (tool === 'select' || tool === 'pan') {
      const ref = spaceDown || tool === 'pan' ? null : pick(screen)
      if (!sameEntity(ref, hovered)) setHovered(ref)
      setSnap(null)
    } else {
      if (hovered) setHovered(null)
      setSnap(snapFor(world, e.shiftKey, lastDraftPoint()))
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current
    gesture.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!g) return
    const screen = local(e)
    const world = screenToWorld(camera, screen)

    if (g.kind === 'move' || g.kind === 'corner') return onGestureEnd()

    if (g.kind === 'rect') {
      if (g.moved) {
        const b = snapToGrid(world, gridPitchNow)
        onDraft(null)
        if (tool === 'platform') return create(addPlatform(station, g.a, b), 'That platform is too small.')
        return create(addStructure(station, options.structureKind, g.a, b))
      }
      if (drawsOutline) return addOutlineCorner(screen, world, e.shiftKey)
      // Boxes on posts and the LVV are placed with a click.
      return create(addStructure(station, options.structureKind, g.a, g.a), 'Place the LVV on a line.')
    }

    if (g.moved) return
    // A click, not a drag.
    if (tool === 'select' || tool === 'pan') return onSelect(tool === 'select' ? g.tap : null)
    tap(world, e.shiftKey)
  }

  /** Platform / building outline: each click adds a corner; clicking the first corner closes it. */
  const addOutlineCorner = (screen: Point, world: Point, shift: boolean) => {
    const pts = draft?.kind === 'poly' ? draft.points : []
    const first = pts[0]
    if (first && pts.length >= 3) {
      const s = worldToScreen(camera, first)
      if (Math.hypot(s.x - screen.x, s.y - screen.y) <= CLOSE_PX) return onFinishDraft()
    }
    const p = snapFor(world, shift, pts[pts.length - 1]).p
    const prev = pts[pts.length - 1]
    if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.5) return
    onDraft({ kind: 'poly', points: [...pts, p] })
  }

  const tap = (world: Point, shift: boolean) => {
    const s = snapFor(world, shift, lastDraftPoint())

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
      case 'vertex': {
        // 1. the edge of the selected platform / building
        const outline = outlineOf(station, selected)
        if (outline && selected) {
          const edge = nearestOutlineEdge(outline, world)
          if (edge && edge.d * camera.zoom <= VERTEX_TRACK_PX) {
            const r = insertOutlineVertex(station, selected, world)
            if (r) return onCommit({ station: r.station, ref: selected })
          }
        }
        // 2. a line under the pointer: add a bend there
        if (s.kind === 'track') {
          const r = addTrackVertex(station, s.trackId, s.p)
          return create({ station: r.station, ref: { type: 'track', id: s.trackId } }, 'There is already a vertex there.')
        }
        // 3. beyond the end of the selected line: extend it
        if (selected?.type === 'track') {
          const r = addTrackVertex(station, selected.id, s.p)
          return create({ station: r.station, ref: selected })
        }
        if (outline) return onNotice('Click on an edge of the selected shape to add a corner.')
        return onNotice('Click a line to add a bend, or select a line first and click beyond its end to extend it.')
      }
      case 'merge': {
        if (s.kind !== 'track') return onNotice('Click on a line.')
        if (draft?.kind !== 'merge') {
          onDraft({ kind: 'merge', firstTrackId: s.trackId })
          onNotice('Now click the connected line to merge.')
          return
        }
        if (draft.firstTrackId === s.trackId) return onNotice('Choose a different line.')
        onDraft(null)
        onMergeRequest(draft.firstTrackId, s.trackId)
        return
      }
      case 'split': {
        if (s.kind !== 'track') return onNotice('Click on a line.')
        const result = splitTrack(station, s.trackId, s.p)
        if (result.station === station) return onNotice('Click inside the line, away from its ends.')
        onCommit(result)
        onNotice('Line split into two parts.')
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
      case 'arrow':
        if (s.kind !== 'track') return onNotice('Click on a line.')
        return create(addLineArrow(station, s.trackId, s.p.x, options.arrowDirection))
      case 'circuit':
        if (s.kind !== 'track') return onNotice('Click on a line.')
        return create(addCircuitAt(station, s.trackId, s.p.x), 'Could not work out the section here.')
      case 'bridge':
        if (s.kind !== 'track') return onNotice('Click on a line.')
        return create(addBridge(station, s.p.x))
      case 'text':
        return create(addAnnotation(station, snapToGrid(world, gridPitchNow)))
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
    if (tool === 'track' || draft?.kind === 'poly') return onFinishDraft()
    if (tool !== 'select') return
    const rect = e.currentTarget.getBoundingClientRect()
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const world = screenToWorld(camera, screen)

    // Selected outline: double-click a corner to remove it, an edge to add one.
    const outline = outlineOf(station, selected)
    if (outline && selected) {
      const handle = pickHandle(screen)
      if (handle?.kind === 'corner') {
        if (outline.length <= 3) return onNotice('A shape needs at least three corners.')
        return onCommit({ station: removeOutlineVertex(station, selected, handle.index), ref: selected })
      }
      const edge = nearestOutlineEdge(outline, world)
      if (edge && edge.d * camera.zoom <= HIT_PX) {
        const r = insertOutlineVertex(station, selected, world)
        if (r) return onCommit({ station: r.station, ref: selected })
      }
    }
    const hit = pick(screen)
    if (hit?.type === 'track') create(insertVertex(station, hit.id, world))
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

  const shown = snap?.p ?? cursor
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
          if (draft?.kind === 'track' || draft?.kind === 'poly') onFinishDraft()
          else onDraft(null)
        }}
      />
      {shown && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-outline-variant bg-surface-container/90 px-2 py-1 text-xs text-on-surface-variant tabular-nums">
          x {shown.x.toFixed(1)} · y {shown.y.toFixed(1)}
          {station.meta.chainage && <span className="text-on-surface"> · CH {chainageAt(station.meta.chainage, shown.x).toFixed(1)} M</span>}
          {snap?.kind === 'node' && <span className="text-secondary"> · node {snap.nodeId}</span>}
          {snap?.kind === 'track' && <span className="text-secondary"> · on {station.tracks.find((t) => t.id === snap.trackId)?.name}</span>}
        </div>
      )}
    </div>
  )
}
