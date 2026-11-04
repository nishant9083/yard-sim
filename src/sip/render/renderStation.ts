import { drawAnnotations } from './drawAnnotations'
import { drawBridges } from './drawBridges'
import { drawConnections } from './drawConnections'
import { drawDimensions } from './drawDimensions'
import { drawJoints } from './drawJoints'
import { drawLabels } from './drawLabels'
import { drawLanes } from './drawLanes'
import { drawNodes } from './drawNodes'
import { drawPlatforms } from './drawPlatforms'
import { drawPoints } from './drawPoints'
import { drawSignals } from './drawSignals'
import { drawStructureLabels, drawStructures } from './drawStructures'
import { drawTrackCircuitBands, drawTrackCircuitLabels } from './drawTrackCircuits'
import { drawTracks } from './drawTracks'
import { LabelPlacer } from './placer'
import type { DrawArgs, HitRegion } from './types'

export interface RenderArgs extends Omit<DrawArgs, 'placer' | 'regions'> {
  dpr: number
}

/**
 * Draw order, back to front:
 * platforms, structures, track circuit bands, connections, tracks, joints, bridges, nodes,
 * then symbols with labels in priority order (signals, points, track circuits, dimensions, lanes, text, line names).
 * Returns the clickable regions recorded on the way.
 */
export function renderStation(args: RenderArgs): HitRegion[] {
  const { ctx, viewport, dpr, theme } = args
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, viewport.width, viewport.height)

  const regions: HitRegion[] = []
  const draw: DrawArgs = { ...args, placer: new LabelPlacer(viewport), regions }

  drawPlatforms(draw)
  drawStructures(draw)
  drawTrackCircuitBands(draw)
  drawConnections(draw)
  drawTracks(draw)
  drawJoints(draw)
  drawBridges(draw)
  drawNodes(draw)
  drawSignals(draw)
  drawPoints(draw)
  drawStructureLabels(draw)
  drawTrackCircuitLabels(draw)
  drawDimensions(draw)
  drawLanes(draw)
  drawAnnotations(draw)
  drawLabels(draw)
  return regions
}
