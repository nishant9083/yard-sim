import type { ReactNode } from 'react'
import {
  chainageAt,
  circuitRangeMetres,
  circuitsAt,
  circuitsOfPoint,
  circuitsOfSignal,
  contentsOfCircuit,
  describeElement,
  formatChainage,
  sideAt,
  SIGNAL_KIND_NAME,
  type EntityRef,
  type Station,
  type StationIndex,
} from '@/sip/model'

interface InspectorPanelProps {
  station: Station
  index: StationIndex
  entity: EntityRef | null
  onSelect: (ref: EntityRef) => void
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="text-right text-on-surface">{children}</dd>
    </div>
  )
}

function RefButtons({ items, onSelect }: { items: { ref: EntityRef; label: string }[]; onSelect: (ref: EntityRef) => void }) {
  if (items.length === 0) return <span className="text-on-surface-variant">none</span>
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {items.map(({ ref, label }) => (
        <button
          key={`${ref.type}:${ref.id}`}
          type="button"
          onClick={() => onSelect(ref)}
          className="rounded bg-surface-container-high px-1.5 py-0.5 text-[11px] text-secondary hover:text-primary"
        >
          {label}
        </button>
      ))}
    </span>
  )
}

const MARK_MEANING: Record<string, string> = {
  PT: 'Chainage printed against a point (PT). Abbreviation is not expanded on the SIP.',
  FM: 'Fouling mark chainage (FM).',
  DS: 'Start of a line or siding (DS), as printed.',
  DE: 'End of a line or siding (DE), as printed.',
  'PF END': 'Platform end chainage.',
}

export function InspectorPanel({ station, index, entity, onSelect }: InspectorPanelProps) {
  const scale = station.meta.chainage
  const ch = (x: number) => (scale ? `${chainageAt(scale, x).toFixed(2)} M ${sideAt(scale, x)}` : '')
  const { assets } = station

  if (!entity) {
    return (
      <Panel title="Nothing selected">
        <p className="text-on-surface-variant">Hover or click a signal, point, track circuit, line or label. Double-click empty space to re-fit.</p>
      </Panel>
    )
  }

  switch (entity.type) {
    case 'track': {
      const track = index.trackById.get(entity.id)
      if (!track) return null
      const links = new Set(track.nodeIds.flatMap((id) => index.connectionsByNode.get(id) ?? []))
      const line = station.info.lines.find((l) => l.track === track.id)
      return (
        <Panel title={track.name} subtitle={`Track ${track.id}`}>
          <dl className="space-y-1">
            <Row label="Kind">{track.kind}</Row>
            <Row label="Direction">{track.direction}</Row>
            {track.lineNo && <Row label="Line no.">{track.lineNo}</Row>}
            {line && <Row label="Clear standing length">{line.csl}</Row>}
            <Row label="Connections">{[...links].map((c) => c.id).join(', ') || 'none'}</Row>
          </dl>
          {track.remarks && <p className="mt-2 text-on-surface-variant">{track.remarks}</p>}
        </Panel>
      )
    }
    case 'connection': {
      const c = index.connectionById.get(entity.id)
      if (!c) return null
      const pts = assets.points.filter((p) => p.connectionId === c.id)
      return (
        <Panel title={c.label ?? c.id} subtitle={`Connection ${c.id}`}>
          <dl className="space-y-1">
            <Row label="Kind">{c.kind}</Row>
            <Row label="From → to">
              {c.from} → {c.to}
            </Row>
            <Row label="Points">
              <RefButtons items={pts.map((p) => ({ ref: { type: 'point', id: p.id }, label: p.code }))} onSelect={onSelect} />
            </Row>
          </dl>
        </Panel>
      )
    }
    case 'node': {
      const node = index.nodeById.get(entity.id)
      if (!node) return null
      return (
        <Panel title={node.label ?? node.id} subtitle={`Node ${node.id}`}>
          <dl className="space-y-1">
            <Row label="Kind">{node.kind}</Row>
            <Row label="Chainage">{ch(node.x)}</Row>
            <Row label="Tracks">{(index.tracksByNode.get(node.id) ?? []).map((t) => t.id).join(', ') || 'none'}</Row>
            <Row label="Points">
              <RefButtons
                items={assets.points.filter((p) => p.nodeId === node.id).map((p) => ({ ref: { type: 'point', id: p.id }, label: p.code }))}
                onSelect={onSelect}
              />
            </Row>
          </dl>
        </Panel>
      )
    }
    case 'signal': {
      const s = assets.signals.find((s) => s.id === entity.id)
      if (!s) return null
      return (
        <Panel title={`Signal ${s.code}`} subtitle={s.name}>
          <dl className="space-y-1">
            <Row label="Type">{SIGNAL_KIND_NAME[s.kind]}</Row>
            <Row label="Direction">{s.direction}</Row>
            <Row label="On line">{index.trackById.get(s.trackId)?.name ?? s.trackId}</Row>
            {s.fullCode && <Row label="Note code">{s.fullCode}</Row>}
            {s.control !== undefined && <Row label="Control no.">{s.control}</Row>}
            <Row label="Chainage">{ch(s.footX)}</Row>
            <Row label="Head (from post)">{s.elements.map(describeElement).join(', ')}</Row>
            {s.board && <Row label="Board">{s.board === 'SL' ? 'SL: entering single line' : 'DL: entering double line'}</Row>}
            <Row label="Circuit">
              <RefButtons items={circuitsOfSignal(station, s).map((t) => ({ ref: { type: 'trackCircuit', id: t.id }, label: t.code }))} onSelect={onSelect} />
            </Row>
          </dl>
        </Panel>
      )
    }
    case 'point': {
      const p = assets.points.find((p) => p.id === entity.id)
      if (!p) return null
      const node = index.nodeById.get(p.nodeId)
      return (
        <Panel title={`Point ${p.code}`} subtitle={p.connectionId ? `Connection ${p.connectionId}` : 'Siding point'}>
          <dl className="space-y-1">
            <Row label="Ratio">
              {p.ratio} {p.switch}
              {p.ratioInferred && <span className="text-on-surface-variant"> (default, note 4)</span>}
            </Row>
            <Row label="Control no.">{p.control}</Row>
            {p.crankHandle && <Row label="Crank handle">{p.crankHandle}</Row>}
            {node && <Row label="Chainage">{ch(node.x)}</Row>}
            <Row label="Circuit">
              <RefButtons items={circuitsOfPoint(station, p).map((t) => ({ ref: { type: 'trackCircuit', id: t.id }, label: t.code }))} onSelect={onSelect} />
            </Row>
          </dl>
        </Panel>
      )
    }
    case 'trackCircuit': {
      const tc = assets.trackCircuits.find((t) => t.id === entity.id)
      if (!tc) return null
      const range = circuitRangeMetres(station, tc)
      const inside = contentsOfCircuit(station, tc)
      return (
        <Panel title={tc.text ?? `Track circuit ${tc.code}`} subtitle={tc.kind === 'axleCounter' ? 'Axle counter section' : 'Track circuit'}>
          <dl className="space-y-1">
            <Row label="Lines">
              {tc.spans.map((s) => ('trackId' in s ? s.trackId : s.connectionId)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
            </Row>
            {range && (
              <Row label="Approx. length">
                {range.length.toFixed(0)} M (CH {range.from.toFixed(0)}–{range.to.toFixed(0)})
              </Row>
            )}
            <Row label="Points">
              <RefButtons items={inside.points.map((p) => ({ ref: { type: 'point', id: p.id }, label: p.code }))} onSelect={onSelect} />
            </Row>
            <Row label="Signals">
              <RefButtons items={inside.signals.map((s) => ({ ref: { type: 'signal', id: s.id }, label: s.code }))} onSelect={onSelect} />
            </Row>
          </dl>
          {tc.approx && <p className="mt-2 text-on-surface-variant">Limits are read from the insulated joints on the drawing; the SIP prints only the code.</p>}
        </Panel>
      )
    }
    case 'joint': {
      const j = assets.joints.find((j) => j.id === entity.id)
      if (!j) return null
      return (
        <Panel title="Insulated joint" subtitle={`On ${index.trackById.get(j.trackId)?.name ?? j.trackId}`}>
          <dl className="space-y-1">
            <Row label="Chainage">{ch(j.x)}</Row>
            <Row label="Circuits either side">
              <RefButtons
                items={[...circuitsAt(station, j.trackId, j.x - 2), ...circuitsAt(station, j.trackId, j.x + 2)]
                  .filter((t, i, a) => a.findIndex((u) => u.id === t.id) === i)
                  .map((t) => ({ ref: { type: 'trackCircuit', id: t.id }, label: t.code }))}
                onSelect={onSelect}
              />
            </Row>
          </dl>
        </Panel>
      )
    }
    case 'platform': {
      const p = assets.platforms.find((p) => p.id === entity.id)
      if (!p) return null
      return (
        <Panel title={p.name} subtitle={p.text}>
          <dl className="space-y-1">
            <Row label="Type">{p.kind === 'high' ? 'High level' : 'Rail level'}</Row>
            <Row label="Size">
              {p.lengthM} M long × {p.widthM} M wide
            </Row>
            {p.startChainage !== undefined && <Row label="Ends at">CH:{p.startChainage.toFixed(2)}M / CH:{p.endChainage?.toFixed(2)}M</Row>}
          </dl>
        </Panel>
      )
    }
    case 'structure': {
      const s = assets.structures.find((s) => s.id === entity.id)
      if (!s) return null
      return (
        <Panel title={s.name} subtitle={`Structure · ${s.kind}`}>
          <dl className="space-y-1">{s.chainage !== undefined && <Row label="Chainage">CH:{s.chainage}M F/CSB</Row>}</dl>
          {s.kind === 'detector' && <p className="mt-2 text-on-surface-variant">Box with a circle. The SIP legend does not define it.</p>}
        </Panel>
      )
    }
    case 'bridge': {
      const b = assets.bridges.find((b) => b.id === entity.id)
      if (!b) return null
      return (
        <Panel title={`BR No. ${b.number}${b.isNew ? ' (NEW)' : ''}`} subtitle={`CH:${b.chainage.toFixed(2)}M F/CSB`}>
          <p className="text-on-surface">{b.spec}</p>
        </Panel>
      )
    }
    case 'dimension': {
      const d = assets.dimensions.find((d) => d.id === entity.id)
      if (!d) return null
      return (
        <Panel title={d.text} subtitle={d.kind === 'vertical' ? 'Vertical dimension (not to scale at 1:500)' : 'Horizontal distance (1:1000)'}>
          <p className="text-on-surface-variant">Printed length from the SIP.</p>
        </Panel>
      )
    }
    case 'chainageMark': {
      const m = assets.chainageMarks.find((m) => m.id === entity.id)
      if (!m) return null
      return (
        <Panel title={`${m.kind}  CH:${m.chainage.toFixed(2)}M`} subtitle="Chainage mark">
          <p className="text-on-surface-variant">{MARK_MEANING[m.kind]}</p>
          {scale && <p className="mt-1 text-on-surface-variant">{formatChainage(scale, m.x)}</p>}
        </Panel>
      )
    }
    case 'gradient': {
      const g = assets.gradients.find((g) => g.id === entity.id)
      if (!g) return null
      return (
        <Panel title="Gradient change" subtitle={g.direction === 'BOTH' ? 'UP and DN line' : `${g.direction} line`}>
          <dl className="space-y-1">
            {g.from && <Row label="From">1 in {g.from}</Row>}
            {g.to && <Row label="To">1 in {g.to}</Row>}
            <Row label="Position">{g.text}</Row>
          </dl>
        </Panel>
      )
    }
  }
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <aside className="absolute bottom-3 left-3 z-10 w-80 rounded-lg border border-outline-variant bg-surface-container/90 p-3 text-xs backdrop-blur">
      <h2 className="text-sm font-medium text-on-surface">{title}</h2>
      {subtitle && <p className="mb-2 text-on-surface-variant">{subtitle}</p>}
      {children}
    </aside>
  )
}
