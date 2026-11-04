import { Building2, CircleDot, Gauge, Hash, Landmark, Milestone, Route, Ruler, Signal, Spline, Tag, TrainTrack, Waypoints, type LucideIcon } from 'lucide-react'
import type { LayerVisibility } from '@/sip/render'

export interface LayerEntry {
  key: keyof LayerVisibility
  label: string
  icon: LucideIcon
  hint: string
}

/** Layers in the order the menu lists them. */
export const SKELETON_LAYERS: LayerEntry[] = [
  { key: 'trackLabels', label: 'Line names', icon: Tag, hint: 'Line number, name and clear standing length' },
  { key: 'connectionLabels', label: 'Connections', icon: Waypoints, hint: 'Crossover and turnout names' },
  { key: 'nodes', label: 'Junctions', icon: CircleDot, hint: 'Junction dots' },
  { key: 'nodeLabels', label: 'Node ids', icon: Hash, hint: 'Internal node ids' },
]

export const ASSET_LAYERS: LayerEntry[] = [
  { key: 'signals', label: 'Signals', icon: Signal, hint: 'Signal heads with their SIP codes' },
  { key: 'points', label: 'Points', icon: Spline, hint: 'Point numbers and ratios' },
  { key: 'trackCircuits', label: 'Track circuits', icon: TrainTrack, hint: 'Circuit bands and codes' },
  { key: 'joints', label: 'Joints', icon: Milestone, hint: 'Insulated joints' },
  { key: 'platforms', label: 'Platforms', icon: Landmark, hint: 'Platform outlines' },
  { key: 'structures', label: 'Structures', icon: Building2, hint: 'Buildings, FOB, goomty, boards, LVV' },
  { key: 'dimensions', label: 'Dimensions', icon: Ruler, hint: 'Printed lengths' },
  { key: 'chainage', label: 'Chainage', icon: Ruler, hint: 'Ruler and PT / FM / DS / DE marks' },
  { key: 'bridges', label: 'Bridges', icon: Milestone, hint: 'Culverts and bridges' },
  { key: 'gradients', label: 'Gradients', icon: Gauge, hint: 'Gradient posts' },
  { key: 'routes', label: 'Route labels', icon: Route, hint: 'Printed route / overlap text' },
  { key: 'annotations', label: 'Notes on drawing', icon: Tag, hint: 'Axle sections, over-run notes, CSL' },
]
