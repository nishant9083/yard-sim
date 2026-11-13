import type { ReactNode } from 'react'
import type { Station } from '@/sip/model'
import { GLYPHS } from './LegendGlyphs'

interface Entry {
  glyph: keyof typeof GLYPHS
  title: string
  text: string
}

const SIGNAL_SYMBOLS: Entry[] = [
  { glyph: 'post', title: 'Signal post', text: 'Arrow on the line, wire to the head. Lamps are listed from the wire outward, as printed.' },
  { glyph: 'lamps', title: 'Lamps', text: 'Circle with a slash, vertical bar, horizontal bar, or filled. The SIP does not state the colour of each; read it from the aspect chart.' },
  { glyph: 'markers', title: 'P, C, B markers', text: 'Marker plates printed beside heads. P is on distants, C on home signals (with the calling-on lamp), B on signal 26.' },
  { glyph: 'callingOn', title: 'Calling-on lamp', text: 'Capsule with a slash, on home signals 1A/B/C and 2A/B.' },
  { glyph: 'routeIndicator', title: 'Route indicator', text: 'Arms from a pivot at the end of the head, one per route: left and right stand across the head (|), upper left and upper right are the diagonals (<). Any combination; drawn |<| facing east and |>| facing west.' },
  { glyph: 'shunt', title: 'Shunt signal', text: 'Quarter disc with three holes: SH3A/B, SH4(A-D), SH6, and the shunt parts of S/SH15 and S/SH17.' },
]

const FIELD_SYMBOLS: Entry[] = [
  { glyph: 'slBoard', title: 'SL board (printed)', text: '"ENTERING INTO SINGLE LINE TERRITORY". Shown above the UP home.' },
  { glyph: 'dlBoard', title: 'DL board (printed)', text: '"ENTERING INTO DOUBLE LINE TERRITORY". Shown at the DN home.' },
  { glyph: 'locoPilot', title: 'Loco pilot board (printed)', text: '"LOCO PILOT-DRAW AHEAD RIGHT UPTO THE FOOT OF THE SIGNAL IF FOUND AT ON." Drawn as a box with the ※ sign, 30 M outside each home.' },
  { glyph: 'lvv', title: 'HASSDAC / LVV (printed)', text: 'Last vehicle check: dot pairs either side of the rail. HASSDAC is in the printed legend; LVV marks the same device at the block ends.' },
  { glyph: 'detector', title: 'Box with circle', text: 'Detection point 1.4 km out on each approach. The SIP legend does not define this symbol.' },
  { glyph: 'goomty', title: 'S&T goomty', text: 'Box on a post beside the line.' },
]

const TRACK_SYMBOLS: Entry[] = [
  { glyph: 'circuit', title: 'Track circuit', text: 'Coloured band with the code (1AT, 31/33T, L2T1 ...). Limits are read from the joints.' },
  { glyph: 'axle', title: 'Axle counter section', text: 'URXT, DDXT and BAXT: block-section counters at both ends of the yard.' },
  { glyph: 'joint', title: 'Insulated joint', text: 'Cross-bar on the rail.' },
  { glyph: 'point', title: 'Point', text: 'Ring at the toe with its number. All points 1 in 12 (TWS) unless a ratio is printed (note 4). CS curved switch, SS straight switch.' },
  { glyph: 'platform', title: 'Platform', text: 'Outline with its printed length and width.' },
  { glyph: 'fob', title: 'Foot over bridge', text: 'FOB at CH:40M, 3 M wide, linking platforms 2 and 1.' },
  { glyph: 'building', title: 'Buildings', text: 'Existing and new station building, S.M. room (hatched).' },
  { glyph: 'bridge', title: 'Bridge / culvert', text: 'Dashed pair across the lines, with BR number and span in the strip above.' },
]

const DIM_SYMBOLS: Entry[] = [
  { glyph: 'dimension', title: 'Dimension', text: 'Printed length with arrows. Horizontal 1:1000; vertical dimensions between lines are not to scale (1:500).' },
  { glyph: 'chainage', title: 'Chainage mark', text: 'PT, FM, DS, DE and PF END with the chainage F/CSB. Chainages are from the station-building centre line (note 3).' },
  { glyph: 'csb', title: 'Station centre line', text: 'CH 0.00 M, KM 205.946 F/KTV.' },
  { glyph: 'gradient', title: 'Gradient post', text: 'Gradient on each side of the post, as 1 in N.' },
]

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
          <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">Legend printed on the SIP (note 15)</h3>
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
      <Section title="Lengths and chainage" entries={DIM_SYMBOLS} />
      <section>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">Direction</h3>
        <p className="text-xs text-on-surface-variant">
          UP runs west to east, toward KRDL (Kirandul, Maligura side). DN runs east to west, toward KTV (Kottavalasa, Manabar side). Line 4 is the UP loop, line 3 the UP main, line 2 the DN main, line 1 the common loop.
        </p>
      </section>
    </div>
  )
}
