import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  chainageAt,
  type EntityRef,
  type Platform,
  type Signal,
  type SignalElement,
  type Station,
  type Structure,
} from '@/sip/model'
import { circuitCode, chainageOfX, numberOf, platformMetrics, TRACK_KINDS, STRUCTURE_NAMES, trackXRange } from '@/sip/edit'
import { buttonClass, CheckField, NumberField, ReadOnly, Section, SelectField, TextField } from './fields'

interface PropertiesPanelProps {
  station: Station
  selected: EntityRef | null
  /** Live edit while typing; `onCommit` closes it as one undo step. */
  onEdit: (ref: EntityRef, patch: Record<string, unknown>) => void
  onCommit: () => void
  onDelete: () => void
  onSelect: (ref: EntityRef) => void
}

const SIGNAL_KINDS = [
  { id: 'signal', label: 'Signal' },
  { id: 'home', label: 'Home' },
  { id: 'starter', label: 'Starter' },
  { id: 'advancedStarter', label: 'Advanced starter' },
  { id: 'distant', label: 'Distant' },
  { id: 'shunt', label: 'Shunt' },
] as const

const ELEMENT_KINDS: { id: SignalElement['kind']; label: string }[] = [
  { id: 'lamp', label: 'Lamp' },
  { id: 'marker', label: 'Marker (P / C / B)' },
  { id: 'callingOn', label: 'Calling-on lamp' },
  { id: 'routeIndicator', label: 'Route indicator' },
  { id: 'shunt', label: 'Shunt disc' },
]

const LAMP_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'slash', label: 'Slash' },
  { id: 'vbar', label: 'Vertical bar' },
  { id: 'hbar', label: 'Horizontal bar' },
] as const

function defaultElement(kind: SignalElement['kind']): SignalElement {
  switch (kind) {
    case 'lamp':
      return { kind: 'lamp', style: 'solid' }
    case 'marker':
      return { kind: 'marker', text: 'P' }
    case 'shunt':
      return { kind: 'shunt' }
    case "routeIndicator":
      return { kind: 'routeIndicator', direction: 'both' }
    default:
      return { kind }
  }
}

function ElementsEditor({ signal, set, commit }: { signal: Signal; set: (patch: Record<string, unknown>) => void; commit: () => void }) {
  const write = (elements: SignalElement[]) => {
    set({ elements })
    commit()
  }
  const move = (i: number, by: number) => {
    const next = [...signal.elements]
    const [item] = next.splice(i, 1)
    next.splice(i + by, 0, item!)
    write(next)
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-on-surface-variant">Parts of the head, listed outward from the post.</p>
      {signal.elements.map((el, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            value={el.kind}
            onChange={(e) => write(signal.elements.map((x, j) => (j === i ? defaultElement(e.target.value as SignalElement['kind']) : x)))}
            className="min-w-0 flex-1 rounded-md border border-outline-variant bg-surface px-1.5 py-1 text-xs text-on-surface"
          >
            {ELEMENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          {el.kind === 'lamp' && (
            <select
              value={el.style}
              onChange={(e) => write(signal.elements.map((x, j) => (j === i ? { kind: 'lamp', style: e.target.value as typeof el.style } : x)))}
              className="w-24 rounded-md border border-outline-variant bg-surface px-1.5 py-1 text-xs text-on-surface"
            >
              {LAMP_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {el.kind === 'marker' && (
            <select
              value={el.text}
              onChange={(e) => write(signal.elements.map((x, j) => (j === i ? { kind: 'marker', text: e.target.value as typeof el.text } : x)))}
              className="w-24 rounded-md border border-outline-variant bg-surface px-1.5 py-1 text-xs text-on-surface"
            >
              {['P', 'C', 'B'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
          {el.kind === 'shunt' && (
            <input
              value={el.text ?? ''}
              placeholder="SH15"
              onChange={(e) => set({ elements: signal.elements.map((x, j) => (j === i ? { kind: 'shunt', text: e.target.value || undefined } : x)) })}
              onBlur={commit}
              className="w-24 rounded-md border border-outline-variant bg-surface px-1.5 py-1 text-xs text-on-surface"
            />
          )}
          <button type="button" aria-label="Move towards the post" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-30">
            <ArrowUp className="size-3.5" />
          </button>
          <button type="button" aria-label="Move outward" disabled={i === signal.elements.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-30">
            <ArrowDown className="size-3.5" />
          </button>
          <button type="button" aria-label="Remove part" onClick={() => write(signal.elements.filter((_, j) => j !== i))} className="rounded p-1 text-on-surface-variant hover:text-error">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button type="button" className={buttonClass} onClick={() => write([...signal.elements, defaultElement('lamp')])}>
        <Plus className="size-3.5" aria-hidden />
        Add part
      </button>
    </div>
  )
}

export function PropertiesPanel({ station, selected, onEdit, onCommit, onDelete, onSelect }: PropertiesPanelProps) {
  if (!selected) {
    return (
      <div className="space-y-2 p-4 text-xs text-on-surface-variant">
        <p className="text-sm text-on-surface">Nothing selected</p>
        <p>Pick a tool on the left and draw, or use the Select tool to click anything on the drawing.</p>
        <p>Generated values (codes, chainages, sizes) are filled in for you and marked <span className="text-secondary">auto</span>. Anything you change can be reset.</p>
      </div>
    )
  }

  const set = (patch: Record<string, unknown>) => onEdit(selected, patch)
  const setNow = (patch: Record<string, unknown>) => {
    set(patch)
    onCommit()
  }
  const { assets } = station
  const scale = station.meta.chainage
  const ch = (x: number) => (scale ? `${chainageAt(scale, x).toFixed(2)} M ${scale.label}` : '–')

  const body = (() => {
    switch (selected.type) {
      case 'track': {
        const t = station.tracks.find((t) => t.id === selected.id)
        if (!t) return null
        const [lo, hi] = trackXRange(station, t)
        return (
          <>
            <Section title="Line">
              <TextField label="Name" value={t.name} onChange={(v) => set({ name: v })} onCommit={onCommit} required />
              <SelectField label="Type" value={t.kind} options={TRACK_KINDS} onChange={(v) => setNow({ kind: v })} />
              <SelectField
                label="Direction of running"
                value={t.direction}
                options={[
                  { id: 'BOTH', label: 'Both ways' },
                  { id: 'UP', label: 'UP only' },
                  { id: 'DN', label: 'DN only' },
                ]}
                onChange={(v) => setNow({ direction: v })}
                hint="New signals take their direction from this."
              />
              <NumberField label="Line number" value={t.lineNo} onChange={(v) => set({ lineNo: v })} onCommit={onCommit} />
              <TextField label="Remarks" value={t.remarks ?? ''} onChange={(v) => set({ remarks: v || undefined })} onCommit={onCommit} multiline />
            </Section>
            <Section title="Computed">
              <ReadOnly label="Vertices">{t.nodeIds.length}</ReadOnly>
              {scale && <ReadOnly label="Length">{Math.round((hi - lo) * scale.metresPerUnit)} M</ReadOnly>}
              <ReadOnly label="Signals">{assets.signals.filter((s) => s.trackId === t.id).length}</ReadOnly>
              <ReadOnly label="Joints">{assets.joints.filter((j) => j.trackId === t.id).length}</ReadOnly>
            </Section>
          </>
        )
      }
      case 'connection': {
        const c = station.connections.find((c) => c.id === selected.id)
        if (!c) return null
        const pts = assets.points.filter((p) => p.connectionId === c.id)
        return (
          <>
            <Section title="Connection">
              <SelectField
                label="Type"
                value={c.kind}
                options={[
                  { id: 'crossover', label: 'Crossover' },
                  { id: 'turnout', label: 'Turnout' },
                ]}
                onChange={(v) => setNow({ kind: v })}
              />
              <TextField label="Label" value={c.label ?? ''} onChange={(v) => set({ label: v || undefined })} onCommit={onCommit} />
              <ReadOnly label="From → to">
                {c.from} → {c.to}
              </ReadOnly>
            </Section>
            <Section title="Points">
              {pts.length === 0 && <p className="text-xs text-on-surface-variant">No point machines. Use the Point tool on either end.</p>}
              <div className="flex flex-wrap gap-1">
                {pts.map((p) => (
                  <button key={p.id} type="button" onClick={() => onSelect({ type: 'point', id: p.id })} className="rounded bg-surface-container-high px-2 py-0.5 text-xs text-secondary hover:text-primary">
                    {p.code}
                  </button>
                ))}
              </div>
            </Section>
          </>
        )
      }
      case 'node': {
        const n = station.nodes.find((n) => n.id === selected.id)
        if (!n) return null
        return (
          <Section title="Vertex">
            <SelectField
              label="Kind"
              value={n.kind}
              options={[
                { id: 'plain', label: 'Bend' },
                { id: 'junction', label: 'Junction' },
                { id: 'boundary', label: 'Yard boundary' },
                { id: 'bufferStop', label: 'Buffer stop' },
              ]}
              onChange={(v) => setNow({ kind: v })}
            />
            <TextField label="Label" value={n.label ?? ''} onChange={(v) => set({ label: v || undefined })} onCommit={onCommit} />
            <NumberField label="X" value={n.x} onChange={(v) => set({ x: v })} onCommit={onCommit} />
            <NumberField label="Y" value={n.y} onChange={(v) => set({ y: v })} onCommit={onCommit} />
            <ReadOnly label="Chainage">{ch(n.x)}</ReadOnly>
          </Section>
        )
      }
      case 'signal': {
        const s = assets.signals.find((s) => s.id === selected.id)
        if (!s) return null
        const num = numberOf(s.code)
        return (
          <>
            <Section title="Signal">
              <TextField label="Code" value={s.code} onChange={(v) => set({ code: v })} onCommit={onCommit} required hint="Exactly as printed beside the signal." />
              <TextField
                label="Name"
                value={s.name}
                onChange={(v) => set({ name: v })}
                onCommit={onCommit}
                auto={{ value: `Signal ${s.code}`, current: s.name, onReset: () => setNow({ name: `Signal ${s.code}` }) }}
              />
              <TextField label="Code used in the notes" value={s.fullCode ?? ''} placeholder="e.g. S/SH15" onChange={(v) => set({ fullCode: v || undefined })} onCommit={onCommit} />
              <SelectField label="Type" value={s.kind} options={[...SIGNAL_KINDS]} onChange={(v) => setNow({ kind: v })} />
              <NumberField
                label="Control number"
                value={s.control}
                onChange={(v) => set({ control: v })}
                onCommit={onCommit}
                auto={num === null ? undefined : { value: num, current: s.control, onReset: () => setNow({ control: num }) }}
              />
            </Section>
            <Section title="Placement">
              <SelectField label="Direction" value={s.direction} options={[{ id: 'UP', label: 'UP' }, { id: 'DN', label: 'DN' }]} onChange={(v) => setNow({ direction: v, headDir: v === 'UP' ? 'east' : 'west' })} />
              <SelectField label="Side of line" value={s.side} options={[{ id: 'above', label: 'Above' }, { id: 'below', label: 'Below' }]} onChange={(v) => setNow({ side: v })} />
              <SelectField label="Head faces" value={s.headDir} options={[{ id: 'east', label: 'East' }, { id: 'west', label: 'West' }]} onChange={(v) => setNow({ headDir: v, anchorX: s.footX + (v === 'east' ? 2 : -2) })} />
              <SelectField
                label="Board"
                value={s.board ?? ''}
                options={[
                  { id: '', label: 'None' },
                  { id: 'SL', label: 'SL: entering single line' },
                  { id: 'DL', label: 'DL: entering double line' },
                ]}
                onChange={(v) => setNow({ board: v || undefined })}
              />
              <ReadOnly label="On line">{station.tracks.find((t) => t.id === s.trackId)?.name ?? s.trackId}</ReadOnly>
              <ReadOnly label="Chainage">{ch(s.footX)}</ReadOnly>
            </Section>
            <Section title="Head">
              <ElementsEditor signal={s} set={set} commit={onCommit} />
            </Section>
          </>
        )
      }
      case 'point': {
        const p = assets.points.find((p) => p.id === selected.id)
        if (!p) return null
        const num = numberOf(p.code)
        const node = station.nodes.find((n) => n.id === p.nodeId)
        return (
          <Section title="Point machine">
            <TextField label="Code" value={p.code} onChange={(v) => set({ code: v })} onCommit={onCommit} required hint="e.g. 31A, 31B" />
            <TextField label="Ratio" value={p.ratio} placeholder="1 IN 8.5" onChange={(v) => set({ ratio: v })} onCommit={onCommit} hint="Leave empty to use the default ratio from the SIP notes." />
            <SelectField
              label="Switch"
              value={p.switch}
              options={[
                { id: '', label: 'Not set' },
                { id: 'CS', label: 'CS: curved switch' },
                { id: 'SS', label: 'SS: straight switch' },
                { id: 'TWS', label: 'TWS: thick web switch' },
                { id: 'SS(CS)', label: 'SS(CS)' },
              ]}
              onChange={(v) => setNow({ switch: v })}
            />
            <CheckField label="Ratio comes from the default note" checked={p.ratioInferred} onChange={(v) => setNow({ ratioInferred: v })} />
            <NumberField
              label="Control number"
              value={p.control}
              onChange={(v) => set({ control: v })}
              onCommit={onCommit}
              auto={num === null ? undefined : { value: num, current: p.control, onReset: () => setNow({ control: num }) }}
            />
            <TextField label="Crank handle" value={p.crankHandle ?? ''} placeholder="CH1" onChange={(v) => set({ crankHandle: v || undefined })} onCommit={onCommit} />
            {node && <ReadOnly label="Chainage">{ch(node.x)}</ReadOnly>}
            {p.connectionId && <ReadOnly label="Connection">{p.connectionId}</ReadOnly>}
          </Section>
        )
      }
      case 'joint': {
        const j = assets.joints.find((j) => j.id === selected.id)
        if (!j) return null
        return (
          <Section title="Insulated joint">
            <NumberField label="Position (x)" value={j.x} onChange={(v) => set({ x: v })} onCommit={onCommit} />
            <ReadOnly label="Chainage">{ch(j.x)}</ReadOnly>
            <ReadOnly label="On line">{station.tracks.find((t) => t.id === j.trackId)?.name ?? j.trackId}</ReadOnly>
          </Section>
        )
      }
      case 'trackCircuit': {
        const tc = assets.trackCircuits.find((t) => t.id === selected.id)
        if (!tc) return null
        const first = tc.spans.find((s) => 'trackId' in s)
        const autoCode =
          first && 'trackId' in first
            ? circuitCode(station, first.trackId, first.x0, first.x1, assets.trackCircuits.filter((t) => t.id !== tc.id).map((t) => t.code))
            : undefined
        return (
          <>
            <Section title="Track circuit">
              <TextField
                label="Code"
                value={tc.code}
                onChange={(v) => set({ code: v })}
                onCommit={onCommit}
                required
                auto={autoCode ? { value: autoCode, current: tc.code, onReset: () => setNow({ code: autoCode }) } : undefined}
                hint="Generated from the points inside the section."
              />
              <SelectField
                label="Type"
                value={tc.kind}
                options={[
                  { id: 'trackCircuit', label: 'Track circuit' },
                  { id: 'axleCounter', label: 'Axle counter section' },
                ]}
                onChange={(v) => setNow({ kind: v })}
              />
              <TextField label="Printed text" value={tc.text ?? ''} placeholder="URXT (SEC: MVF-JRT)" onChange={(v) => set({ text: v || undefined })} onCommit={onCommit} />
            </Section>
            <Section title="Limits">
              {tc.spans.map((sp, i) =>
                'trackId' in sp ? (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <NumberField label={`${station.tracks.find((t) => t.id === sp.trackId)?.name ?? sp.trackId}: from x`} value={sp.x0} onChange={(v) => set({ spans: tc.spans.map((x, j) => (j === i ? { ...sp, x0: v, } : x)), approx: false })} onCommit={onCommit} />
                    <NumberField label="to x" value={sp.x1} onChange={(v) => set({ spans: tc.spans.map((x, j) => (j === i ? { ...sp, x1: v } : x)), approx: false })} onCommit={onCommit} />
                  </div>
                ) : (
                  <ReadOnly key={i} label="Connection">{sp.connectionId}</ReadOnly>
                ),
              )}
              <CheckField label="Limits are approximate" checked={tc.approx} onChange={(v) => setNow({ approx: v })} hint="Tick when the limits were taken from joints, not printed on the SIP." />
            </Section>
          </>
        )
      }
      case 'platform': {
        const p = assets.platforms.find((p) => p.id === selected.id)
        if (!p) return null
        return <PlatformForm station={station} platform={p} set={set} setNow={setNow} commit={onCommit} />
      }
      case 'structure': {
        const st = assets.structures.find((s) => s.id === selected.id)
        if (!st) return null
        return <StructureForm station={station} structure={st} set={set} setNow={setNow} commit={onCommit} />
      }
      case 'bridge': {
        const b = assets.bridges.find((b) => b.id === selected.id)
        if (!b) return null
        const auto = chainageOfX(station, b.x)
        return (
          <Section title="Bridge">
            <TextField label="Bridge number" value={b.number} onChange={(v) => set({ number: v })} onCommit={onCommit} required autoFocus />
            <TextField label="Span / description" value={b.spec} placeholder="1X1.22M HP" onChange={(v) => set({ spec: v })} onCommit={onCommit} multiline />
            <NumberField
              label="Chainage"
              unit="M"
              value={b.chainage}
              onChange={(v) => set({ chainage: v })}
              onCommit={onCommit}
              auto={auto === undefined ? undefined : { value: auto, current: b.chainage, onReset: () => setNow({ chainage: auto }) }}
              hint="Chainage of the bridge itself, as printed."
            />
            <CheckField label="New bridge" checked={!!b.isNew} onChange={(v) => setNow({ isNew: v || undefined })} />
          </Section>
        )
      }
      case 'annotation': {
        const a = assets.annotations.find((a) => a.id === selected.id)
        if (!a) return null
        return (
          <Section title="Text">
            <TextField label="Text" value={a.text} onChange={(v) => set({ text: v })} onCommit={onCommit} autoFocus />
            <SelectField
              label="Style"
              value={a.tone ?? 'csb'}
              options={[
                { id: 'line', label: 'Line name' },
                { id: 'end', label: 'End of yard (bold)' },
                { id: 'csb', label: 'Note' },
              ]}
              onChange={(v) => setNow({ tone: v })}
            />
          </Section>
        )
      }
      default:
        return <p className="text-xs text-on-surface-variant">This item cannot be edited yet.</p>
    }
  })()

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">
          {selected.type} · <span className="text-on-surface">{selected.id}</span>
        </p>
        <button type="button" onClick={onDelete} className={`${buttonClass} text-error hover:border-error`}>
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </button>
      </div>
      {body}
    </div>
  )
}

function PlatformForm({
  station,
  platform: p,
  set,
  setNow,
  commit,
}: {
  station: Station
  platform: Platform
  set: (patch: Record<string, unknown>) => void
  setNow: (patch: Record<string, unknown>) => void
  commit: () => void
}) {
  const m = platformMetrics(station, p.polygon)
  const no = /\d+/.exec(p.name)?.[0]
  const autoText = no ? `${p.kind === 'high' ? 'HIGH LEVEL' : 'RAIL LEVEL'} PASSENGER PLATFORM No.-${no}` : undefined
  const auto = (key: 'lengthM' | 'widthM' | 'startChainage' | 'endChainage') =>
    m ? { value: m[key], current: p[key], onReset: () => setNow({ [key]: m[key] }) } : undefined
  return (
    <>
      <Section title="Platform">
        <TextField label="Name" value={p.name} onChange={(v) => set({ name: v })} onCommit={commit} required />
        <SelectField label="Level" value={p.kind} options={[{ id: 'high', label: 'High level' }, { id: 'rail', label: 'Rail level' }]} onChange={(v) => setNow({ kind: v })} />
        <TextField
          label="Printed text"
          value={p.text}
          onChange={(v) => set({ text: v })}
          onCommit={commit}
          auto={autoText ? { value: autoText, current: p.text, onReset: () => setNow({ text: autoText }) } : undefined}
        />
      </Section>
      <Section title="Size">
        <NumberField label="Length" unit="M" value={p.lengthM} onChange={(v) => set({ lengthM: v })} onCommit={commit} auto={auto('lengthM')} />
        <NumberField label="Width" unit="M" value={p.widthM} onChange={(v) => set({ widthM: v })} onCommit={commit} auto={auto('widthM')} required hint="Check against the SIP: widths are printed, not measured." />
        <NumberField label="Start chainage" unit="M" value={p.startChainage} onChange={(v) => set({ startChainage: v })} onCommit={commit} auto={auto('startChainage')} />
        <NumberField label="End chainage" unit="M" value={p.endChainage} onChange={(v) => set({ endChainage: v })} onCommit={commit} auto={auto('endChainage')} />
      </Section>
    </>
  )
}

function StructureForm({
  station,
  structure: s,
  set,
  setNow,
  commit,
}: {
  station: Station
  structure: Structure
  set: (patch: Record<string, unknown>) => void
  setNow: (patch: Record<string, unknown>) => void
  commit: () => void
}) {
  const cx = s.shape ? (s.shape.x0 + s.shape.x1) / 2 : s.at?.x
  const auto = cx === undefined ? undefined : chainageOfX(station, cx)
  return (
    <Section title="Structure">
      <SelectField
        label="Type"
        value={s.kind}
        options={Object.entries(STRUCTURE_NAMES).map(([id, label]) => ({ id: id as Structure['kind'], label }))}
        onChange={(v) => setNow({ kind: v })}
      />
      <TextField label="Name" value={s.name} onChange={(v) => set({ name: v })} onCommit={commit} required autoFocus />
      <NumberField
        label="Chainage"
        unit="M"
        value={s.chainage}
        onChange={(v) => set({ chainage: v })}
        onCommit={commit}
        auto={auto === undefined ? undefined : { value: auto, current: s.chainage, onReset: () => setNow({ chainage: auto }) }}
      />
    </Section>
  )
}
