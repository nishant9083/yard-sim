import { useCallback, useMemo, useState } from 'react'
import { layoutStation } from '@/sip/layout'
import { formatChainage, indexStation, type EntityRef, type Station } from '@/sip/model'
import { DEFAULT_LAYERS, type LayerVisibility } from '@/sip/render'
import { InspectorPanel } from './InspectorPanel'
import { SidePanel } from './SidePanel'
import { SipCanvas, type FitRequest, type FocusRequest, type ZoomRequest } from './SipCanvas'
import { Crosshair, MousePointerClick } from 'lucide-react'
import { Toolbar, ZoomControl } from './Toolbar'

interface StationViewerProps {
  station: Station
}

export function StationViewer({ station }: StationViewerProps) {
  const [yExaggeration, setYExaggeration] = useState(station.meta.viewHints?.yExaggeration ?? 4)
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS)
  const [hovered, setHovered] = useState<EntityRef | null>(null)
  const [selected, setSelected] = useState<EntityRef | null>(null)
  const [fit, setFit] = useState<FitRequest>({ mode: 'core', token: 0 })
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [zoom, setZoom] = useState(1)
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [cursorX, setCursorX] = useState<number | null>(null)

  const layout = useMemo(() => layoutStation(station, { yExaggeration }), [station, yExaggeration])
  const index = useMemo(() => indexStation(station), [station])

  const selectAndFocus = useCallback((ref: EntityRef) => {
    setSelected(ref)
    setFocus((f) => ({ ref, token: (f?.token ?? 0) + 1 }))
  }, [])

  const chainageText = useMemo(() => {
    if (cursorX === null || !station.meta.chainage) return null
    return formatChainage(station.meta.chainage, cursorX)
  }, [cursorX, station.meta.chainage])

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <SipCanvas
            layout={layout}
            layers={layers}
            hovered={hovered}
            selected={selected}
            fit={fit}
            focus={focus}
            zoomRequest={zoomRequest}
            onZoomChange={setZoom}
            onHover={setHovered}
            onSelect={setSelected}
            onCursorX={setCursorX}
          />
          <Toolbar
            layers={layers}
            onLayersChange={setLayers}
            yExaggeration={yExaggeration}
            onYExaggerationChange={setYExaggeration}
            onFit={(mode) => setFit((f) => ({ mode, token: f.token + 1 }))}
          />
          <InspectorPanel station={station} index={index} entity={hovered ?? selected} onSelect={selectAndFocus} />
        </div>
        <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-outline-variant bg-surface-container px-3 text-[11px] text-on-surface-variant">
          <span className="flex min-w-0 items-center gap-1.5" title="Chainage under the pointer">
            <Crosshair className="size-3.5 shrink-0" aria-hidden />
            <span className={`truncate tabular-nums ${chainageText ? 'font-mono text-on-surface' : ''}`}>
              {chainageText ?? (station.meta.chainage ? 'Point at the drawing for chainage' : 'No chainage scale for this station')}
            </span>
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-4">
            <span className="hidden items-center gap-1.5 whitespace-nowrap lg:flex">
              <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
              Click to select · Drag to pan · Scroll to zoom · Double-click to fit
            </span>
            <span className="hidden h-4 w-px bg-outline-variant lg:block" aria-hidden />
            <ZoomControl zoom={zoom} onZoomChange={(z) => setZoomRequest((r) => ({ zoom: z, token: (r?.token ?? 0) + 1 }))} />
          </div>
        </footer>
      </div>
      <SidePanel station={station} selected={selected} onSelect={selectAndFocus} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
    </div>
  )
}
