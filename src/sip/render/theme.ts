export interface CanvasTheme {
  background: string
  trackMain: string
  trackLoop: string
  trackSiding: string
  trackOverrun: string
  connection: string
  nodeJunction: string
  nodeEnd: string
  label: string
  arrows: string
  labelMuted: string
  hover: string
  selected: string
  signal: string
  point: string
  joint: string
  trackCircuit: [string, string, string]
  platform: string
  structure: string
  bridge: string
  dimension: string
  chainage: string
  route: string
  font: string
  fontSmall: string
}

const FALLBACK: CanvasTheme = {
  background: '#0a0c10',
  trackMain: '#d3d9e2',
  trackLoop: '#a3adbb',
  trackSiding: '#8893a3',
  trackOverrun: '#6a7585',
  connection: '#b4bcc8',
  nodeJunction: '#5aa9ff',
  nodeEnd: '#ff6b81',
  label: '#d68cff',
  arrows: '#f2a65a',
  labelMuted: '#8f99a8',
  hover: '#4cc9f0',
  selected: '#f2c94c',
  signal: '#ffffff',
  point: '#5aa9ff',
  joint: '#ffb454',
  trackCircuit: ['#4cc9f0', '#7bd88f', '#f2a65a'],
  platform: '#7f8aa0',
  structure: '#9aa7bd',
  bridge: '#c9a46b',
  dimension: '#6f8aa8',
  chainage: '#8f99a8',
  route: '#f2c94c',
  font: '12px ui-sans-serif, system-ui, sans-serif',
  fontSmall: '10.5px ui-sans-serif, system-ui, sans-serif',
}

/** Read the canvas palette from the CSS tokens declared in index.css. */
export function readCanvasTheme(): CanvasTheme {
  if (typeof document === 'undefined') return FALLBACK
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return {
    background: read('--color-surface', FALLBACK.background),
    trackMain: read('--color-sip-track-main', FALLBACK.trackMain),
    trackLoop: read('--color-sip-track-loop', FALLBACK.trackLoop),
    trackSiding: read('--color-sip-track-siding', FALLBACK.trackSiding),
    trackOverrun: read('--color-sip-track-overrun', FALLBACK.trackOverrun),
    connection: read('--color-sip-connection', FALLBACK.connection),
    nodeJunction: read('--color-sip-node-junction', FALLBACK.nodeJunction),
    nodeEnd: read('--color-sip-node-end', FALLBACK.nodeEnd),
    label: read('--color-sip-label', FALLBACK.label),
    arrows: read('--color-sip-arrows', FALLBACK.arrows),
    labelMuted: read('--color-sip-label-muted', FALLBACK.labelMuted),
    hover: read('--color-secondary', FALLBACK.hover),
    selected: read('--color-primary', FALLBACK.selected),
    signal: read('--color-sip-signal', FALLBACK.signal),
    point: read('--color-sip-point', FALLBACK.point),
    joint: read('--color-sip-joint', FALLBACK.joint),
    trackCircuit: [
      read('--color-sip-tc-a', FALLBACK.trackCircuit[0]),
      read('--color-sip-tc-b', FALLBACK.trackCircuit[1]),
      read('--color-sip-tc-c', FALLBACK.trackCircuit[2]),
    ],
    platform: read('--color-sip-platform', FALLBACK.platform),
    structure: read('--color-sip-structure', FALLBACK.structure),
    bridge: read('--color-sip-bridge', FALLBACK.bridge),
    dimension: read('--color-sip-dimension', FALLBACK.dimension),
    chainage: read('--color-sip-chainage', FALLBACK.chainage),
    route: read('--color-sip-route', FALLBACK.route),
    font: FALLBACK.font,
    fontSmall: FALLBACK.fontSmall,
  }
}
