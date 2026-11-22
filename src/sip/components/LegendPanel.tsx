import type { ReactNode } from 'react'
import { otherEnd, upEnd, type Station, type YardEnd } from '@/sip/model'
import { GLYPHS } from './LegendGlyphs'

interface Entry {
  glyph: keyof typeof GLYPHS
  title: string
  text: string
}

const SIGNAL_SYMBOLS: Entry[] = [
  { glyph: 'post', title: 'Signal post', text: 'Arrow on the line, wire to the head. Lamps are listed from the wire outward, as printed.' },
  { glyph: 'lamps', title: 'Lamps', text: 'Circle with a slash, vertical bar, horizontal bar, or filled. The SIP does not state the colour of each; read it from the aspect chart.' },
  { glyph: 'markers', title: 'P, C, B markers', text: 'Marker plates printed beside heads, as on the SIP (typically P on distants, C with a calling-on lamp).' },
  { glyph: 'callingOn', title: 'Calling-on lamp', text: 'Capsule with a slash, usually on home signals.' },
  { glyph: 'routeIndicator', title: 'Route indicator', text: 'Arms from a pivot at the end of the head, one per route: left and right stand across the head (|), upper left and upper right are the diagonals (<). Any combination; drawn |<| facing east and |>| facing west.' },
  { glyph: 'shunt', title: 'Shunt signal', text: 'Quarter disc with three holes, standalone or as the shunt part of a main signal.' },
]

const FIELD_SYMBOLS: Entry[] = [
  { glyph: 'slBoard', title: 'SL board (printed)', text: '"ENTERING INTO SINGLE LINE TERRITORY". Shown at the home signal where it is printed.' },
  { glyph: 'dlBoard', title: 'DL board (printed)', text: '"ENTERING INTO DOUBLE LINE TERRITORY". Shown at the home signal where it is printed.' },
  { glyph: 'locoPilot', title: 'Loco pilot board (printed)', text: '"LOCO PILOT-DRAW AHEAD RIGHT UPTO THE FOOT OF THE SIGNAL IF FOUND AT ON." Drawn as a box with the ※ sign outside the home signal.' },
  { glyph: 'lvv', title: 'HASSDAC / LVV (printed)', text: 'Last vehicle check: dot pairs either side of the rail. HASSDAC is in the printed legend; LVV marks the same device at the block ends.' },
  { glyph: 'detector', title: 'Box with circle', text: 'Detection point on the approach. Not every SIP legend defines this symbol.' },
  { glyph: 'goomty', title: 'S&T goomty', text: 'Box on a post beside the line.' },
]

const TRACK_SYMBOLS: Entry[] = [
  { glyph: 'circuit', title: 'Track circuit', text: 'Coloured band with the printed code. Limits are read from the joints.' },
  { glyph: 'axle', title: 'Axle counter section', text: 'Block-section axle counters, usually at the ends of the yard.' },
  { glyph: 'joint', title: 'Insulated joint', text: 'Cross-bar on the rail.' },
  { glyph: 'point', title: 'Point', text: 'Ring at the toe with its number and ratio (inferred from the notes when not printed). CS curved switch, SS straight switch, TWS thick web switch.' },
  { glyph: 'platform', title: 'Platform', text: 'Outline with its printed length and width.' },
  { glyph: 'fob', title: 'Foot over bridge', text: 'FOB across the lines, linking the platforms, with its printed chainage and width.' },
  { glyph: 'building', title: 'Buildings', text: 'Existing and new station building, S.M. room (hatched).' },
  { glyph: 'bridge', title: 'Bridge / culvert', text: 'Dashed pair across the lines, with BR number and span in the strip above.' },
]

function dimSymbols(station: Station): Entry[] {
  const { scale, chainage } = station.meta
  const scaleText = scale ? ` Horizontal ${scale.horizontal}; vertical ${scale.vertical} (vertical gaps between lines are not to scale).` : ''
  return [
    { glyph: 'dimension', title: 'Dimension', text: `Printed length with arrows.${scaleText}` },
    {
      glyph: 'chainage',
      title: 'Chainage mark',
      text: `PT, FM, DS, DE and PF END with the printed chainage${chainage ? ` (${chainage.label})` : ''}, measured from the station centre line.`,
    },
    {
      glyph: 'csb',
      title: 'Station centre line',
      text: chainage ? `CH 0.00 M. ${chainage.origin ?? ''}`.trim() : 'No chainage calibration for this station.',
    },
    { glyph: 'gradient', title: 'Gradient post', text: 'Gradient on each side of the post, as 1 in N.' },
  ]
}

const COMPASS: Record<YardEnd, string> = { west: 'west (left)', east: 'east (right)' }

function directionText(station: Station): string {
  const { ends } = station.meta
  const up = upEnd(station)
  const parts: string[] = []
  if (up) {
    const dn = otherEnd(up)
    parts.push(
      `UP runs ${COMPASS[dn]} to ${COMPASS[up]}, toward ${ends[up]}.`,
      `DN runs ${COMPASS[up]} to ${COMPASS[dn]}, toward ${ends[dn]}.`,
    )
  } else {
    parts.push(`West (left) end: ${ends.west}. East (right) end: ${ends.east}. UP / DN direction is not shown by any signal on this plan.`)
  }
  const lines = [...station.info.lines].sort((a, b) => a.lineNo - b.lineNo)
  if (lines.length > 0) parts.push(lines.map((l) => `Line ${l.lineNo}: ${l.name}.`).join(' '))
  return parts.join(' ')
}

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">{title}</h3>
      <ul className="space-y-2.5">
        {entries.map((e) => (
          <li key={e.title} className="flex items-center gap-3">
            {GLYPHS[e.glyph] as ReactNode}
            <div className="min-w-0">
              <p className="text-xs font-medium text-on-surface">{e.title}</p>
              <p className="text-[11px] leading-snug text-on-surface-variant">{e.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LegendPanel({ station }: { station: Station }) {
  const printed = station.info.legend
  return (
    <div className="space-y-5 p-4">
      {printed.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">Legend printed on the SIP</h3>
          <dl className="space-y-1.5 text-xs">
            {printed.map((e) => (
              <div key={e.id}>
                <dt className="font-medium text-on-surface">{e.title}</dt>
                <dd className="text-on-surface-variant">{e.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <Section title="Signals" entries={SIGNAL_SYMBOLS} />
      <Section title="Field equipment" entries={FIELD_SYMBOLS} />
      <Section title="Line equipment" entries={TRACK_SYMBOLS} />
      <Section title="Lengths and chainage" entries={dimSymbols(station)} />
      <section>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">Direction</h3>
        <p className="text-xs text-on-surface-variant">{directionText(station)}</p>
      </section>
    </div>
  )
}
