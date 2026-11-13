import { useState } from 'react'
import type { Simulation } from '../engine/simulation'
import type { PointFault, TcFault } from '../engine/types'
import { btn, Chip, field, Section, useSimVersion } from './ui'

export function FieldPanel({ sim }: { sim: Simulation }) {
  useSimVersion(sim)
  const [tc, setTc] = useState(sim.station.assets.trackCircuits[0]?.code ?? '')
  const [err, setErr] = useState('')
  const units = [...sim.net.units.values()].sort((a, b) => Number(a.id) - Number(b.id))
  const faultedTcs = [...sim.tcs.entries()].filter(([, t]) => t.fault !== 'none')
  const handles = [...sim.controls.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  const faultedLamps = [...sim.lamps.entries()].filter(([, v]) => v)
  const run = (r: { ok: boolean; reasons: string[] }) => setErr(r.ok ? '' : r.reasons.join('; '))

  return (
    <div>
      {err && <div className="border-b border-outline-variant bg-error/10 px-3 py-2 text-xs text-error">{err}</div>}
      <Section title="Points">
        <table className="w-full text-xs">
          <tbody>
            {units.map((u) => {
              const p = sim.points.get(u.id)!
              const owner = [...p.owners.keys()].join(', ')
              return (
                <tr key={u.id} className="border-t border-outline-variant first:border-t-0">
                  <td className="py-1 pr-2 font-medium text-on-surface">{u.id}</td>
                  <td className="pr-2">{p.moving ? <Chip tone="warn">moving</Chip> : <Chip tone={p.fault !== 'none' ? 'bad' : owner ? 'info' : 'ok'}>{p.pos === 'N' ? 'normal' : 'reverse'}</Chip>}</td>
                  <td className="pr-2 text-[11px] text-on-surface-variant" title={owner}>{owner ? `locked ${owner}` : u.crankHandle ?? ''}</td>
                  <td className="text-right">
                    <span className="inline-flex gap-1">
                      <button className={btn} onClick={() => run(sim.dispatch({ type: 'movePoint', unit: u.id, pos: 'N' }))}>N</button>
                      <button className={btn} onClick={() => run(sim.dispatch({ type: 'movePoint', unit: u.id, pos: 'R' }))}>R</button>
                      <select className={field} value={p.fault} title="Fault" onChange={(e) => sim.dispatch({ type: 'pointFault', unit: u.id, fault: e.target.value as PointFault })}>
                        <option value="none">ok</option>
                        <option value="noDetection">no detection</option>
                        <option value="stuck">stuck</option>
                      </select>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>
      <Section title="Crank handles and controls">
        <div className="flex flex-wrap gap-1.5">
          {handles.map(([name, inn]) => (
            <button key={name} className={`${btn} ${inn ? '' : 'border-error text-error'}`} onClick={() => sim.dispatch({ type: 'setControl', control: name, value: !inn })} title="Click to put IN or take OUT">
              {name} {inn ? 'IN' : 'OUT'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Track circuit faults">
        <div className="flex items-center gap-2">
          <select className={`${field} min-w-0 flex-1`} value={tc} onChange={(e) => setTc(e.target.value)}>
            {sim.station.assets.trackCircuits.map((t) => <option key={t.id} value={t.code}>{t.code}</option>)}
          </select>
          <button className={btn} onClick={() => run(sim.dispatch({ type: 'tcFault', tc, fault: 'occupied' as TcFault }))}>False occupied</button>
          <button className={btn} onClick={() => run(sim.dispatch({ type: 'tcFault', tc, fault: 'clear' }))} title="Shows clear even with a train on it">Fails clear</button>
        </div>
        <ul className="mt-2 space-y-1">
          {faultedTcs.map(([code, t]) => (
            <li key={code} className="flex items-center justify-between text-xs">
              <span>{code} <Chip tone="bad">{t.fault === 'occupied' ? 'false occupied' : 'fails clear'}</Chip></span>
              <button className={btn} onClick={() => sim.dispatch({ type: 'tcFault', tc: code, fault: 'none' })}>Restore</button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Signal lamps">
        <div className="flex flex-wrap gap-1.5">
          {sim.station.assets.signals.map((s) => {
            const failed = sim.lamps.get(s.id) ?? false
            return (
              <button key={s.id} className={`${btn} ${failed ? 'border-error text-error' : ''}`} onClick={() => sim.dispatch({ type: 'lampFault', signal: s.id, failed: !failed })} title="Fail or restore the lamp">
                {s.code}
              </button>
            )
          })}
        </div>
        {faultedLamps.length > 0 && <p className="mt-1 text-[11px] text-error">Failed: {faultedLamps.map(([id]) => id).join(', ')}</p>}
      </Section>
      {(sim.config.blockSections ?? []).length > 0 && (
        <Section title="Block sections">
          <ul className="space-y-1.5">
            {(sim.config.blockSections ?? []).flatMap((sec) =>
              sec.inputs.map((i) => {
                const key = `${sec.id}/${i.id}`
                const on = sim.blockInputs.get(key) ?? false
                return (
                  <li key={key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-on-surface-variant" title={sec.label}>{i.label}</span>
                    <button className={`${btn} ${on ? 'border-[#3ddc84] text-[#3ddc84]' : ''}`} onClick={() => sim.dispatch({ type: 'blockInput', section: sec.id, input: i.id, value: !on })}>
                      {on ? 'Received' : 'Not received'}
                    </button>
                  </li>
                )
              }),
            )}
          </ul>
        </Section>
      )}
    </div>
  )
}
