import { FilePlus2, Pencil, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  blankStation,
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

const bundled = new Map(stationList.map((s) => [s.station.meta.code, s]))

const headerButton =
  'flex h-8 items-center gap-1.5 rounded-md border border-outline-variant px-2.5 text-xs text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary'

export default function App() {
  // Drafts are stations edited or created in the browser. A draft shadows the bundled station with the same code.
  const [drafts, setDrafts] = useState<Record<string, Station>>(loadDrafts)
  const [code, setCode] = useState(stationList[0]!.station.meta.code)
  const [editing, setEditing] = useState<Station | null>(null)
  const [creating, setCreating] = useState(false)
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
      <header className="flex items-center justify-between gap-4 border-b border-outline-variant bg-surface-container px-4 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium text-on-surface">
            {station.meta.name} <span className="text-on-surface-variant">({station.meta.code})</span>
          </h1>
          <p className="truncate text-xs text-on-surface-variant">
            {station.meta.sipRef} · {station.meta.ends.west} ← → {station.meta.ends.east}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {importError && <span className="max-w-64 truncate text-xs text-error" title={importError}>{importError}</span>}
          <label className="flex items-center gap-2 text-xs text-on-surface-variant">
            Station
            <select
              value={station.meta.code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface focus-visible:outline-2 focus-visible:outline-secondary"
            >
              {stationList.map((e) => (
                <option key={e.station.meta.code} value={e.station.meta.code}>
                  {e.station.meta.name} ({e.station.meta.code})
                </option>
              ))}
            </select>
          </label>
          <ValidationSummary issues={issues} />
          <span className="h-5 w-px bg-outline-variant" aria-hidden />
          <button type="button" className={headerButton} onClick={() => openEditor(drafts[station.meta.code] ?? cloneStation(station))} title="Edit this station (continues your saved draft if there is one). The bundled station is not touched.">
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </button>
          <button type="button" className={headerButton} onClick={() => setCreating(true)}>
            <FilePlus2 className="size-3.5" aria-hidden />
            New station
          </button>
          <button type="button" className={headerButton} onClick={() => fileRef.current?.click()} title="Open a station JSON file in the editor">
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
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <StationViewer key={station.meta.code} station={station} />
      </main>
      {creating && <NewStationDialog existingCodes={[...stationList.map((e) => e.station.meta.code), ...Object.keys(drafts)]} onCreate={createStation} onCancel={() => setCreating(false)} />}
    </div>
  )
}
