import { useMemo, useState } from 'react'
import type { Simulation } from '../engine/simulation'
import type { Phase } from '../engine/types'
import { btn, Chip, field, Section, useSimVersion } from './ui'

const tone = (p: Phase, off: boolean) => (p === 'idle' ? 'idle' : p === 'locked' && off ? 'ok' : p === 'overlap' ? 'info' : 'warn') as 'ok' | 'warn' | 'info' | 'idle'
const label = (p: Phase, off: boolean) => (p === 'locked' ? (off ? 'signal off' : 'locked') : p === 'used' ? 'passed' : p === 'overlap' ? 'overlap held' : p)

export function OperatePanel({ sim, focusSignal, onClearFocus }: { sim: Simulation; focusSignal: string | null; onClearFocus: () => void }) {
  useSimVersion(sim)
  const [filter, setFilter] = useState('')
  const [last, setLast] = useState<{ route: string; reasons: string[] } | null>(null)
  const groups = useMemo(() => {
    const m = new Map<string, typeof sim.rcc.routes>()
    for (const r of sim.rcc.routes) m.set(r.signal, [...(m.get(r.signal) ?? []), r])
    return [...m.entries()]
  }, [sim])
  const active = sim.activeRoutes()
  const f = filter.trim().toLowerCase()
  const focusPost = focusSignal ? Object.entries(sim.config.posts).find(([, id]) => id === focusSignal)?.[0] : undefined
  const focusCode = focusSignal ? sim.station.assets.signals.find((x) => x.id === focusSignal)?.code : undefined
  const hasRoutes = focusPost !== undefined && sim.rcc.routes.some((r) => r.post === focusPost)
  const [trainNo, setTrainNo] = useState(1)
  const placeTrain = (post: string) => {
    const signal = sim.config.posts[post]
    if (!signal) return
    let n = trainNo
    while (sim.trains.some((t) => t.id === `T${n}`)) n++
    const res = sim.dispatch({ type: 'addTrain', train: { id: `T${n}`, lengthM: 120, maxKmph: 30, atSignal: signal } })
    setLast({ route: `Train at ${signal}`, reasons: res.reasons })
    setTrainNo(n + 1)
  }

  return (
    <div>
      <Section title="Active routes" aside={<span className="text-[11px] text-on-surface-variant">{active.length}</span>}>
        {active.length === 0 && <p className="text-xs text-on-surface-variant">Nothing set. Choose a route below, or click a signal on the drawing.</p>}
        <ul className="space-y-2">
          {active.map((id) => {
            const rt = sim.routes.get(id)!
            const r = sim.rcc.byId.get(id)!
            return (
              <li key={id} className="rounded-md border border-outline-variant bg-surface-container p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-on-surface">
                    {id} <span className="text-on-surface-variant">{r.signal} → {r.destination}</span>
                  </span>
                  <Chip tone={tone(rt.phase, rt.signalOff)}>{label(rt.phase, rt.signalOff)}</Chip>
                </div>
                {rt.reasons.length > 0 && <p className="mt-1 text-[11px] text-on-surface-variant">{rt.reasons.join(' · ')}</p>}
                <div className="mt-1.5 flex gap-1.5">
                  {rt.phase === 'locked' && rt.revoked && !rt.signalOff && (
                    <button className={btn} onClick={() => setLast({ route: id, reasons: sim.dispatch({ type: 'setRoute', route: id }).reasons })}>Request again</button>
                  )}
                  <button className={btn} onClick={() => setLast({ route: id, reasons: sim.dispatch({ type: 'cancelRoute', route: id }).reasons })}>Cancel</button>
                  <button className={btn} title="Frees the route after the approach-lock time without proving that the train passed" onClick={() => sim.dispatch({ type: 'emergencyRelease', route: id })}>Emergency release</button>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>
      {last && last.reasons.length > 0 && (
        <div className="border-b border-outline-variant bg-error/10 px-3 py-2 text-xs text-error">
          <strong className="font-medium">{last.route} refused:</strong> {last.reasons.join('; ')}
        </div>
      )}
      {focusSignal && (
        <div className="flex items-center justify-between border-b border-outline-variant bg-secondary/10 px-3 py-2 text-xs text-on-surface">
          <span>{hasRoutes ? `Showing routes from signal ${focusCode}` : `Signal ${focusCode} has no route of its own in the chart`}</span>
          <button className={btn} onClick={onClearFocus}>Show all</button>
        </div>
      )}
      <Section title="Set a route" aside={<input className={`${field} w-28`} placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
        <div className="space-y-3">
          {groups
            .filter(([, rs]) => !hasRoutes || rs[0]!.post === focusPost)
            .filter(([slot, rs]) => !f || slot.toLowerCase().includes(f) || rs.some((r) => r.id.toLowerCase().includes(f) || r.destination.toLowerCase().includes(f)))
            .map(([slot, rs]) => (
              <div key={slot}>
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-on-surface-variant">
                  {slot}
                  <button className="rounded px-1 text-[11px] text-secondary hover:underline" onClick={() => placeTrain(rs[0]!.post)} title="Put a 120 m train waiting at this signal">+ train here</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rs.map((r) => {
                    const rt = sim.routes.get(r.id)!
                    return (
                      <button
                        key={r.id}
                        className={btn}
                        disabled={rt.phase !== 'idle'}
                        title={`${r.signal} to ${r.destination}${r.overlapId ? ` · overlap ${r.overlapId}` : ''}`}
                        onClick={() => setLast({ route: r.id, reasons: sim.dispatch({ type: 'setRoute', route: r.id }).reasons })}
                      >
                        {r.id.replace('.', ' ')}
                        <span className="text-on-surface-variant">→ {r.destination.replace(/^S-?/, '')}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
        </div>
      </Section>
    </div>
  )
}
