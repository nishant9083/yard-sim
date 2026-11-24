import { Download, Focus, Maximize2, PanelRightClose, PanelRightOpen, Pause, Play, RotateCcw, Signal, SkipForward, Spline, TrainTrack, Upload } from 'lucide-react'
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
import { btnGhost, btnIcon, btnPrimary as btnMain, divider, floating, tabClass } from '@/sip/components/ui'
import { useSimVersion } from './ui'

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
  const [panelOpen, setPanelOpen] = useState(true)
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
        <div role="toolbar" aria-label="Simulation" className={`${floating} absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-0.5 p-1`}>
          {!started ? (
            <button type="button" className={`${btnMain} mr-1`} onClick={() => { setStarted(true); setPlaying(true) }}><Play className="size-3.5" aria-hidden />Start</button>
          ) : (
            <button type="button" className={`${btnGhost} w-[5.5rem] justify-start`} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {playing ? 'Pause' : 'Resume'}
            </button>
          )}
          <button type="button" className={btnGhost} onClick={() => { setStarted(true); sim.run(1) }} title="Advance one second" aria-label="Step one second"><SkipForward className="size-4" aria-hidden />1 s</button>
          <select className="h-8 rounded-md border border-outline-variant bg-surface-container-low px-1.5 font-mono text-xs text-on-surface transition-colors hover:border-outline focus:border-accent focus:outline-none" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Speed" title="Simulation speed">
            {SPEEDS.map((x) => <option key={x} value={x}>{x}×</option>)}
          </select>
          <span className="ml-1 flex h-8 min-w-24 items-center justify-center gap-2 rounded-md border border-outline-variant bg-surface px-2.5 font-mono text-xs text-on-surface tabular-nums" title={!started ? 'Not started' : playing ? 'Running' : 'Paused'}>
            <i className={`inline-block size-2 rounded-full ${!started ? 'bg-outline' : playing ? 'bg-success shadow-[0_0_6px_var(--color-success)]' : 'bg-warning'}`} aria-hidden />
            {formatTime(sim.time)}
          </span>
          <span className={divider} aria-hidden />
          <button type="button" className={btnGhost} onClick={() => { sim.reset(); setStarted(false); setPlaying(false) }} title="Clear everything and start again"><RotateCcw className="size-4" aria-hidden />Reset</button>
          <button type="button" className={btnIcon} onClick={save} title="Save the commands so far as a scenario" aria-label="Save scenario"><Download className="size-4" aria-hidden /></button>
          <button type="button" className={btnIcon} onClick={() => fileRef.current?.click()} title="Load a scenario and replay it" aria-label="Load scenario"><Upload className="size-4" aria-hidden /></button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f) }} />
          <span className={divider} aria-hidden />
          <button type="button" className={btnGhost} onClick={() => setFit((f) => ({ mode: 'core', token: f.token + 1 }))} title="Zoom to the station"><Focus className="size-4" aria-hidden /><span className="hidden 2xl:inline">Station</span></button>
          <button type="button" className={btnGhost} onClick={() => setFit((f) => ({ mode: 'all', token: f.token + 1 }))} title="Show the whole drawing"><Maximize2 className="size-4" aria-hidden /><span className="hidden 2xl:inline">Whole yard</span></button>
          <span className={divider} aria-hidden />
          <LayerToggle icon={Signal} label="Signals" active={layers.signals} onToggle={toggle('signals')} />
          <LayerToggle icon={Spline} label="Points" active={layers.points} onToggle={toggle('points')} />
          <LayerToggle icon={TrainTrack} label="Circuits" active={layers.trackCircuits} onToggle={toggle('trackCircuits')} />
          <LayerMenu layers={layers} onChange={setLayers} />
        </div>
        <Legend />
      </div>
      <aside className={`flex shrink-0 flex-col border-l border-outline-variant bg-surface-container ${panelOpen ? 'w-[26rem] max-w-[45vw]' : 'w-11 items-center py-1.5'}`}>
        {!panelOpen && (
          <button type="button" onClick={() => setPanelOpen(true)} aria-label="Expand side panel" title="Expand side panel" className={btnIcon}>
            <PanelRightOpen className="size-4" aria-hidden />
          </button>
        )}
        {panelOpen && (
        <>
        <div className="flex items-center border-b border-outline-variant pr-1">
          <nav className="flex min-w-0 flex-1" role="tablist" aria-label="Simulation panels">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`${tabClass(tab === t)} px-1`}>
                {t}
              </button>
            ))}
          </nav>
          <button type="button" onClick={() => setPanelOpen(false)} aria-label="Collapse side panel" title="Collapse side panel" className={btnIcon}>
            <PanelRightClose className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'Operate' && <OperatePanel sim={sim} focusSignal={focusSignal} onClearFocus={() => setSelected(null)} />}
          {tab === 'Trains' && <TrainsPanel sim={sim} />}
          {tab === 'Field' && <FieldPanel sim={sim} />}
          {tab === 'Log' && <LogPanel sim={sim} />}
          {tab === 'Checks' && <ChecksPanel sim={sim} />}
          {tab === 'Settings' && <SettingsPanel sim={sim} />}
        </div>
        </>
        )}
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
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <i className="inline-block h-1 w-4 rounded-full" style={{ background: c }} />
      {t}
    </span>
  )
  return (
    <div className={`${floating} pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[11px] text-on-surface-variant`}>
      <span className="text-[10px] font-semibold tracking-[0.06em] uppercase">Key</span>
      {item('#ff5d6c', 'Occupied')}
      {item('#f4f6fa', 'Route reserved')}
      {item('#4cc9f0', 'Train / point locked')}
      {item('#3ddc84', 'Point free')}
      {item('#ffb454', 'Point moving')}
    </div>
  )
}
