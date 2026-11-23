import { signalAnchorX, type LineArrow, type LineArrowDirection, type Signal, type SignalElement, type Station } from '@/sip/model'

/**
 * House conventions for signals, as hand-corrected in ryd-cyd.json:
 *  - odd number  = UP signal: head faces east (right of the post), drawn above the line;
 *  - even number = DN signal: head faces west (left of the post), drawn below the line;
 *  - codes read along the head: east "SH25(A-C) 25" / "C7 7", west "108A/B SH108" / "86 C86";
 *  - elements outward from the post: shunt, marker, calling-on, lamps, route indicator, speed board.
 * Signals without their own number (distants such as "DIST (KK LINE)") and standalone speed boards are left alone.
 */
export function applySignalConventions(station: Station): { station: Station; changed: string[] } {
  const changed: string[] = []
  const signals = station.assets.signals.map((s) => {
    const next = conventionalSignal(s)
    if (JSON.stringify(next) !== JSON.stringify(s)) changed.push(`${s.code} -> ${next.code} (${next.headDir}/${next.side})`)
    return next
  })
  return { station: { ...station, assets: { ...station.assets, signals } }, changed }
}

const ELEMENT_ORDER: SignalElement['kind'][] = ['shunt', 'marker', 'callingOn', 'lamp', 'routeIndicator', 'speedBoard']

export function signalNumber(code: string): number | null {
  if (/^DIST/i.test(code.trim())) return null
  const m = code.match(/\d+/)
  return m ? Number(m[0]) : null
}

function conventionalSignal(s: Signal): Signal {
  if (s.kind === 'speedBoard') return s
  const n = signalNumber(s.code)
  if (n === null) return s
  const east = n % 2 === 1
  const headDir = east ? 'east' : 'west'
  const side = east ? 'above' : 'below'
  const elements = [...s.elements].sort((a, b) => ELEMENT_ORDER.indexOf(a.kind) - ELEMENT_ORDER.indexOf(b.kind))
  // The stored label sits beside the head: mirror it with the head.
  const label =
    s.label && (s.headDir !== headDir || s.side !== side)
      ? {
          x: s.headDir !== headDir ? 2 * s.footX - s.label.x : s.label.x,
          y: s.label.y,
        }
      : s.label
  return {
    ...s,
    code: conventionalCode(s, east),
    direction: east ? 'UP' : 'DN',
    headDir,
    side,
    anchorX: Math.round(signalAnchorX({ footX: s.footX, headDir }) * 100) / 100,
    elements,
    ...(label && { label }),
  }
}

/** "25" with a SH25(A-C) shunt -> "SH25(A-C) 25" (east) / "25 SH25(A-C)" (west); calling-on adds "C25". */
function conventionalCode(s: Signal, east: boolean): string {
  const code = s.code.trim()
  // Already composite, or a code that is not a plain number (S8 OF GPT, S/C-19, SH12 ...).
  if (/\s/.test(code) || !/^\d/.test(code)) return s.code
  const shunt = s.elements.find((e): e is Extract<SignalElement, { kind: 'shunt' }> => e.kind === 'shunt')
  const hasMain = s.elements.some((e) => e.kind === 'lamp')
  const companion = shunt?.text && hasMain ? shunt.text : s.elements.some((e) => e.kind === 'callingOn') ? `C${code}` : null
  if (!companion) return s.code
  return east ? `${companion} ${code}` : `${code} ${companion}`
}

/**
 * Direction arrows where lines enter the drawing (at every boundary end), as on ryd-cyd.json.
 * A line worked only by UP (east-facing) signals gets ">", only DN gets "<", otherwise "<>".
 * Existing arrows are kept; an arrow is only added where the line has none near that end.
 */
export function addBoundaryArrows(station: Station, inset = 120): { station: Station; added: LineArrow[] } {
  const nodes = new Map(station.nodes.map((n) => [n.id, n]))
  const arrows = [...station.assets.lineArrows]
  const added: LineArrow[] = []
  let seq = arrows.length
  for (const t of station.tracks) {
    const pts = t.nodeIds.flatMap((id) => nodes.get(id) ?? [])
    if (pts.length < 2) continue
    const xs = pts.map((p) => p.x)
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    const heads = new Set(station.assets.signals.filter((s) => s.trackId === t.id).map((s) => s.headDir))
    const direction: LineArrowDirection = heads.size === 1 ? (heads.has('east') ? 'right' : 'left') : 'both'
    for (const end of [pts[0]!, pts[pts.length - 1]!]) {
      if (end.kind !== 'boundary') continue
      const step = Math.min(inset, (hi - lo) / 4)
      const x = Math.round((end.x === lo ? lo + step : hi - step) * 100) / 100
      if (arrows.some((a) => a.trackId === t.id && Math.abs(a.x - x) < inset * 1.5)) continue
      let id: string
      do id = `ARW_${String(++seq).padStart(2, '0')}`
      while (arrows.some((a) => a.id === id))
      const arrow = { id, trackId: t.id, x, direction }
      arrows.push(arrow)
      added.push(arrow)
    }
  }
  return { station: { ...station, assets: { ...station.assets, lineArrows: arrows } }, added }
}
