import { useMemo, useState } from 'react'
import type { Simulation } from '../engine/simulation'
import { checkStation } from '../registry'
import type { SimSettings } from '../engine/types'
import { Chip, Section, useSimVersion } from './ui'

export function LogPanel({ sim }: { sim: Simulation }) {
  useSimVersion(sim)
  const rows = sim.log.slice(-200).reverse()
  const colour = { info: 'text-on-surface-variant', event: 'text-on-surface', warn: 'text-[#ffb454]', refused: 'text-error' } as const
  return (
    <ul className="px-3 py-2 text-xs">
      {rows.map((l, i) => (
        <li key={`${l.t}-${i}`} className="flex gap-2 border-b border-outline-variant py-1">
          <span className="w-12 shrink-0 text-right text-on-surface-variant tabular-nums">{l.t.toFixed(1)}</span>
          <span className={colour[l.level]}>{l.text}</span>
        </li>
      ))}
    </ul>
  )
}

const SETTINGS: { key: keyof SimSettings; label: string; unit: string; kind?: 'bool' }[] = [
  { key: 'pointSeconds', label: 'Point machine time', unit: 's' },
  { key: 'approachLockSeconds', label: 'Approach lock / emergency release', unit: 's' },
  { key: 'overlapTimerSeconds', label: 'Overlap release timer (0 = off)', unit: 's' },
  { key: 'accelMps2', label: 'Train acceleration', unit: 'm/s²' },
  { key: 'brakeMps2', label: 'Train braking', unit: 'm/s²' },
  { key: 'stopMarginM', label: 'Stopping margin before a signal', unit: 'm' },
  { key: 'autoReclear', label: 'Signal clears again by itself after a fault', unit: '', kind: 'bool' },
]

export function SettingsPanel({ sim }: { sim: Simulation }) {
  useSimVersion(sim)
  return (
    <div>
      <Section title="Simulation settings">
        <ul className="space-y-2">
          {SETTINGS.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2 text-xs text-on-surface-variant">
              <span>{s.label}</span>
              {s.kind === 'bool' ? (
                <input type="checkbox" checked={sim.settings[s.key] as boolean} onChange={(e) => sim.dispatch({ type: 'setting', key: s.key, value: e.target.checked })} />
              ) : (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    className="h-7 w-20 rounded-md border border-outline-variant bg-surface px-1.5 text-xs text-on-surface"
                    value={sim.settings[s.key] as number}
                    onChange={(e) => Number.isFinite(+e.target.value) && sim.dispatch({ type: 'setting', key: s.key, value: +e.target.value })}
                  />
                  {s.unit}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Section>
      {(sim.config.notes ?? []).length > 0 && (
        <Section title="Station notes">
          <ul className="list-disc space-y-1 pl-4 text-xs text-on-surface-variant">{sim.config.notes!.map((n) => <li key={n}>{n}</li>)}</ul>
        </Section>
      )}
    </div>
  )
}

export function ChecksPanel({ sim }: { sim: Simulation }) {
  const result = useMemo(() => checkStation(sim), [sim])
  const [level, setLevel] = useState<'error' | 'warn' | 'info'>('warn')
  const order = { error: 0, warn: 1, info: 2 } as const
  const counts = { error: 0, warn: 0, info: 0 }
  for (const i of result.issues) counts[i.level]++
  const shown = result.issues.filter((i) => order[i.level] <= order[level]).sort((a, b) => order[a.level] - order[b.level])
  return (
    <div>
      <Section title="Chart against drawing" aside={<span className="text-[11px] text-on-surface-variant">{result.walks.size} routes walked</span>}>
        <p className="mb-2 text-xs text-on-surface-variant">Every route is walked over the drawing with the points the chart asks for, and compared with the circuits, points and controls the chart lists.</p>
        <div className="flex gap-1.5">
          {(['error', 'warn', 'info'] as const).map((l) => (
            <button key={l} onClick={() => setLevel(l)} className={`rounded border px-2 py-0.5 text-xs ${level === l ? 'border-secondary text-secondary' : 'border-outline-variant text-on-surface-variant'}`}>
              {l} {counts[l]}
            </button>
          ))}
        </div>
      </Section>
      <ul className="px-3 py-2 text-xs">
        {shown.length === 0 && <li className="text-on-surface-variant">Nothing at this level.</li>}
        {shown.map((i, k) => (
          <li key={k} className="border-b border-outline-variant py-1.5">
            <Chip tone={i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'idle'}>{i.code}</Chip> <span className="text-on-surface">{i.message}</span>
            {i.where && <div className="text-[11px] text-on-surface-variant">{i.where}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
