import { Download, Focus, Maximize2, Pause, Play, RotateCcw, Signal, SkipForward, Spline, TrainTrack, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { layoutStation } from '@/sip/layout'
import type { EntityRef, Station } from '@/sip/model'
import { DEFAULT_LAYERS, type DrawArgs, type LayerVisibility } from '@/sip/render'
import { LayerMenu } from '@/sip/components/LayerMenu'
import { LayerToggle } from '@/sip/components/LayerToggle'
import { SipCanvas, type FitRequest } from '@/sip/components/SipCanvas'
import { DT, Simulation } from '../engine/simulation'
import type { Command } from '../engine/types'
import { createSimulation } from '../registry'
import { FieldPanel } from './FieldPanel'
import { ChecksPanel, LogPanel, SettingsPanel } from './MiscPanels'
import { OperatePanel } from './OperatePanel'
import { drawSimOverlay } from './overlay'
import { TrainsPanel } from './TrainsPanel'
import { btn, btnPrimary, useSimVersion } from './ui'

const TABS = ['Operate', 'Trains', 'Field', 'Log', 'Checks', 'Settings'] as const
type Tab = (typeof TABS)[number]
const SPEEDS = [0.5, 1, 2, 5, 10]
/** The simulator shows the working railway: signals, points, circuits and line names. The rest is a click away. */
const SIM_LAYERS: LayerVisibility = {
  ...(Object.fromEntries(Object.keys(DEFAULT_LAYERS).map((k) => [k, false])) as unknown as LayerVisibility),
  signals: true,
  points: true,
  trackCircuits: true,
  trackLabels: true,
}

export function SimulationView({ station }: { station: Station }) {
  const sim = useMemo(() => createSimulation(station), [station])
  useSimVersion(sim)
  const layout = useMemo(() => layoutStation(station, { yExaggeration: station.meta.viewHints?.yExaggeration ?? 4 }), [station])
  const [tab, setTab] = useState<Tab>('Operate')
  // The clock does not run until the first route or train, or until Start is pressed.
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [layers, setLayers] = useState<LayerVisibility>(SIM_LAYERS)
  const [speed, setSpeed] = useState(1)
  const [hovered, setHovered] = useState<EntityRef | null>(null)
  const [selected, setSelected] = useState<EntityRef | null>(null)
  const [fit, setFit] = useState<FitRequest>({ mode: 'all', token: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!playing) return
    let acc = 0
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      acc += Math.min(0.25, (now - last) / 1000) * speed
      last = now
      let n = 0
      while (acc >= DT && n++ < 400) {
        sim.step(DT)
        acc -= DT
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [sim, playing, speed])

  // The first route or train starts the clock.
  const acted = sim.history.some((h) => h.cmd.type === 'setRoute' || h.cmd.type === 'addTrain')
  useEffect(() => {
    if (acted && !started) {
      setStarted(true)
      setPlaying(true)
    }
  }, [acted, started])

  const overlay = useMemo(() => (args: DrawArgs) => drawSimOverlay(args, sim), [sim, sim.version])

  const onSelect = useCallback((ref: EntityRef | null) => {
    setSelected(ref)
    if (!ref) return
    if (ref.type === 'signal') setTab('Operate')
    else if (ref.type === 'point' || ref.type === 'trackCircuit') setTab('Field')
  }, [])

  const focusSignal = selected?.type === 'signal' ? selected.id : null
  const toggle = (key: keyof LayerVisibility) => () => setLayers((l) => ({ ...l, [key]: !l[key] }))

  const save = () => {
    const blob = new Blob([JSON.stringify({ station: station.meta.code, until: sim.time, history: sim.history }, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${station.meta.code}-scenario.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const load = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { station: string; until: number; history: { t: number; cmd: Command }[] }
      if (data.station !== station.meta.code) throw new Error(`Scenario is for ${data.station}`)
      setPlaying(false)
      Simulation.replay(sim, data.history, data.until)
      setStarted(true)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Not a scenario file')
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="relative min-w-0 flex-1">
        <SipCanvas layout={layout} layers={layers} hovered={hovered} selected={selected} fit={fit} focus={null} onHover={setHovered} onSelect={onSelect} overlay={overlay} />
        <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container/95 p-1.5 shadow-lg">
          {!started ? (
            <button className={btnPrimary} onClick={() => { setStarted(true); setPlaying(true) }}><Play className="size-3.5" />Start</button>
          ) : (
            <button className={btn} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {playing ? 'Pause' : 'Resume'}
            </button>
          )}
          <button className={btn} onClick={() => { setStarted(true); sim.run(1) }} title="Advance one second" aria-label="Step one second"><SkipForward className="size-3.5" />1 s</button>
          <select className="h-7 rounded-md border border-outline-variant bg-surface px-1 text-xs text-on-surface" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Speed">
            {SPEEDS.map((x) => <option key={x} value={x}>{x}×</option>)}
          </select>
          <span className="flex w-24 items-center justify-end gap-1.5 text-xs text-on-surface tabular-nums" title={!started ? 'Not started' : playing ? 'Running' : 'Paused'}>
            <i className={`inline-block size-2 rounded-full ${!started ? 'bg-outline' : playing ? 'bg-[#3ddc84]' : 'bg-[#ffb454]'}`} />
            {formatTime(sim.time)}
          </span>
          <span className="h-5 w-px bg-outline-variant" aria-hidden />
          <button className={btn} onClick={() => { sim.reset(); setStarted(false); setPlaying(false) }} title="Clear everything and start again"><RotateCcw className="size-3.5" />Reset</button>
          <button className={btn} onClick={save} title="Save the commands so far as a scenario" aria-label="Save scenario"><Download className="size-3.5" /></button>
          <button className={btn} onClick={() => fileRef.current?.click()} title="Load a scenario and replay it" aria-label="Load scenario"><Upload className="size-3.5" /></button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f) }} />
          <span className="h-5 w-px bg-outline-variant" aria-hidden />
          <button className={btn} onClick={() => setFit((f) => ({ mode: 'core', token: f.token + 1 }))} title="Zoom to the station"><Focus className="size-3.5" />Station</button>
          <button className={btn} onClick={() => setFit((f) => ({ mode: 'all', token: f.token + 1 }))} title="Show the whole drawing"><Maximize2 className="size-3.5" />Whole yard</button>
          <span className="h-5 w-px bg-outline-variant" aria-hidden />
          <LayerToggle icon={Signal} label="Signals" active={layers.signals} onToggle={toggle('signals')} />
          <LayerToggle icon={Spline} label="Points" active={layers.points} onToggle={toggle('points')} />
          <LayerToggle icon={TrainTrack} label="Circuits" active={layers.trackCircuits} onToggle={toggle('trackCircuits')} />
          <LayerMenu layers={layers} onChange={setLayers} />
        </div>
        <Legend />
      </div>
      <aside className="flex w-[400px] shrink-0 flex-col border-l border-outline-variant bg-surface-container">
        <nav className="flex border-b border-outline-variant" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 px-1 py-2 text-xs transition-colors ${tab === t ? 'border-b-2 border-primary text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {t}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'Operate' && <OperatePanel sim={sim} focusSignal={focusSignal} onClearFocus={() => setSelected(null)} />}
          {tab === 'Trains' && <TrainsPanel sim={sim} />}
          {tab === 'Field' && <FieldPanel sim={sim} />}
          {tab === 'Log' && <LogPanel sim={sim} />}
          {tab === 'Checks' && <ChecksPanel sim={sim} />}
          {tab === 'Settings' && <SettingsPanel sim={sim} />}
        </div>
      </aside>
    </div>
  )
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

function Legend() {
  const item = (c: string, t: string) => (
    <span className="flex items-center gap-1.5">
      <i className="inline-block h-2 w-3 rounded-sm" style={{ background: c }} />
      {t}
    </span>
  )
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-md border border-outline-variant bg-surface-container/90 px-2.5 py-1.5 text-[11px] text-on-surface-variant">
      {item('#ff5d6c', 'Occupied')}
      {item('#f4f6fa', 'Route reserved')}
      {item('#4cc9f0', 'Train / point locked')}
      {item('#3ddc84', 'Point free')}
      {item('#ffb454', 'Point moving')}
    </div>
  )
}
