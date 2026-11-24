import { Focus, Maximize2, Minus, MoveVertical, Plus, Ruler, Signal, Spline, TrainTrack } from 'lucide-react'
import { MAX_ZOOM, MIN_ZOOM, type LayerVisibility } from '@/sip/render'
import { LayerMenu } from './LayerMenu'
import { LayerToggle } from './LayerToggle'
import { btnGhost, btnIcon, divider, floating } from './ui'

interface ToolbarProps {
  layers: LayerVisibility
  onLayersChange: (layers: LayerVisibility) => void
  yExaggeration: number
  onYExaggerationChange: (value: number) => void
  onFit: (mode: 'core' | 'all') => void
}

export function Toolbar({ layers, onLayersChange, yExaggeration, onYExaggerationChange, onFit }: ToolbarProps) {
  const toggle = (key: keyof LayerVisibility) => () => onLayersChange({ ...layers, [key]: !layers[key] })

  return (
    <div role="toolbar" aria-label="View" className={`${floating} absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-0.5 p-1`}>
      <button type="button" className={btnGhost} onClick={() => onFit('core')} title="Zoom to the station">
        <Focus className="size-4" aria-hidden />
        Station
      </button>
      <button type="button" className={btnGhost} onClick={() => onFit('all')} title="Show the whole drawing (double-click the drawing also re-fits)">
        <Maximize2 className="size-4" aria-hidden />
        Whole yard
      </button>

      <span className={divider} aria-hidden />

      <LayerToggle icon={Signal} label="Signals" active={layers.signals} onToggle={toggle('signals')} />
      <LayerToggle icon={Spline} label="Points" active={layers.points} onToggle={toggle('points')} />
      <LayerToggle icon={TrainTrack} label="Circuits" active={layers.trackCircuits} onToggle={toggle('trackCircuits')} />
      <LayerToggle icon={Ruler} label="Lengths" active={layers.dimensions} onToggle={toggle('dimensions')} />
      <LayerMenu layers={layers} onChange={onLayersChange} />

      <span className={divider} aria-hidden />

      <label className="flex h-8 items-center gap-2 px-2 text-xs font-medium text-on-surface-variant" title="Spread the lines apart vertically. The SIP is not to scale across the lines.">
        <MoveVertical className="size-4" aria-hidden />
        <span className="whitespace-nowrap">Vertical stretch</span>
        <input
          type="range"
          min={1}
          max={8}
          step={0.5}
          value={yExaggeration}
          onChange={(e) => onYExaggerationChange(Number(e.target.value))}
          className="w-24"
          aria-label="Vertical stretch"
        />
        <span className="w-8 text-right font-mono text-[11px] text-on-surface tabular-nums">{yExaggeration}×</span>
      </label>
    </div>
  )
}

interface ZoomControlProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

/** − slider + with the zoom as a percentage, for the status bar. */
export function ZoomControl({ zoom, onZoomChange }: ZoomControlProps) {
  const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Zoom">
      <button type="button" className={`${btnIcon} size-6`} onClick={() => onZoomChange(clamp(zoom / 1.25))} disabled={zoom <= MIN_ZOOM * 1.001} title="Zoom out" aria-label="Zoom out">
        <Minus className="size-3.5" aria-hidden />
      </button>
      <input
        type="range"
        min={Math.log(MIN_ZOOM)}
        max={Math.log(MAX_ZOOM)}
        step={0.01}
        value={Math.log(zoom)}
        onChange={(e) => onZoomChange(Math.exp(Number(e.target.value)))}
        className="w-24"
        aria-label="Zoom level"
      />
      <button type="button" className={`${btnIcon} size-6`} onClick={() => onZoomChange(clamp(zoom * 1.25))} disabled={zoom >= MAX_ZOOM * 0.999} title="Zoom in" aria-label="Zoom in">
        <Plus className="size-3.5" aria-hidden />
      </button>
      <span className="w-12 text-right font-mono tabular-nums">{Math.round(zoom * 100)}%</span>
    </div>
  )
}
