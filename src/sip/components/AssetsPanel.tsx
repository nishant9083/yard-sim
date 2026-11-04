import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SIGNAL_KIND_NAME, sameEntity, type EntityRef, type Station } from '@/sip/model'

interface AssetsPanelProps {
  station: Station
  selected: EntityRef | null
  onSelect: (ref: EntityRef) => void
}

interface Row {
  ref: EntityRef
  code: string
  detail: string
}

interface Group {
  title: string
  rows: Row[]
}

export function AssetsPanel({ station, selected, onSelect }: AssetsPanelProps) {
  const [query, setQuery] = useState('')
  const { assets } = station

  const groups = useMemo<Group[]>(
    () => [
      {
        title: 'Signals',
        rows: assets.signals.map((s) => ({
          ref: { type: 'signal', id: s.id },
          code: s.code,
          detail: `${SIGNAL_KIND_NAME[s.kind]} · ${s.direction}${s.control !== undefined ? ` · control ${s.control}` : ''}`,
        })),
      },
      {
        title: 'Points',
        rows: assets.points.map((p) => ({
          ref: { type: 'point', id: p.id },
          code: p.code,
          detail: `${p.ratio} ${p.switch} · ${p.crankHandle ?? ''} · control ${p.control}`,
        })),
      },
      {
        title: 'Track circuits',
        rows: assets.trackCircuits.map((t) => ({
          ref: { type: 'trackCircuit', id: t.id },
          code: t.code,
          detail: t.kind === 'axleCounter' ? (t.text ?? 'axle counter') : t.spans.map((s) => ('trackId' in s ? s.trackId : s.connectionId)).filter((v, i, a) => a.indexOf(v) === i).join(', '),
        })),
      },
      {
        title: 'Platforms',
        rows: assets.platforms.map((p) => ({ ref: { type: 'platform', id: p.id }, code: p.name, detail: `${p.lengthM} M × ${p.widthM} M` })),
      },
      {
        title: 'Bridges',
        rows: assets.bridges.map((b) => ({ ref: { type: 'bridge', id: b.id }, code: `BR ${b.number}${b.isNew ? ' (NEW)' : ''}`, detail: `CH:${b.chainage.toFixed(2)}M · ${b.spec}` })),
      },
      {
        title: 'Structures',
        rows: assets.structures
          .filter((s) => s.kind !== 'fob' || s.id === 'FOB_V')
          .map((s) => ({ ref: { type: 'structure', id: s.id }, code: s.name, detail: s.kind })),
      },
    ],
    [assets],
  )

  const q = query.trim().toLowerCase()
  const visible = groups
    .map((g) => ({ ...g, rows: q ? g.rows.filter((r) => `${r.code} ${r.detail}`.toLowerCase().includes(q)) : g.rows }))
    .filter((g) => g.rows.length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-outline-variant p-3">
        <label className="flex items-center gap-2 rounded-md border border-outline-variant bg-surface px-2 py-1.5 text-xs focus-within:border-secondary">
          <Search className="size-4 text-on-surface-variant" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find 31A, 25, L2T1, bridge ..."
            className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
            aria-label="Find an asset"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {visible.length === 0 && <p className="text-xs text-on-surface-variant">Nothing matches.</p>}
        {visible.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-on-surface-variant uppercase">
              {g.title} <span className="tabular-nums">({g.rows.length})</span>
            </h3>
            <ul>
              {g.rows.map((r) => (
                <li key={`${r.ref.type}:${r.ref.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.ref)}
                    className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left text-xs hover:bg-surface-container-high ${
                      sameEntity(r.ref, selected) ? 'bg-surface-container-high text-primary' : 'text-on-surface'
                    }`}
                  >
                    <span className="font-medium">{r.code}</span>
                    <span className="truncate text-right text-[11px] text-on-surface-variant">{r.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
