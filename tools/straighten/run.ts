/**
 * Straighten a station JSON: every line on its own horizontal lane, turnouts as short diagonals, x (chainage) kept.
 *
 *   npm run sip:straighten -- src/sip/data/rydd.json [out.json] [--spacing 30] [--run 4]
 *
 * Writes `<name>.straight.json` next to the input by default; the viewer picks it up as station `<CODE>-S`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { loadStation } from '@/sip/model'
import { straightenStation } from '@/sip/edit/straighten'
import { addBoundaryArrows, applySignalConventions } from '@/sip/edit/signalConventions'

const args = process.argv.slice(2).filter((a) => a !== '--')
const flag = (name: string) => {
  const i = args.indexOf(name)
  if (i < 0) return undefined
  const v = Number(args[i + 1])
  args.splice(i, 2)
  return v
}
const laneSpacing = flag('--spacing')
const turnoutRun = flag('--run')
const [input, output] = args
if (!input) {
  console.error('usage: sip:straighten <station.json> [out.json] [--spacing N] [--run N]')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(input, 'utf8'))
const { station, issues: before } = loadStation(raw)
const { station: straightRaw, report } = straightenStation(station, { laneSpacing, turnoutRun })
const straight = addBoundaryArrows(applySignalConventions(straightRaw).station).station
const { issues: after } = loadStation(straight)

const out = output ?? join(dirname(input), basename(input).replace(/\.json$/, '') + '.straight.json')
writeFileSync(out, JSON.stringify(straight, null, 2) + '\n')

const errs = (list: typeof after) => list.filter((i) => i.level === 'error').length
console.log(`wrote ${out}`)
console.log(`lines ${report.lines.length} on ${report.lanes} lanes, ${report.laneSpacing} pt apart`)
console.log(`nodes: ${report.nodesRemoved} shape vertices dropped, ${report.nodesAdded} bends added`)
console.log(`crossings (segments crossing away from a node): sheet ${report.crossingsBefore} -> straight ${report.crossingsAfter}`)
console.log(`validation errors: before ${errs(before)}, after ${errs(after)}`)
for (const i of after.filter((i) => i.level === 'error')) console.log(`  ${i.code}: ${i.message}`)
if (report.orderConflicts.length) {
  console.log(`order conflicts (lines whose up/down order flips on the sheet): ${report.orderConflicts.length}`)
  for (const c of report.orderConflicts) console.log(`  ${c.above} above ${c.below}: ${c.votes} samples, ${c.against} against`)
}
