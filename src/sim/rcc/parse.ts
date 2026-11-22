import type {
  BlockRequirement,
  HandleChartRow,
  Issue,
  PointChartRow,
  PointPos,
  PointReq,
  Protection,
  RawRcc,
  RawRccRow,
  RccOverlap,
  RccRoute,
  RccTable,
  RouteKind,
} from './types'

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()

/* ----------------------------- small token readers ----------------------------- */

export function parsePoints(text: string): PointReq[] {
  const out: PointReq[] = []
  for (const m of text.matchAll(/(\d+)\s*([NR])\b/g)) out.push({ unit: m[1]!, pos: m[2] as PointPos })
  return out
}

/** "L4 T1/T2/T3" -> L4T1, L4T2, L4T3. Also accepts plain codes. */
export function parseTcList(text: string): { tcs: string[]; anyOf: boolean } {
  const withoutNotes = text.replace(/\([^)]*\)/g, ' ')
  const anyOf = /\bOR\b/.test(withoutNotes)
  const found: { at: number; tc: string }[] = []
  const rest = withoutNotes.replace(/\bL(\d+)\s*T(\d+)((?:\s*\/\s*T?\d+)*)/g, (all: string, line: string, first: string, more: string, at: number) => {
    found.push({ at, tc: `L${line}T${first}` })
    for (const m of more.matchAll(/(\d+)/g)) found.push({ at, tc: `L${line}T${m[1]}` })
    return ' '.repeat(all.length)
  })
  for (const m of rest.matchAll(/[A-Z0-9][A-Z0-9/-]*/g)) {
    const code = m[0].replace(/-+$/, '')
    if (code === 'OR') continue
    found.push({ at: m.index ?? 0, tc: code })
  }
  found.sort((x, y) => x.at - y.at)
  const tcs = found.map((f) => f.tc)
  return { tcs, anyOf }
}

export function parseOverlapIds(text: string): string[] {
  return [...text.matchAll(/OV\d?_\d+/g)].map((m) => m[0])
}

export function parseControls(text: string): string[] {
  const out: string[] = []
  // "CH1IN", "CH 1 IN" and the bare "CH1" some charts use; "CONT.37 IN" for siding controls.
  for (const m of text.matchAll(/\bCH\s*(\d+)(?!\d)/g)) out.push(`CH${m[1]}`)
  for (const m of text.matchAll(/\bCONT\.?\s*(\d+)(?!\d)/g)) out.push(`CONT.${m[1]}`)
  return [...new Set(out)]
}

const variantKey = (v: string): string => (v === 'M/L' ? 'ML' : v)

/**
 * Route names, the common grammar. Charts differ in punctuation ("C-1A", "C1A", "S-1", "S1") but not in shape:
 *   [C|SH|S][number][letters]   or   SLOT[number]
 * C = calling-on, SH = shunt, S or nothing = main (letters) or starter (no letters), SLOT = a slot / interslotting row.
 */
export interface NameParts {
  prefix: 'C' | 'SH' | 'S' | 'SLOT'
  num: string
  letters: string
}

const NAME_RX = /^(?:(C)-?|(SH)|(S)-?)?(\d+)([A-Z]{1,2})?$/
const SLOT_RX = /^SL(?:OT)?\s*-?\s*(\d+)$/

export function parseRouteName(raw: string): NameParts | null {
  const t = raw.trim().replace(/\s+/g, '').toUpperCase()
  const sl = SLOT_RX.exec(t)
  if (sl) return { prefix: 'SLOT', num: sl[1]!, letters: '' }
  const m = NAME_RX.exec(t)
  if (!m) return null
  return { prefix: m[1] ? 'C' : m[2] ? 'SH' : 'S', num: m[4]!, letters: m[5] ?? '' }
}

/** Canonical route name: "1A", "C1A", "SH4C", "42A", "10", "SLOT-71". */
export function routeNameOf(p: NameParts): string {
  if (p.prefix === 'SLOT') return `SLOT-${p.num}`
  return `${p.prefix === 'S' ? '' : p.prefix}${p.num}${p.letters}`
}

/** Expand one route token to route names: "C-1A/B/C" -> C1A C1B C1C, "SH4C/D" -> SH4C SH4D, "42A/B" -> 42A 42B, "17" -> 17, "SL71" -> SLOT-71. */
export function expandRouteName(token: string): string[] {
  const t = token.trim().replace(/\s+/g, '').toUpperCase()
  const sl = SLOT_RX.exec(t)
  if (sl) return [`SLOT-${sl[1]}`]
  const m = /^(?:(C)-?|(SH)|(S)-?)?(\d+)((?:[A-Z]{1,2})(?:\/[A-Z]{1,2})*)?$/.exec(t)
  if (!m) return []
  const prefix = m[1] ? 'C' : m[2] ? 'SH' : ''
  const num = m[4]!
  if (!m[5]) return [`${prefix}${num}`]
  return m[5].split('/').map((l) => `${prefix}${num}${l}`)
}

export interface RouteToken {
  /** Route name, e.g. "1A". */
  name: string
  /** Set when the chart wrote "(1A SET TO M/L)": only that variant. */
  variant: string | null
  raw: string
}

/** Read a lock list ("(1A SET TO M/L). 1B/C. C-1A/B/C. SH4C/D. 11. 42A SH42A SLOT-71") into route tokens. Unknown text is returned in `unknown`. */
export function parseRouteTokens(text: string): { tokens: RouteToken[]; unknown: string[] } {
  const tokens: RouteToken[] = []
  const unknown: string[] = []
  const rx = /\(?\s*(\d+[A-Z])\s+SET\s+TO\s+(ORL|M\/L|SH)\s*\)?|SLOT\s*-?\s*\d+|SL\d+|C-?\d+[A-Z]+(?:\/[A-Z]+)*|SH\d+(?:[A-Z]+(?:\/[A-Z]+)*)?|\d+[A-Z]*(?:\/[A-Z]+)*|[A-Za-z][\w/-]*/g
  for (const m of text.matchAll(rx)) {
    if (m[1]) {
      tokens.push({ name: m[1], variant: variantKey(m[2]!), raw: m[0] })
      continue
    }
    const names = expandRouteName(m[0])
    if (names.length === 0) unknown.push(m[0])
    for (const name of names) tokens.push({ name, variant: null, raw: m[0] })
  }
  return { tokens, unknown }
}

/* ------------------------------------ route row ------------------------------------ */

function routeIdOf(name: string, variant: string | null): string {
  return variant ? `${name}.${variant}` : name
}

function readRouteCell(cell: string): { name: string; variant: string | null; overlapId: string | null } {
  const text = clean(cell)
  const overlapId = parseOverlapIds(text)[0] ?? null
  const withoutOverlap = clean(text.replace(/OV\d?_\d+/g, ''))
  const m = /^(.+?)(?:\s+SET TO\s+(ORL|M\/L|SH))?$/.exec(withoutOverlap)
  const rawName = (m?.[1] ?? withoutOverlap).replace(/[,;]+$/, '')
  const variant = m?.[2] ? variantKey(m[2]) : null
  // "S17" is the starter route of signal 17, "SL71" a slot row; other chart rows call them "17" and "SLOT-71".
  const parts = parseRouteName(rawName)
  return { name: parts ? routeNameOf(parts) : rawName, variant, overlapId }
}

function signalOfName(name: string): { signal: string; post: string; kind: RouteKind } | null {
  const p = parseRouteName(name)
  if (!p) return null
  switch (p.prefix) {
    case 'C':
      return { signal: `C${p.num}`, post: p.num, kind: 'callingOn' }
    case 'SH':
      return { signal: `SH${p.num}`, post: p.num, kind: 'shunt' }
    case 'SLOT':
      return { signal: `SLOT-${p.num}`, post: `SLOT-${p.num}`, kind: 'slot' }
    default:
      return { signal: `S${p.num}`, post: p.num, kind: p.letters ? 'main' : 'starter' }
  }
}

/**
 * Destination text to the post it names. "S11", "SS19", "SH9", "S-25" give the number; a signal of another cabin
 * ("S6 OF 'F' CABIN", "SH18 OF 'E' CABIN", "S15 OF VPT R&D YARD") gives "<number>@<first word of the place>", e.g. "6@F".
 * Anything else (dead end, siding, block section home) is an external stop point: null.
 */
export function destinationPostOf(text: string): string | null {
  const t = clean(text).toUpperCase().replace(/["'`]/g, '')
  const m = /^(?:SS|SH|S)\s*-?\s*(\d+)(?:\s+OF\s+([A-Z0-9&]+))?(?:\s|$)/.exec(t)
  if (!m) return null
  return m[2] ? `${m[1]}@${m[2]}` : m[1]!
}

function readVdu(cell: string): RccRoute['vdu'] {
  const text = clean(cell)
  const m = /^(\S+-\S+(?: SET TO (?:ORL|M\/L|SH))?|S\d+ CLEAR)\s*(.*)$/.exec(text)
  const command = m?.[1] ?? text
  const indication = m?.[2] ?? ''
  const aspectClass = /\bUN1\b/.test(indication) ? 'UN1' : /\bUN\b/.test(indication) ? 'UN' : null
  const ind = /\bL-(\d)\b/.exec(indication) ?? /\b(\d+A)\b/.exec(indication)
  const indicator = ind ? (ind[0].startsWith('L-') ? ind[0] : ind[1]!) : /\bTMS\b/.test(indication) ? 'TMS' : null
  return { command, indication, aspectClass, indicator }
}

/** Remarks come as "1.… 2.…" lists (JRT) or as bullets joined by ".. " (OEC); both are split into items. */
function splitRemarks(text: string): string[] {
  return clean(text)
    .split(/(?:^|\s)\d\s*\.\s*(?=[A-Z])|\.\.\s+/)
    .map(clean)
    .filter(Boolean)
}

/** Posts a clause names: "S1 & SS19", "SH9", "S6 OF 'F' CABIN" -> ["1", "19"], ["9"], ["6@F"]. */
function postsIn(clause: string): string[] {
  const out: string[] = []
  for (const m of clause.toUpperCase().matchAll(/\b(?:SS|SH|S)\s*-?\s*(\d+)(?:\s+OF\s+'?([A-Z0-9&]+))?/g)) out.push(m[2] ? `${m[1]}@${m[2]}` : m[1]!)
  return out
}

function readRemarks(text: string): {
  items: string[]
  protections: Protection[]
  flyBack: { tc: string | null; seconds: number } | null
  clearAfter: { tc: string; seconds: number } | null
  delay: number
  block: BlockRequirement[]
} {
  const items = splitRemarks(text)
  const protections: Protection[] = []
  let flyBack: { tc: string | null; seconds: number } | null = null
  let clearAfter: { tc: string; seconds: number } | null = null
  let delay = 0
  const block: BlockRequirement[] = []
  for (const item of items) {
    // Charts break lines with a full stop: "AFTER. 3 SEC ON OCCUPATION OF. REPLACEMENT TRACK."
    const flat = item.replace(/\.\s+/g, ' ')
    if (/PROTECTION/.test(item)) {
      let pending: string[] = []
      for (const m of item.matchAll(/\bSH?(\d+)\b|RED LAMP|NO LIGHT/g)) {
        if (m[1]) pending.push(m[1])
        else {
          for (const post of pending) protections.push({ post, kind: m[0] === 'RED LAMP' ? 'red' : 'noLight' })
          pending = []
        }
      }
    }
    // "SS19 IS RED", "S1 & SS19 ARE RED": the destination must show red. "SH9 IS LIT": its lamp must be proved lit.
    const state = /^(.*?)\b(?:IS|ARE)\s+(RED|LIT)\b/.exec(flat)
    if (state && !/PROTECTION/.test(item)) {
      for (const post of postsIn(state[1]!)) protections.push({ post, kind: state[2] === 'RED' ? 'red' : 'noLight' })
    }
    const fly = /FLY BACK (?:TO ON )?AFTER (\d+) SEC\w* ON OCCUPATION OF ([A-Z0-9/-]+)(?: TRACK)?/.exec(flat)
    if (fly) flyBack = { tc: fly[2] === 'REPLACEMENT' ? null : fly[2]!, seconds: Number(fly[1]) }
    const clear = /CLEARS AFTER (\d+) (SECONDS?|MINUTES?) ON OCCUPATION OF ([A-Z0-9/-]+)/.exec(flat)
    if (clear) clearAfter = { tc: clear[3]!, seconds: Number(clear[1]) * (clear[2]!.startsWith('M') ? 60 : 1) }
    if (/TWO MIN/.test(item)) delay = 120
    const rel = /RELEASES? AFTER (\d+) SEC\w* ON CLEARANCE/.exec(flat)
    if (rel) delay = Number(rel[1])
    const req = /REQUIRES (TGT|LC) (?:CONTACT )?OF (TLBI|DLBI) FOR SEC:?\s*\(?\s*([A-Z]+-[A-Z]+)\s*\)?/.exec(item)
    if (req) block.push({ contact: req[1]!, instrument: req[2]!, section: req[3]! })
  }
  return { items, protections, flyBack, clearAfter, delay, block }
}

/* ------------------------------------ whole table ------------------------------------ */

export function parseRcc(raw: RawRcc): RccTable {
  const issues: Issue[] = []
  const warn = (code: string, message: string, where?: string) => issues.push({ level: 'warn', code, message, where })
  const info = (code: string, message: string, where?: string) => issues.push({ level: 'info', code, message, where })

  const routes: RccRoute[] = []
  for (const row of raw.routes) routes.push(readRow(row, warn, info))

  const byId = new Map<string, RccRoute>()
  for (const r of routes) {
    if (byId.has(r.id)) issues.push({ level: 'error', code: 'duplicate-route', message: `Route id ${r.id} appears twice`, where: `row ${r.sl}` })
    byId.set(r.id, r)
  }

  // Lock lists are resolved against the full set of routes, so this needs a second pass.
  const idsByName = new Map<string, string[]>()
  for (const r of routes) idsByName.set(r.name, [...(idsByName.get(r.name) ?? []), r.id])
  raw.routes.forEach((row, i) => {
    const route = routes[i]!
    const { tokens, unknown } = parseRouteTokens(row.locksRoutes)
    const ids = new Set<string>()
    for (const t of tokens) {
      const candidates = idsByName.get(t.name)
      if (!candidates) {
        warn('unknown-lock-route', `Lock list names route "${t.name}" which has no row`, `row ${route.sl} (${route.id})`)
        continue
      }
      if (t.variant) {
        const id = routeIdOf(t.name, t.variant)
        if (byId.has(id)) ids.add(id)
        else warn('unknown-lock-variant', `Lock list names ${t.name} SET TO ${t.variant} which has no row`, `row ${route.sl} (${route.id})`)
      } else {
        for (const id of candidates) ids.add(id)
      }
    }
    for (const u of unknown) warn('unreadable-lock-token', `Cannot read "${u}" in the route lock list`, `row ${route.sl} (${route.id})`)
    ids.delete(route.id)
    route.locks.routes = [...ids]
  })

  const overlaps: RccOverlap[] = []
  for (const r of routes) {
    if (!r.overlapId) continue
    overlaps.push({ id: r.overlapId, routeId: r.id, points: r.points.overlap, isolation: r.points.isolation, tcs: r.tcs.overlap, release: r.overlapRelease })
  }
  const overlapById = new Map<string, RccOverlap>()
  for (const o of overlaps) {
    if (overlapById.has(o.id)) issues.push({ level: 'error', code: 'duplicate-overlap', message: `Overlap ${o.id} is declared by two rows`, where: o.routeId })
    overlapById.set(o.id, o)
  }
  for (const r of routes) {
    for (const id of r.locks.overlaps) {
      if (!overlapById.has(id)) warn('unknown-lock-overlap', `Lock list names overlap ${id} which no row declares`, `row ${r.sl} (${r.id})`)
    }
  }

  const pointChart: PointChartRow[] = raw.pointChart.map((p) => ({
    unit: /^(\d+)/.exec(p.point)![1]!,
    label: p.point,
    crankHandle: clean(p.crankHandle),
    tcs: parseTcList(p.tcs).tcs,
    normal: { routes: chartRoutes(p.normalRoutes), overlaps: parseOverlapIds(p.normalOverlaps) },
    reverse: { routes: chartRoutes(p.reverseRoutes), overlaps: parseOverlapIds(p.reverseOverlaps) },
  }))
  const handleChart: HandleChartRow[] = raw.handleChart.map((h) => ({
    controls: [...h.control.matchAll(/CH\d+|CONT\.\d+/g)].map((m) => m[0]),
    routes: chartRoutes(h.routes),
    overlaps: parseOverlapIds(h.overlaps),
    units: [...h.points.matchAll(/(\d+)\s*[AB]?(?:\/[AB])?/g)].map((m) => m[1]!),
  }))

  return { station: raw.station, routes, overlaps, pointChart, handleChart, byId, overlapById, issues }
}

/** Chart route lists name routes without variants. */
function chartRoutes(text: string): string[] {
  return [...new Set(parseRouteTokens(text).tokens.map((t) => t.name))]
}

function readRow(row: RawRccRow, warn: (c: string, m: string, w?: string) => void, info: (c: string, m: string, w?: string) => void): RccRoute {
  const { name, variant, overlapId } = readRouteCell(row.route)
  const id = routeIdOf(name, variant)
  const where = `row ${row.sl} (${id})`
  const sig = signalOfName(name)
  if (!sig) warn('unknown-route-name', `Cannot tell which signal route "${name}" belongs to`, where)
  const chartSig = clean(row.sig).replace(/^S-(\d)/, 'S$1')
  if (sig && /^(S|C|SH)\d+$/.test(chartSig) && chartSig !== sig.signal) warn('signal-mismatch', `Column 2 says ${chartSig} but the route name implies ${sig.signal}`, where)
  if (sig && !/^(S|C|SH)\d+$/.test(chartSig)) info('signal-unreadable', `Column 2 reads "${row.sig}"; using ${sig.signal} from the route name`, where)

  const routeTcs = parseTcList(row.tcRoute)
  const overlapTcs = parseTcList(row.tcOverlap)
  const rem = readRemarks(row.remarks)
  const destText = clean(row.dest)

  const points = { route: parsePoints(row.ptsRoute), overlap: parsePoints(row.ptsOverlap), isolation: parsePoints(row.isolation) }
  const back = parseTcList(row.backLock).tcs
  const kind: RouteKind = sig?.kind === 'starter' && points.route.length === 0 && back.length === 0 ? 'block' : (sig?.kind ?? 'main')
  const occ = parseTcList(row.ovOccupied).tcs

  return {
    id,
    sl: row.sl,
    name,
    variant,
    overlapId,
    signal: sig?.signal ?? chartSig,
    post: sig?.post ?? '',
    kind,
    destination: destText,
    destinationPost: destinationPostOf(destText),
    vdu: readVdu(row.vdu),
    points,
    tcs: { route: routeTcs.tcs, routeAnyOf: routeTcs.anyOf, overlap: overlapTcs.tcs },
    controls: parseControls(row.controls),
    deadApproach: /DEAD/.test(row.approach),
    backLock: back,
    overlapRelease: { cleared: parseTcList(row.ovCleared).tcs[0] ?? null, occupiedAnyOf: occ },
    locks: { routes: [], overlaps: parseOverlapIds(row.locksOverlaps) },
    remarks: rem.items,
    protections: rem.protections,
    flyBack: rem.flyBack ?? { tc: routeTcs.tcs[0] ?? null, seconds: 0 },
    clearAfter: rem.clearAfter,
    releaseDelaySeconds: rem.delay,
    block: rem.block,
  }
}
