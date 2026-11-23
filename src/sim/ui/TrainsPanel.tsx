import { showsAspect } from '@/sip/model'
import { useState } from 'react'
import type { Simulation } from '../engine/simulation'
import { btn, btnPrimary, Chip, field, Section, useSimVersion } from './ui'

export function TrainsPanel({ sim }: { sim: Simulation }) {
  useSimVersion(sim)
  // Stop signals only: a train cannot wait at a distant.
  const signals = sim.station.assets.signals.filter((x) => x.kind !== 'distant' && showsAspect(x))
  const tcs = sim.station.assets.trackCircuits.filter((t) => t.kind === 'trackCircuit')
  const [where, setWhere] = useState<'signal' | 'tc'>('signal')
  const [signal, setSignal] = useState(signals[0]?.id ?? '')
  const [tc, setTc] = useState(tcs[0]?.code ?? '')
  const [east, setEast] = useState(true)
  const [len, setLen] = useState(120)
  const [kmph, setKmph] = useState(30)
  const [ignore, setIgnore] = useState(false)
  const [err, setErr] = useState('')
  const [n, setN] = useState(1)

  const add = () => {
    const id = `T${n}`
    const res = sim.dispatch({ type: 'addTrain', train: { id, name: id, lengthM: len, maxKmph: kmph, ignoreSignals: ignore, ...(where === 'signal' ? { atSignal: signal } : { atTc: tc, east }) } })
    setErr(res.ok ? '' : res.reasons.join('; '))
    if (res.ok) setN(n + 1)
  }

  return (
    <div>
      <Section title="Add a train">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="col-span-2 flex items-center gap-2 text-on-surface-variant">
            Place
            <select className={field} value={where} onChange={(e) => setWhere(e.target.value as 'signal' | 'tc')}>
              <option value="signal">Waiting at a signal</option>
              <option value="tc">On a track circuit</option>
            </select>
            {where === 'signal' ? (
              <select className={`${field} min-w-0 flex-1`} value={signal} onChange={(e) => setSignal(e.target.value)}>
                {signals.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            ) : (
              <>
                <select className={`${field} min-w-0 flex-1`} value={tc} onChange={(e) => setTc(e.target.value)}>
                  {tcs.map((t) => <option key={t.id} value={t.code}>{t.code}</option>)}
                </select>
                <select className={field} value={east ? 'e' : 'w'} onChange={(e) => setEast(e.target.value === 'e')}>
                  <option value="e">East</option>
                  <option value="w">West</option>
                </select>
              </>
            )}
          </label>
          <label className="flex items-center gap-2 text-on-surface-variant">Length m<input type="number" className={`${field} w-16`} value={len} min={10} max={900} onChange={(e) => setLen(+e.target.value)} /></label>
          <label className="flex items-center gap-2 text-on-surface-variant">Max km/h<input type="number" className={`${field} w-16`} value={kmph} min={5} max={110} onChange={(e) => setKmph(+e.target.value)} /></label>
          <label className="col-span-2 flex items-center gap-2 text-on-surface-variant"><input type="checkbox" checked={ignore} onChange={(e) => setIgnore(e.target.checked)} /> Driver ignores signals (to test a passing at danger)</label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className={btnPrimary} onClick={add}>Add train</button>
          {err && <span className="text-xs text-error">{err}</span>}
        </div>
      </Section>
      <Section title="Trains" aside={<span className="text-[11px] text-on-surface-variant">{sim.trains.length}</span>}>
        {sim.trains.length === 0 && <p className="text-xs text-on-surface-variant">No trains on the layout.</p>}
        <ul className="space-y-2">
          {sim.trains.map((t) => (
            <li key={t.id} className="rounded-md border border-outline-variant bg-surface-container p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface">{t.name} <span className="text-on-surface-variant">{t.lengthM} m</span></span>
                <Chip tone={t.speed > 0.05 ? 'ok' : 'idle'}>{(t.speed * 3.6).toFixed(0)} km/h</Chip>
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">{t.note}</p>
              <div className="mt-1.5 flex gap-1.5">
                <button className={btn} onClick={() => sim.dispatch({ type: 'trainRun', id: t.id, run: !t.run })}>{t.run ? 'Hold' : 'Go'}</button>
                <button className={btn} onClick={() => sim.dispatch({ type: 'removeTrain', id: t.id })}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
