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
  for (const m of rest.matchAll(/[A-Z0-9][A-Z0-9/]*/g)) {
    if (m[0] === 'OR') continue
    found.push({ at: m.index ?? 0, tc: m[0] })
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
  for (const m of text.matchAll(/CH\s*(\d+)\s*IN/g)) out.push(`CH${m[1]}`)
  for (const m of text.matchAll(/CONT\.\s*(\d+)\s*IN/g)) out.push(`CONT.${m[1]}`)
  return out
}

const variantKey = (v: string): string => (v === 'M/L' ? 'ML' : v)

/** Expand one route token to route names: "C-1A/B/C" -> C1A C1B C1C, "SH4C/D" -> SH4C SH4D, "17" -> 17. */
export function expandRouteName(token: string): string[] {
  const t = token.trim().replace(/\s+/g, '')
  let m = /^C-?(\d)([A-Z](?:\/[A-Z])*)$/.exec(t)
  if (m) return m[2]!.split('/').map((l) => `C${m![1]}${l}`)
  m = /^SH(\d+)([A-Z](?:\/[A-Z])*)?$/.exec(t)
  if (m) return m[2] ? m[2].split('/').map((l) => `SH${m![1]}${l}`) : [`SH${m[1]}`]
  m = /^(\d)([A-Z](?:\/[A-Z])*)$/.exec(t)
  if (m) return m[2]!.split('/').map((l) => `${m![1]}${l}`)
  m = /^S?(\d+)$/.exec(t)
  if (m) return [m[1]!]
  return []
}

export interface RouteToken {
  /** Route name, e.g. "1A". */
  name: string
  /** Set when the chart wrote "(1A SET TO M/L)": only that variant. */
  variant: string | null
  raw: string
}

/** Read a lock list ("(1A SET TO M/L). 1B/C. C-1A/B/C. SH4C/D. 11.") into route tokens. Unknown text is returned in `unknown`. */
export function parseRouteTokens(text: string): { tokens: RouteToken[]; unknown: string[] } {
  const tokens: RouteToken[] = []
  const unknown: string[] = []
  const rx = /\(?\s*(\d[A-Z])\s+SET\s+TO\s+(ORL|M\/L|SH)\s*\)?|C-?\d[A-Z](?:\/[A-Z])*|SH\d+(?:[A-Z](?:\/[A-Z])*)?|\d+[A-Z]?(?:\/[A-Z])*|[A-Za-z][\w/-]*/g
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
  const m = /^(\S+?)(?:\s+SET TO\s+(ORL|M\/L|SH))?$/.exec(withoutOverlap)
  const rawName = m?.[1] ?? withoutOverlap
  const variant = m?.[2] ? variantKey(m[2]) : null
  // "S17" is the starter route of signal 17; other chart rows call it "17".
  const name = /^S\d+$/.test(rawName) ? rawName.slice(1) : rawName
  return { name, variant, overlapId }
}

function signalOfName(name: string): { signal: string; post: string; kind: RouteKind } | null {
  let m = /^([12])[A-C]$/.exec(name)
  if (m) return { signal: `S${m[1]}`, post: m[1]!, kind: 'main' }
  m = /^C([12])[A-C]$/.exec(name)
  if (m) return { signal: `C${m[1]}`, post: m[1]!, kind: 'callingOn' }
  m = /^SH(\d+)[A-D]?$/.exec(name)
  if (m) return { signal: `SH${m[1]}`, post: m[1]!, kind: 'shunt' }
  m = /^(\d+)$/.exec(name)
  if (m) return { signal: `S${m[1]}`, post: m[1]!, kind: 'starter' }
  return null
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

function readRemarks(text: string): {
  items: string[]
  protections: Protection[]
  flyBack: { tc: string | null; seconds: number } | null
  clearAfter: { tc: string; seconds: number } | null
  delay: number
  block: BlockRequirement[]
} {
  const items = clean(text)
    .split(/(?:^|\s)\d\s*\.\s*(?=[A-Z])/)
    .map(clean)
    .filter(Boolean)
  const protections: Protection[] = []
  let flyBack: { tc: string | null; seconds: number } | null = null
  let clearAfter: { tc: string; seconds: number } | null = null
  let delay = 0
  const block: BlockRequirement[] = []
  for (const item of items) {
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
    const fly = /FLY BACK TO ON AFTER (\d+) SEC\.? ON OCCUPATION OF ([A-Z0-9/]+)/.exec(item)
    if (fly) flyBack = { tc: fly[2]!, seconds: Number(fly[1]) }
    const clear = /CLEARS AFTER (\d+) SECONDS? ON OCCUPATION OF ([A-Z0-9/]+)/.exec(item)
    if (clear) clearAfter = { tc: clear[2]!, seconds: Number(clear[1]) }
    if (/TWO MIN/.test(item)) delay = 120
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
  const destPostMatch = /^S-?(\d+)$/.exec(destText)

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
    destinationPost: destPostMatch ? destPostMatch[1]! : null,
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
