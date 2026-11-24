import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SIGNAL_KIND_NAME, bridgeTitle, sameEntity, type EntityRef, type Station } from '@/sip/model'
import { overline } from './ui'

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
        title: 'Bridges & level crossings',
        rows: assets.bridges.map((b) => ({ ref: { type: 'bridge', id: b.id }, code: bridgeTitle(b), detail: `CH:${b.chainage.toFixed(2)}M · ${b.spec}` })),
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

  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  const shown = visible.reduce((n, g) => n + g.rows.length, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1.5 border-b border-outline-variant p-3">
        <label className="flex h-8 items-center gap-2 rounded-md border border-outline-variant bg-surface-container-low px-2.5 text-xs transition-colors focus-within:border-accent hover:border-outline">
          <Search className="size-3.5 shrink-0 text-on-surface-variant" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Find 31A, 25, L2T1, bridge …"
            className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant/70"
            aria-label="Find an asset"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" title="Clear" className="rounded p-0.5 text-on-surface-variant hover:text-on-surface">
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </label>
        <p className="px-0.5 text-[11px] text-on-surface-variant tabular-nums">{q ? `${shown} of ${total} assets` : `${total} assets`} · click one to show it on the drawing</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {visible.length === 0 && <p className="p-4 text-xs text-on-surface-variant">No asset matches “{query.trim()}”.</p>}
        {visible.map((g) => (
          <section key={g.title}>
            <h3 className={`${overline} sticky top-0 z-[1] flex items-center justify-between border-b border-outline-variant/60 bg-surface-container/95 px-4 py-2 backdrop-blur-sm`}>
              {g.title}
              <span className="font-mono font-normal tracking-normal tabular-nums">{g.rows.length}</span>
            </h3>
            <ul className="px-2 pt-1">
              {g.rows.map((r) => {
                const active = sameEntity(r.ref, selected)
                return (
                  <li key={`${r.ref.type}:${r.ref.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(r.ref)}
                      aria-current={active || undefined}
                      className={`relative flex h-7 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-xs transition-colors ${
                        active ? 'bg-primary/10 text-primary before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary' : 'text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      <span className="max-w-[55%] shrink-0 truncate font-medium" title={r.code}>{r.code}</span>
                      <span className="truncate text-right text-[11px] text-on-surface-variant">{r.detail}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
