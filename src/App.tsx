import { ArrowLeft, ChevronDown, FilePlus2, Pencil, Play, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  AppHeader,
  blankStation,
  CodeBadge,
  cloneStation,
  deleteDraft,
  EditorView,
  loadDrafts,
  NewStationDialog,
  parseStationFile,
  saveDraft,
  StationViewer,
  stationList,
  ValidationSummary,
  type NewStationInput,
  type Station,
} from '@/sip'
import { hasSimulation } from '@/sim/registry'
import { SimulationView } from '@/sim/ui/SimulationView'
import { btn, btnGhost, btnPrimary, divider } from '@/sip/components/ui'

const bundled = new Map(stationList.map((s) => [s.station.meta.code, s]))

export default function App() {
  // Drafts are stations edited or created in the browser. A draft shadows the bundled station with the same code.
  const [drafts, setDrafts] = useState<Record<string, Station>>(loadDrafts)
  const [code, setCode] = useState(stationList[0]!.station.meta.code)
  const [editing, setEditing] = useState<Station | null>(null)
  const [creating, setCreating] = useState(false)
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // The viewer always shows what is bundled; drafts only appear in the editor.
  const current = stationList.find((e) => e.station.meta.code === code) ?? stationList[0]!
  const station = current.station
  const issues = current.issues

  const saveDraftState = (s: Station) => {
    saveDraft(s)
    setDrafts((d) => ({ ...d, [s.meta.code]: s }))
  }

  /** Open a station in the editor. `persist` stores it at once so a new or imported station is not lost if the user leaves. */
  const openEditor = (s: Station, persist = false) => {
    if (persist) saveDraftState(s)
    setEditing(s)
  }

  const createStation = (input: NewStationInput) => {
    setCreating(false)
    openEditor(blankStation(input), true)
  }

  const importFile = async (file: File) => {
    try {
      const s = parseStationFile(await file.text())
      setImportError(null)
      openEditor(s, true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'That file is not a station.')
    }
  }

  // The simulator is its own page: #/simulate/<station code>.
  const simCode = /^#\/simulate\/([^/]+)$/.exec(hash)?.[1]
  const simStation = simCode ? stationList.find((e) => e.station.meta.code === decodeURIComponent(simCode))?.station : undefined
  if (simStation && hasSimulation(simStation.meta.code)) {
    return (
      <div className="flex h-full flex-col">
        <AppHeader
          section="Interlocking simulation"
          title={
            <>
              {simStation.meta.name}
              <CodeBadge>{simStation.meta.code}</CodeBadge>
            </>
          }
          subtitle={`Driven by the route control chart · ${simStation.meta.ends.west} ← → ${simStation.meta.ends.east}`}
        >
          <a className={btn} href="#/">
            <ArrowLeft className="size-3.5" aria-hidden />
            Station viewer
          </a>
        </AppHeader>
        <main className="relative min-h-0 flex-1">
          <SimulationView key={simStation.meta.code} station={simStation} />
        </main>
      </div>
    )
  }

  if (editing) {
    const original = bundled.has(editing.meta.code)
    return (
      <EditorView
        // The key restarts the editor (history, selection) only when a different station is opened.
        key={editing.meta.code}
        initial={editing}
        drafts={Object.values(drafts).map((d) => ({ code: d.meta.code, name: d.meta.name }))}
        onOpenDraft={(c) => drafts[c] && setEditing(drafts[c])}
        onAutosave={saveDraftState}
        onExit={() => setEditing(null)}
        discardLabel={original ? 'Discard changes (back to the original)' : 'Delete this station'}
        onDiscard={() => {
          const msg = original ? `Discard all your changes to ${editing.meta.name}?` : `Delete ${editing.meta.name}? This cannot be undone.`
          if (!window.confirm(msg)) return
          deleteDraft(editing.meta.code)
          setDrafts((d) => {
            const { [editing.meta.code]: _gone, ...rest } = d
            return rest
          })
          if (!bundled.has(code)) setCode(stationList[0]!.station.meta.code)
          setEditing(null)
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        section="Station viewer"
        title={
          <>
            {station.meta.name}
            <CodeBadge>{station.meta.code}</CodeBadge>
          </>
        }
        subtitle={
          <span title={station.meta.sipRef}>
            {station.meta.ends.west} ← → {station.meta.ends.east}
            {station.meta.sipRef && <span className="text-on-surface-variant/70"> · {station.meta.sipRef}</span>}
          </span>
        }
        context={
          <label className="relative flex shrink-0 items-center">
            <span className="sr-only">Station</span>
            <select
              value={station.meta.code}
              onChange={(e) => setCode(e.target.value)}
              title="Choose a station"
              className="h-8 w-56 appearance-none truncate rounded-md border border-outline-variant bg-surface-container-low pr-8 pl-2.5 text-xs font-medium text-on-surface transition-colors hover:border-outline focus:border-accent focus:outline-none"
            >
              {stationList.map((e) => (
                <option key={e.station.meta.code} value={e.station.meta.code}>
                  {e.station.meta.name} ({e.station.meta.code})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-on-surface-variant" aria-hidden />
          </label>
        }
      >
        {importError && (
          <span className="max-w-56 truncate rounded-md border border-error/40 bg-error/10 px-2 py-1 text-xs text-error" title={importError} role="alert">
            {importError}
          </span>
        )}
        <ValidationSummary issues={issues} />
        <span className={divider} aria-hidden />
        <button type="button" className={btnGhost} onClick={() => setCreating(true)} title="Start a new station from scratch">
          <FilePlus2 className="size-3.5" aria-hidden />
          New station
        </button>
        <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()} title="Open a station JSON file in the editor">
          <Upload className="size-3.5" aria-hidden />
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importFile(file)
          }}
        />
        <button type="button" className={btn} onClick={() => openEditor(drafts[station.meta.code] ?? cloneStation(station))} title="Edit this station (continues your saved draft if there is one). The bundled station is not touched.">
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </button>
        {hasSimulation(station.meta.code) && (
          <a className={btnPrimary} href={`#/simulate/${station.meta.code}`} target="_blank" rel="noopener" title="Open the interlocking simulation for this station in a new page">
            <Play className="size-3.5" aria-hidden />
            Simulate
          </a>
        )}
      </AppHeader>
      <main className="relative min-h-0 flex-1">
        <StationViewer key={station.meta.code} station={station} />
      </main>
      {creating && <NewStationDialog existingCodes={[...stationList.map((e) => e.station.meta.code), ...Object.keys(drafts)]} onCreate={createStation} onCancel={() => setCreating(false)} />}
    </div>
  )
}
