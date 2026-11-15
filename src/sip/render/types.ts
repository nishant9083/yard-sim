import type { EntityRef, EntityType } from '@/sip/model'
import type { StationLayout } from '@/sip/layout'
import type { Camera, Viewport } from './camera'
import type { LabelPlacer } from './placer'
import type { CanvasTheme } from './theme'

export interface LayerVisibility {
  // step 1: skeleton
  nodes: boolean
  trackLabels: boolean
  connectionLabels: boolean
  nodeLabels: boolean
  // step 2: assets
  signals: boolean
  points: boolean
  trackCircuits: boolean
  joints: boolean
  lineArrows: boolean
  platforms: boolean
  structures: boolean
  dimensions: boolean
  chainage: boolean
  bridges: boolean
  gradients: boolean
  routes: boolean
  annotations: boolean
}

export const DEFAULT_LAYERS: LayerVisibility = {
  nodes: false,
  trackLabels: true,
  connectionLabels: false,
  nodeLabels: false,
  signals: true,
  points: true,
  trackCircuits: true,
  joints: true,
  lineArrows: true,
  platforms: true,
  structures: true,
  dimensions: true,
  chainage: true,
  bridges: true,
  gradients: true,
  routes: false,
  annotations: true,
}

export interface RenderState {
  hovered: EntityRef | null
  selected: EntityRef | null
  layers: LayerVisibility
}

/** A clickable screen rectangle recorded while drawing. */
export interface HitRegion {
  ref: EntityRef
  x: number
  y: number
  w: number
  h: number
}

export interface DrawArgs {
  ctx: CanvasRenderingContext2D
  layout: StationLayout
  camera: Camera
  viewport: Viewport
  theme: CanvasTheme
  state: RenderState
  placer: LabelPlacer
  regions: HitRegion[]
}

export type Emphasis = 'selected' | 'hovered' | null

export function emphasisOf(state: RenderState, type: EntityType, id: string): Emphasis {
  const is = (ref: EntityRef | null) => ref !== null && ref.type === type && ref.id === id
  if (is(state.selected)) return 'selected'
  if (is(state.hovered)) return 'hovered'
  return null
}
