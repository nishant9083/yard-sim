import { useCallback, useMemo, useState } from 'react'
import { layoutStation } from '@/sip/layout'
import { formatChainage, indexStation, type EntityRef, type Station } from '@/sip/model'
import { DEFAULT_LAYERS, type LayerVisibility } from '@/sip/render'
import { InspectorPanel } from './InspectorPanel'
import { SidePanel } from './SidePanel'
import { SipCanvas, type FitRequest, type FocusRequest, type ZoomRequest } from './SipCanvas'
import { Toolbar } from './Toolbar'

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
  const [panelOpen, setPanelOpen] = useState(true)
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
      <div className="relative min-w-0 flex-1">
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
          zoom={zoom}
          onZoomChange={(z) => setZoomRequest((r) => ({ zoom: z, token: (r?.token ?? 0) + 1 }))}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((v) => !v)}
        />
        <InspectorPanel station={station} index={index} entity={hovered ?? selected} onSelect={selectAndFocus} />
        {chainageText && (
          <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-outline-variant bg-surface-container/90 px-2 py-1 text-xs text-on-surface tabular-nums">
            {chainageText}
          </div>
        )}
      </div>
      {panelOpen && <SidePanel station={station} selected={selected} onSelect={selectAndFocus} />}
    </div>
  )
}
