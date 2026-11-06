import { emptyAssets, emptyInfo, loadStation, type Station } from '@/sip/model'
import { linesTable } from './autogen'

const KEY = 'sip-viewer:drafts'

export interface NewStationInput {
  code: string
  name: string
  zone?: string
  sipRef?: string
  west?: string
  east?: string
}

/** An empty station with the standard SIP scale (1:1000 horizontal, 1:500 vertical). */
export function blankStation({ code, name, zone = '', sipRef = '', west = 'WEST END', east = 'EAST END' }: NewStationInput): Station {
  return {
    meta: {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      zone,
      sipRef,
      coordinateSpace: 'drawing-pt: 1 unit = 1 PDF point; y grows downward',
      ends: { west, east },
      chainage: { originX: 1200, metresPerUnit: 0.35278, label: 'F/CSB', origin: 'Centre line of station building' },
      scale: { horizontal: '1:1000', vertical: '1:500' },
      viewHints: { yExaggeration: 1 },
    },
    nodes: [],
    tracks: [],
    connections: [],
    assets: emptyAssets(),
    info: emptyInfo(),
  }
}

/** Deep copy so edits never touch the bundled station. */
export const cloneStation = (s: Station): Station => structuredClone(s)

// --- browser storage -------------------------------------------------------------------------

export function loadDrafts(): Record<string, Station> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    const out: Record<string, Station> = {}
    for (const [code, value] of Object.entries(raw)) {
      try {
        out[code] = loadStation(value).station
      } catch {
        // skip a corrupt draft rather than losing the others
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeDrafts(drafts: Record<string, Station>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts))
    return true
  } catch {
    return false
  }
}

export function saveDraft(station: Station): boolean {
  return writeDrafts({ ...loadDrafts(), [station.meta.code]: station })
}

export function deleteDraft(code: string): void {
  const { [code]: _gone, ...rest } = loadDrafts()
  writeDrafts(rest)
}

// --- files -----------------------------------------------------------------------------------

/** Station as written to disk: ready to drop into src/sip/data. Fills the line table if it is empty. */
export function exportable(station: Station): Station {
  return { ...station, info: { ...station.info, lines: station.info.lines.length ? station.info.lines : linesTable(station) } }
}

export function downloadStation(station: Station): void {
  const blob = new Blob([JSON.stringify(exportable(station), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${station.meta.code.toLowerCase() || 'station'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseStationFile(text: string): Station {
  return loadStation(JSON.parse(text)).station
}
