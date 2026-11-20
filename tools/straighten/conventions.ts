/**
 * Apply the signal conventions (odd = east/above, even = west/below, composite codes) and boundary arrows
 * to a station JSON in place.
 *
 *   npm run sip:conventions -- src/sip/data/rydd.straight.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { loadStation } from '@/sip/model'
import { addBoundaryArrows, applySignalConventions } from '@/sip/edit/signalConventions'

const file = process.argv.slice(2).find((a) => a !== '--')
if (!file) {
  console.error('usage: sip:conventions <station.json>')
  process.exit(1)
}
const raw = JSON.parse(readFileSync(file, 'utf8'))
const { station } = loadStation(raw)
const sig = applySignalConventions(station)
const arw = addBoundaryArrows(sig.station)
// Write back onto the raw JSON so nothing else in the file changes.
raw.assets.signals = arw.station.assets.signals
raw.assets.lineArrows = arw.station.assets.lineArrows
writeFileSync(file, JSON.stringify(raw, null, 2) + '\n')

console.log(`signals changed: ${sig.changed.length}`)
for (const c of sig.changed) console.log(`  ${c}`)
console.log(`arrows added: ${arw.added.length}`)
for (const a of arw.added) console.log(`  ${a.id} ${a.trackId} x=${a.x} ${a.direction}`)
const errors = loadStation(raw).issues.filter((i) => i.level === 'error')
console.log(`validation errors: ${errors.length}`)
