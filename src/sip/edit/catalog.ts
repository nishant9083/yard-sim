import type { LineArrowDirection, SignalElement, SignalKind, StructureKind, Track } from '@/sip/model'

export type ToolId =
  | 'select'
  | 'pan'
  | 'track'
  | 'vertex'
  | 'connect'
  | 'signal'
  | 'point'
  | 'joint'
  | 'arrow'
  | 'circuit'
  | 'platform'
  | 'structure'
  | 'bridge'
  | 'text'
  | 'origin'

/** Structures drawn to scale with an outline; the rest are symbols placed with a click. */
export const OUTLINE_STRUCTURES: StructureKind[] = ['building', 'smRoom', 'fob']

export interface ToolOptions {
  trackKind: Track['kind']
  signalPreset: string
  structureKind: StructureKind
  /** Which way the next line arrow points. */
  arrowDirection: LineArrowDirection
  /** Crossover / turnout tool also drops the point machines. */
  connectWithPoints: boolean
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  trackKind: 'main',
  signalPreset: 'starter',
  structureKind: 'building',
  arrowDirection: 'right',
  connectWithPoints: true,
}

export interface SignalPreset {
  id: string
  label: string
  kind: SignalKind
  elements: SignalElement[]
}

export const SIGNAL_PRESETS: SignalPreset[] = [
  { id: 'simple', label: 'Single lamp', kind: 'signal', elements: [{ kind: 'lamp', style: 'solid' }] },
  { id: 'starter', label: 'Starter', kind: 'starter', elements: [{ kind: 'lamp', style: 'vbar' }, { kind: 'lamp', style: 'slash' }] },
  {
    id: 'home',
    label: 'Home (calling-on)',
    kind: 'home',
    elements: [{ kind: 'callingOn' }, { kind: 'lamp', style: 'vbar' }, { kind: 'lamp', style: 'slash' }],
  },
  {
    id: 'distant',
    label: 'Distant',
    kind: 'distant',
    elements: [{ kind: 'marker', text: 'P' }, { kind: 'lamp', style: 'slash' }, { kind: 'lamp', style: 'solid' }, { kind: 'lamp', style: 'slash' }],
  },
  { id: 'shunt', label: 'Shunt', kind: 'shunt', elements: [{ kind: 'lamp', style: 'solid' }, { kind: 'shunt' }] },
  { id: 'advanced', label: 'Advanced starter', kind: 'advancedStarter', elements: [{ kind: 'lamp', style: 'vbar' }, { kind: 'lamp', style: 'slash' }] },
]

export const presetById = (id: string): SignalPreset => SIGNAL_PRESETS.find((p) => p.id === id) ?? SIGNAL_PRESETS[0]!

export const STRUCTURE_NAMES: Record<StructureKind, string> = {
  building: 'STN. BLDG',
  smRoom: 'S.M. ROOM',
  fob: 'FOB',
  goomty: 'GOOMTY',
  detector: 'DETECTOR',
  locoPilotBoard: 'LOCO PILOT BOARD',
  lvv: 'LVV',
}

/** Default size (drawing units) when a structure is placed with a click instead of a drag. */
export const STRUCTURE_SIZE: Record<StructureKind, [number, number]> = {
  building: [110, 55],
  smRoom: [30, 16],
  fob: [40, 12],
  goomty: [14, 9],
  detector: [14, 9],
  locoPilotBoard: [14, 9],
  lvv: [0, 0],
}

export const TRACK_KINDS: { id: Track['kind']; label: string }[] = [
  { id: 'main', label: 'Main line' },
  { id: 'loop', label: 'Loop line' },
  { id: 'siding', label: 'Siding' },
  { id: 'overrun', label: 'Overrun' },
]

/** What the user should do next, shown under the canvas. */
export const TOOL_HELP: Record<ToolId, string> = {
  select:
    'Click to select, drag to move (Shift: one axis, Ctrl: snap to grid, arrow keys nudge). Drag a corner or a mid-edge + to reshape. Double-click a line or edge to add a vertex, a corner to remove it.',
  pan: 'Drag to pan. Scroll to zoom.',
  track: 'Click to start a line, click to add bends. Double-click or Enter to finish, Esc to cancel, Shift keeps it level. Start or end on an existing line to join it.',
  vertex: 'Click a line to add a bend, or beyond the end of the selected line to extend it. Click the edge of a platform or building to add a corner.',
  connect: 'Click a spot on one line, then a spot on another. A crossover or turnout is made, with its points.',
  signal: 'Click beside a line to place a signal. Which side you click decides the side of the head.',
  point: 'Click a junction (or a spot on a line) to add a point machine.',
  joint: 'Click a line to put an insulated joint there.',
  arrow: 'Choose < , > or <> below, then click anywhere on a line to place an arrow. Click again for as many as you need. Drag one to move it.',
  circuit: 'Click a line section between joints to create its track circuit.',
  platform: 'Drag a rectangle, or click corner by corner for any shape (double-click, Enter or click the first corner to close).',
  structure: 'Buildings: drag a rectangle or click corner by corner for any shape. Boxes and LVV: click to place.',
  bridge: 'Click a line to mark a bridge.',
  text: 'Click to drop a text label.',
  origin: 'Click where the station centre line (chainage 0) is.',
}
