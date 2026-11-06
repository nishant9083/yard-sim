import { Download, FilePlus2, Ruler, Sparkles, Undo2, Upload } from 'lucide-react'
import { useRef } from 'react'
import { autoCircuits, linesTable, parseStationFile } from '@/sip/edit'
import type { Station } from '@/sip/model'
import { buttonClass, NumberField, ReadOnly, Section, TextField } from './fields'

interface StationPanelProps {
  station: Station
  onChange: (station: Station) => void
  onPickOrigin: () => void
  onExport: () => void
  onImport: (station: Station) => void
  onNotice: (text: string) => void
  /** Closes a run of live edits as one undo step. */
  onEnd: () => void
  /** Remove the saved draft and go back to the bundled station (or delete a draft-only station). */
  onDiscard: () => void
  discardLabel: string
}

export function StationPanel({ station, onChange, onPickOrigin, onExport, onImport, onNotice, onEnd, onDiscard, discardLabel }: StationPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { meta, assets } = station
  const setMeta = (patch: Partial<Station['meta']>) => onChange({ ...station, meta: { ...meta, ...patch } })
  const scale = meta.chainage

  return (
    <div className="space-y-4 p-4">
      <Section title="Station">
        <TextField label="Code" value={meta.code} onChange={(v) => setMeta({ code: v.toUpperCase() })} onCommit={onEnd} required />
        <TextField label="Name" value={meta.name} onChange={(v) => setMeta({ name: v })} onCommit={onEnd} required />
        <TextField label="Zone" value={meta.zone} onChange={(v) => setMeta({ zone: v })} onCommit={onEnd} />
        <TextField label="SIP reference" value={meta.sipRef} onChange={(v) => setMeta({ sipRef: v })} onCommit={onEnd} />
        <TextField label="West end" value={meta.ends.west} onChange={(v) => setMeta({ ends: { ...meta.ends, west: v } })} onCommit={onEnd} />
        <TextField label="East end" value={meta.ends.east} onChange={(v) => setMeta({ ends: { ...meta.ends, east: v } })} onCommit={onEnd} />
      </Section>

      <Section title="Chainage">
        {scale ? (
          <>
            <NumberField label="Centre line (x)" value={scale.originX} onChange={(v) => setMeta({ chainage: { ...scale, originX: v } })} onCommit={onEnd} />
            <button type="button" className={buttonClass} onClick={onPickOrigin}>
              <Ruler className="size-3.5" aria-hidden />
              Pick centre line on the drawing
            </button>
            <NumberField label="Metres per drawing unit" value={scale.metresPerUnit} onChange={(v) => setMeta({ chainage: { ...scale, metresPerUnit: v } })} onCommit={onEnd} hint="0.35278 for a 1:1000 drawing in PDF points." />
            <TextField label="Suffix" value={scale.label} onChange={(v) => setMeta({ chainage: { ...scale, label: v } })} onCommit={onEnd} />
            <TextField label="Origin description" value={scale.origin ?? ''} onChange={(v) => setMeta({ chainage: { ...scale, origin: v } })} onCommit={onEnd} />
          </>
        ) : (
          <button type="button" className={buttonClass} onClick={() => {
              setMeta({ chainage: { originX: 0, metresPerUnit: 0.35278, label: 'F/CSB' } })
              onEnd()
            }}>
            Add a chainage scale
          </button>
        )}
      </Section>

      <Section title="Generate">
        <button
          type="button"
          className={`${buttonClass} w-full`}
          onClick={() => {
            const r = autoCircuits(station)
            if (r.added) {
              onChange(r.station)
              onEnd()
            }
            onNotice(r.added ? `Added ${r.added} track circuit${r.added === 1 ? '' : 's'}.` : 'Every section between joints already has a track circuit.')
          }}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Create missing track circuits
        </button>
        <button
          type="button"
          className={`${buttonClass} w-full`}
          disabled={!scale}
          onClick={() => {
            onChange({ ...station, info: { ...station.info, lines: linesTable(station) } })
            onEnd()
            onNotice('Line table refreshed from the drawing.')
          }}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Refresh line table (lengths)
        </button>
      </Section>

      <Section title="Contents">
        <ReadOnly label="Lines">{station.tracks.length}</ReadOnly>
        <ReadOnly label="Connections">{station.connections.length}</ReadOnly>
        <ReadOnly label="Signals">{assets.signals.length}</ReadOnly>
        <ReadOnly label="Points">{assets.points.length}</ReadOnly>
        <ReadOnly label="Track circuits">{assets.trackCircuits.length}</ReadOnly>
        <ReadOnly label="Platforms">{assets.platforms.length}</ReadOnly>
      </Section>

      <Section title="File">
        <button type="button" className={`${buttonClass} w-full`} onClick={onExport}>
          <Download className="size-3.5" aria-hidden />
          Export JSON
        </button>
        <button type="button" className={`${buttonClass} w-full`} onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" aria-hidden />
          Import JSON (replaces this drawing)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              onImport(parseStationFile(await file.text()))
            } catch (err) {
              onNotice(err instanceof Error ? err.message : 'That file is not a station.')
            }
          }}
        />
        <p className="text-[11px] text-on-surface-variant">
          <FilePlus2 className="mr-1 inline size-3" aria-hidden />
          Drop the exported file into <code>src/sip/data</code> to ship it with the app.
        </p>
        <button type="button" className={`${buttonClass} w-full text-error hover:border-error`} onClick={onDiscard}>
          <Undo2 className="size-3.5" aria-hidden />
          {discardLabel}
        </button>
      </Section>
    </div>
  )
}
