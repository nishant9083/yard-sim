/**
 * Everything the simulator needs that the RCC does not say. One small JSON per station
 * (`src/sim/data/<code>.sim.json`). Nothing here is Jarati specific in the engine; Jarati only
 * supplies values.
 */

export interface BlockInputConfig {
  /** Contact name used in the chart remark: "TGT", "LC". */
  id: string
  label: string
  defaultValue: boolean
  /** The contact drops when this route's first track circuit is occupied (the line clear is used up). */
  consumedByRoute?: string
}

export interface BlockSectionConfig {
  /** Section code as the chart writes it, e.g. "JRT-MVG". */
  id: string
  label: string
  instrument: string
  inputs: BlockInputConfig[]
}

export interface StationSimConfig {
  station: string
  /**
   * Signal post number (as the chart writes it: "1", "11", "15") to the signal id in the station JSON.
   * Posts the chart only mentions (destinations, lamp protection) are listed here too.
   */
  posts: Record<string, string>
  /**
   * Where a three-way node sends traffic when the geometry alone cannot decide.
   * Key: node id. Values: a track id, a connection id, or "<trackId>:prev" / "<trackId>:next".
   */
  switchOverrides?: Record<string, { normal: string; reverse: string }>
  /** Connection id to the track circuits it occupies, when the point chart cannot tell. */
  connectionTcs?: Record<string, string[]>
  blockSections?: BlockSectionConfig[]
  /** Free text shown in the settings panel: what was assumed. */
  notes?: string[]
}
