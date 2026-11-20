import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Grid3x3, Maximize2, Redo2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addPlatformOutline,
  addStructureOutline,
  addTrack,
  DEFAULT_TOOL_OPTIONS,
  isMovable,
  moveEntity,
  deleteEntity,
  downloadStation,
  editorIssues,
  mergeTracks,
  TOOL_HELP,
  updateEntity,
  useHistory,
  type Draft,
  type OpResult,
  type TrackPropertyChoices,
  type TrackPropertyKey,
  type ToolId,
  type ToolOptions,
} from '@/sip/edit'
import type { EntityRef, Station } from '@/sip/model'
import { DEFAULT_LAYERS, type LayerVisibility } from '@/sip/render'
import { AssetsPanel } from '../AssetsPanel'
import { LayerMenu } from '../LayerMenu'
import { EditorCanvas } from './EditorCanvas'
import { buttonClass } from './fields'
import { IssuesPanel } from './IssuesPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { StationPanel } from './StationPanel'
import { TOOL_GROUPS, ToolPalette } from './ToolPalette'

interface EditorViewProps {
  initial: Station
  /** Called (debounced) with every change so the draft survives a reload. */
  onAutosave: (station: Station) => void
  /** Back to the viewer. */
  onExit: () => void
  /** Drop the draft: revert a bundled station to its original, or delete a station created here. */
  onDiscard: () => void
  discardLabel: string
  /** Saved drafts, so the user can switch between them without leaving the editor. */
  drafts: { code: string; name: string }[]
  onOpenDraft: (code: string) => void
}

type PanelTab = 'properties' | 'issues' | 'objects' | 'station'

const SHORTCUTS = new Map<string, ToolId>(TOOL_GROUPS.flatMap((g) => g.tools.map((t) => [t.key.toLowerCase(), t.id] as const)))
const EDIT_LAYERS: LayerVisibility = { ...DEFAULT_LAYERS, nodes: true, routes: true }

export function EditorView({ initial, onAutosave, onExit, onDiscard, discardLabel, drafts, onOpenDraft }: EditorViewProps) {
  const history = useHistory(initial)
  const { station } = history
  const [tool, setTool] = useState<ToolId>(initial.nodes.length === 0 ? 'track' : 'select')
  const [options, setOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [selected, setSelected] = useState<EntityRef | null>(null)
  const [tab, setTab] = useState<PanelTab>('properties')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [grid, setGrid] = useState(true)
  const [layers, setLayers] = useState<LayerVisibility>(EDIT_LAYERS)
  const [fitToken, setFitToken] = useState(0)
  const [focus, setFocus] = useState<{ ref: EntityRef; token: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saved, setSaved] = useState<'idle' | 'saved'>('idle')
  const [mergePending, setMergePending] = useState<{ aId: string; bId: string } | null>(null)
  const [mergeChoices, setMergeChoices] = useState<TrackPropertyChoices>({
    name: 'a',
    kind: 'a',
    direction: 'a',
    lineNo: 'a',
    remarks: 'a',
  })

  const issues = useMemo(() => editorIssues(station), [station])
  const errors = issues.filter((i) => i.level === 'error').length

  // Latest station for event handlers that outlive a render.
  const stationRef = useRef(station)
  stationRef.current = station

  // Autosave.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaved('idle')
    const id = window.setTimeout(() => {
      onAutosave(station)
      setSaved('saved')
    }, 600)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 3800)
    return () => window.clearTimeout(id)
  }, [notice])

  const chooseTool = useCallback((next: ToolId) => {
    setTool(next)
    setDraft(null)
  }, [])

  const select = useCallback((ref: EntityRef | null) => {
    setSelected(ref)
    if (ref) setTab('properties')
  }, [])

  const commitResult = useCallback(
    ({ station: next, ref }: OpResult) => {
      history.commit(next)
      if (ref) {
        setSelected(ref)
        setTab('properties')
      }
    },
    [history],
  )

  const finishTrack = useCallback(() => {
    if (draft?.kind === 'track' && draft.anchors.length >= 2) {
      commitResult(addTrack(station, draft.anchors, { kind: options.trackKind, direction: 'BOTH' }))
    }
    if (draft?.kind === 'poly') {
      const result = tool === 'platform' ? addPlatformOutline(station, draft.points) : addStructureOutline(station, options.structureKind, draft.points)
      if (result.station === station) setNotice('An outline needs at least three corners.')
      else commitResult(result)
    }
    setDraft(null)
  }, [commitResult, draft, options.structureKind, options.trackKind, station, tool])

  /** Arrow keys nudge the selection by one drawing unit (ten with Shift). */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selected || !isMovable(selected)) return false
      const next = moveEntity(station, selected, dx, dy)
      if (next !== station) history.commit(next)
      return true
    },
    [history, selected, station],
  )

  const remove = useCallback(() => {
    if (!selected) return
    history.commit(deleteEntity(station, selected))
    setSelected(null)
  }, [history, selected, station])

  const requestMerge = useCallback((aId: string, bId: string) => {
    setMergeChoices({ name: 'a', kind: 'a', direction: 'a', lineNo: 'a', remarks: 'a' })
    setMergePending({ aId, bId })
  }, [])

  const applyMerge = useCallback(() => {
    if (!mergePending) return
    const result = mergeTracks(stationRef.current, mergePending.aId, mergePending.bId, mergeChoices)
    if (result.station === stationRef.current) {
      setNotice('Lines must meet at an end point before they can be merged.')
    } else {
      commitResult(result)
      setNotice('Lines merged.')
    }
    setMergePending(null)
  }, [commitResult, mergeChoices, mergePending])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return e.shiftKey ? history.redo() : history.undo()
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        return history.redo()
      }
      if (mod || e.altKey) return
      if (e.key === 'Escape') {
        if (draft) setDraft(null)
        else if (tool !== 'select') chooseTool('select')
        else setSelected(null)
      } else if (e.key === 'Enter') {
        finishTrack()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (draft?.kind === 'track') {
          e.preventDefault()
          setDraft(draft.anchors.length <= 1 ? null : { kind: 'track', anchors: draft.anchors.slice(0, -1) })
        } else if (draft?.kind === 'poly') {
          e.preventDefault()
          setDraft(draft.points.length <= 1 ? null : { kind: 'poly', points: draft.points.slice(0, -1) })
        } else if (selected) {
          e.preventDefault()
          remove()
        }
      } else if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 10 : 1
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (d && nudge(d[0]!, d[1]!)) e.preventDefault()
      } else {
        const next = SHORTCUTS.get(e.key.toLowerCase())
        if (next) chooseTool(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chooseTool, draft, finishTrack, history, nudge, remove, selected, tool])

  // Keep the selection valid after undo / redo / delete.
  useEffect(() => {
    if (!selected) return
    const exists = issuesLookup(station, selected)
    if (!exists) setSelected(null)
  }, [station, selected])

  const hint =
    draft?.kind === 'poly'
      ? draft.points.length < 3
        ? 'Click the next corner. Shift keeps the edge level. Esc cancels.'
        : 'Click to add corners. Click the first corner, double-click, Enter or right-click to close the shape. Backspace removes the last corner.'
      : draft?.kind === 'track'
      ? draft.anchors.length < 2
        ? 'Click the next point of the line. Esc cancels.'
        : 'Click to add bends. Double-click, Enter or right-click to finish. Backspace removes the last point.'
      : draft?.kind === 'connect'
        ? 'Now click the spot on the other line.'
      : draft?.kind === 'merge'
        ? 'First line chosen. Click a second line that meets it end-to-end.'
        : TOOL_HELP[tool]

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface-container px-3 py-2">
        <button type="button" className={buttonClass} onClick={onExit}>
          <ArrowLeft className="size-3.5" aria-hidden />
          Viewer
        </button>
        <div className="min-w-0 px-1">
          <h1 className="truncate text-sm font-medium text-on-surface">
            Editing {station.meta.name || 'untitled'} <span className="text-on-surface-variant">({station.meta.code || '–'})</span>
          </h1>
        </div>
        {drafts.some((d) => d.code !== station.meta.code) && (
          <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            Draft
            <select
              value={station.meta.code}
              onChange={(e) => onOpenDraft(e.target.value)}
              className="rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface focus-visible:outline-2 focus-visible:outline-secondary"
            >
              {(drafts.some((d) => d.code === station.meta.code) ? drafts : [...drafts, { code: station.meta.code, name: station.meta.name }]).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name || d.code} ({d.code})
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />
        <button type="button" className={buttonClass} onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
          <Undo2 className="size-3.5" aria-hidden />
          Undo
        </button>
        <button type="button" className={buttonClass} onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y)">
          <Redo2 className="size-3.5" aria-hidden />
          Redo
        </button>
        <button type="button" className={`${buttonClass} ${grid ? 'bg-surface-container-high' : ''}`} aria-pressed={grid} onClick={() => setGrid((g) => !g)} title="Show the grid and snap new drawing to it. Moves are free: hold Ctrl while dragging to snap a move to the grid.">
          <Grid3x3 className="size-3.5" aria-hidden />
          Grid
        </button>
        <button type="button" className={buttonClass} onClick={() => setFitToken((t) => t + 1)} title="Fit the drawing in view">
          <Maximize2 className="size-3.5" aria-hidden />
          Fit
        </button>
        <LayerMenu layers={layers} onChange={setLayers} />
        {draft?.kind === 'track' && draft.anchors.length >= 2 && (
          <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary" onClick={finishTrack}>
            Finish line
          </button>
        )}
        {draft?.kind === 'poly' && draft.points.length >= 3 && (
          <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary" onClick={finishTrack}>
            Close shape
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-on-surface-variant" aria-live="polite">
          {saved === 'saved' ? (
            <>
              <Check className="size-3.5 text-sip-tc-b" aria-hidden />
              Draft saved
            </>
          ) : (
            'Unsaved changes…'
          )}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <div className="relative flex h-full shrink-0">
            <ToolPalette tool={tool} onTool={chooseTool} options={options} onOptions={setOptions} />
            <button type="button" onClick={() => setLeftOpen(false)} aria-label="Collapse tools panel" title="Collapse tools panel" className="absolute top-1.5 right-1.5 rounded p-0.5 text-on-surface-variant hover:text-on-surface">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex h-full w-9 shrink-0 flex-col border-r border-outline-variant bg-surface-container">
            <button type="button" onClick={() => setLeftOpen(true)} aria-label="Expand tools panel" title="Expand tools panel" className="flex w-full items-center justify-center py-2.5 text-on-surface-variant hover:text-on-surface">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <main className="relative min-w-0 flex-1">
          <EditorCanvas
            station={station}
            tool={tool}
            options={options}
            grid={grid}
            layers={layers}
            selected={selected}
            draft={draft}
            fitToken={fitToken}
            focus={focus}
            onDraft={setDraft}
            onSelect={select}
            onCommit={commitResult}
            onLive={history.live}
            onGestureEnd={history.end}
            onFinishDraft={finishTrack}
            onNotice={setNotice}
            onMergeRequest={requestMerge}
          />
          <p className="pointer-events-none absolute bottom-3 left-1/2 max-w-[min(38rem,60%)] -translate-x-1/2 rounded-lg border border-outline-variant bg-surface-container/90 px-3 py-1.5 text-center text-xs text-on-surface-variant backdrop-blur">
            {hint}
          </p>
          {notice && (
            <p role="status" className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-lg border border-primary/40 bg-surface-container px-3 py-1.5 text-xs text-on-surface shadow-lg">
              {notice}
            </p>
          )}
          {station.nodes.length === 0 && tool === 'track' && !draft && (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-on-surface-variant">
              Start by clicking where the first line begins.
            </p>
          )}
          {mergePending && (() => {
            const a = station.tracks.find((t) => t.id === mergePending.aId)
            const b = station.tracks.find((t) => t.id === mergePending.bId)
            if (!a || !b) return null
            const propertyRows: { key: TrackPropertyKey; label: string; a: string; b: string }[] = [
              { key: 'name', label: 'Name', a: a.name, b: b.name },
              { key: 'kind', label: 'Type', a: a.kind, b: b.kind },
              { key: 'direction', label: 'Direction', a: a.direction, b: b.direction },
              { key: 'lineNo', label: 'Line number', a: a.lineNo?.toString() ?? 'None', b: b.lineNo?.toString() ?? 'None' },
              { key: 'remarks', label: 'Remarks', a: a.remarks ?? '', b: b.remarks ?? '' },
            ]
            return (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 p-4">
                <div role="dialog" aria-modal="true" aria-label="Merge line properties" className="w-[32rem] max-w-full rounded-lg border border-outline-variant bg-surface-container p-4 shadow-xl">
                  <h2 className="text-sm font-medium text-on-surface">Merge lines</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">Choose the property values to keep on the merged line.</p>
                  <div className="mt-3 space-y-2">
                    {propertyRows.map((row) => (
                      <div key={row.key} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 text-xs">
                        <span className="text-on-surface-variant">{row.label}</span>
                        {(['a', 'b'] as const).map((source) => (
                          <button
                            key={source}
                            type="button"
                            aria-pressed={mergeChoices[row.key] === source}
                            onClick={() => setMergeChoices((c) => ({ ...c, [row.key]: source }))}
                            className={`min-w-0 truncate rounded-md border px-2 py-1.5 text-left ${mergeChoices[row.key] === source ? 'border-primary bg-primary/10 text-on-surface' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'}`}
                            title={source === 'a' ? row.a : row.b}
                          >
                            {source === 'a' ? row.a || 'None' : row.b || 'None'}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" className={buttonClass} onClick={() => setMergePending(null)}>Cancel</button>
                    <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary" onClick={applyMerge}>Merge lines</button>
                  </div>
                </div>
              </div>
            )
          })()}
        </main>

        <aside className={`flex h-full shrink-0 flex-col border-l border-outline-variant bg-surface-container ${rightOpen ? 'w-88 max-w-[40vw]' : 'w-9'}`}>
          {!rightOpen && (
            <button type="button" onClick={() => setRightOpen(true)} aria-label="Expand side panel" title="Expand side panel" className="flex w-full items-center justify-center py-2.5 text-on-surface-variant hover:text-on-surface">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          )}
          <div className={rightOpen ? 'contents' : 'hidden'}>
          <div role="tablist" aria-label="Editor panels" className="flex border-b border-outline-variant">
            {(
              [
                ['properties', 'Properties'],
                ['issues', 'Issues'],
                ['objects', 'Objects'],
                ['station', 'Station'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-secondary ${
                  tab === id ? 'border-primary text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {label}
                {id === 'issues' && issues.length > 0 && (
                  <span className={`rounded-full px-1.5 text-[10px] ${errors ? 'bg-error text-surface' : 'bg-primary text-on-primary'}`}>{issues.length}</span>
                )}
              </button>
            ))}
            <button type="button" onClick={() => setRightOpen(false)} aria-label="Collapse side panel" title="Collapse side panel" className="px-2 text-on-surface-variant hover:text-on-surface">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'properties' && (
              <PropertiesPanel
                station={station}
                selected={selected}
                onEdit={(ref, patch) => history.live(updateEntity(stationRef.current, ref, patch))}
                onChange={(change) => history.live(change(stationRef.current))}
                onCommit={history.end}
                onDelete={remove}
                onSelect={(ref) => {
                  select(ref)
                  setFocus((f) => ({ ref, token: (f?.token ?? 0) + 1 }))
                }}
              />
            )}
            {tab === 'issues' && (
              <IssuesPanel
                station={station}
                issues={issues}
                onSelect={(ref) => {
                  setSelected(ref)
                  setFocus((f) => ({ ref, token: (f?.token ?? 0) + 1 }))
                  setTab('properties')
                }}
              />
            )}
            {tab === 'objects' && (
              <AssetsPanel
                station={station}
                selected={selected}
                onSelect={(ref) => {
                  select(ref)
                  setFocus((f) => ({ ref, token: (f?.token ?? 0) + 1 }))
                }}
              />
            )}
            {tab === 'station' && (
              <StationPanel
                station={station}
                onChange={history.live}
                onEnd={history.end}
                onPickOrigin={() => chooseTool('origin')}
                onExport={() => downloadStation(station)}
                onImport={(next) => {
                  history.reset(next)
                  setSelected(null)
                  setFitToken((t) => t + 1)
                  setNotice('Imported.')
                }}
                onNotice={setNotice}
                onDiscard={onDiscard}
                discardLabel={discardLabel}
              />
            )}
          </div>
          {errors > 0 && tab !== 'issues' && (
            <button type="button" onClick={() => setTab('issues')} className="flex items-center gap-2 border-t border-outline-variant px-4 py-2 text-left text-xs text-error">
              <CircleAlert className="size-3.5" aria-hidden />
              {errors} error{errors === 1 ? '' : 's'} in this drawing
            </button>
          )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** True while the entity still exists in the station. */
function issuesLookup(station: Station, ref: EntityRef): boolean {
  const { assets } = station
  switch (ref.type) {
    case 'track':
      return station.tracks.some((t) => t.id === ref.id)
    case 'connection':
      return station.connections.some((c) => c.id === ref.id)
    case 'node':
      return station.nodes.some((n) => n.id === ref.id)
    case 'point':
      return assets.points.some((x) => x.id === ref.id)
    case 'signal':
      return assets.signals.some((x) => x.id === ref.id)
    case 'trackCircuit':
      return assets.trackCircuits.some((x) => x.id === ref.id)
    case 'joint':
      return assets.joints.some((x) => x.id === ref.id)
    case 'lineArrow':
      return assets.lineArrows.some((x) => x.id === ref.id)
    case 'platform':
      return assets.platforms.some((x) => x.id === ref.id)
    case 'structure':
      return assets.structures.some((x) => x.id === ref.id)
    case 'bridge':
      return assets.bridges.some((x) => x.id === ref.id)
    case 'annotation':
      return assets.annotations.some((x) => x.id === ref.id)
    default:
      return true
  }
}
