import { Focus, Maximize2, PanelRightClose, PanelRightOpen, Ruler, Signal, Spline, TrainTrack } from 'lucide-react'
import { MAX_ZOOM, MIN_ZOOM, type LayerVisibility } from '@/sip/render'
import { LayerMenu } from './LayerMenu'
import { LayerToggle } from './LayerToggle'

interface ToolbarProps {
  layers: LayerVisibility
  onLayersChange: (layers: LayerVisibility) => void
  yExaggeration: number
  onYExaggerationChange: (value: number) => void
  onFit: (mode: 'core' | 'all') => void
  zoom: number
  onZoomChange: (zoom: number) => void
  panelOpen: boolean
  onTogglePanel: () => void
}

const buttonClass =
  'flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-secondary'

export function Toolbar({ layers, onLayersChange, yExaggeration, onYExaggerationChange, onFit, zoom, onZoomChange, panelOpen, onTogglePanel }: ToolbarProps) {
  const toggle = (key: keyof LayerVisibility) => () => onLayersChange({ ...layers, [key]: !layers[key] })

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1 rounded-lg border border-outline-variant bg-surface-container/90 p-1 backdrop-blur">
      <button type="button" className={buttonClass} onClick={() => onFit('core')} title="Zoom to the station">
        <Focus className="size-4" aria-hidden />
        Station
      </button>
      <button type="button" className={buttonClass} onClick={() => onFit('all')} title="Show the whole drawing">
        <Maximize2 className="size-4" aria-hidden />
        Whole yard
      </button>

      <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

      <LayerToggle icon={Signal} label="Signals" active={layers.signals} onToggle={toggle('signals')} />
      <LayerToggle icon={Spline} label="Points" active={layers.points} onToggle={toggle('points')} />
      <LayerToggle icon={TrainTrack} label="Circuits" active={layers.trackCircuits} onToggle={toggle('trackCircuits')} />
      <LayerToggle icon={Ruler} label="Lengths" active={layers.dimensions} onToggle={toggle('dimensions')} />
      <LayerMenu layers={layers} onChange={onLayersChange} />

      <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

      <label className="flex items-center gap-2 px-2 text-xs text-on-surface-variant">
        Vertical stretch
        <input
          type="range"
          min={1}
          max={8}
          step={0.5}
          value={yExaggeration}
          onChange={(e) => onYExaggerationChange(Number(e.target.value))}
          className="w-24 accent-primary"
        />
        <span className="w-6 tabular-nums text-on-surface">{yExaggeration}×</span>
      </label>

      <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

      <label className="flex items-center gap-2 px-2 text-xs text-on-surface-variant">
        Zoom
        <input
          type="range"
          min={Math.log(MIN_ZOOM)}
          max={Math.log(MAX_ZOOM)}
          step={0.01}
          value={Math.log(zoom)}
          onChange={(e) => onZoomChange(Math.exp(Number(e.target.value)))}
          className="w-28 accent-primary"
          aria-label="Zoom"
        />
      </label>

      <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

      <button type="button" className={buttonClass} onClick={onTogglePanel} title={panelOpen ? 'Hide legend and tables' : 'Show legend and tables'}>
        {panelOpen ? <PanelRightClose className="size-4" aria-hidden /> : <PanelRightOpen className="size-4" aria-hidden />}
        Legend &amp; tables
      </button>
    </div>
  )
}
