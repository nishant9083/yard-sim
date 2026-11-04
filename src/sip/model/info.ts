export interface TitleRow {
  label: string
  value: string
}

export interface LineSummary {
  track: string
  lineNo: number
  name: string
  csl: string
  cslM: number
}

export interface LegendEntry {
  id: string
  title: string
  text: string
  /** true when the SIP itself prints this legend entry. */
  printed: boolean
}

export interface NoteEntry {
  no: string
  text: string
}

export interface InfoTable {
  id: string
  title: string
  columns: string[]
  rows: string[][]
}

export interface Procedure {
  id: string
  title: string
  location: string
  steps: string[]
}

export interface AspectChart {
  direction: 'UP' | 'DN'
  title: string
  signals: { name: string; code: string }[]
  /** Distance between neighbouring signals as printed. */
  gaps: string[]
  rows: string[][]
}

export interface Revision {
  ver: string
  text: string
  supersedes: string
  reference: string
}

export interface StationInfo {
  titleBlock: TitleRow[]
  lines: LineSummary[]
  legend: LegendEntry[]
  notes: NoteEntry[]
  tables: InfoTable[]
  procedures: Procedure[]
  aspectCharts: AspectChart[]
  revisions: Revision[]
}

export const emptyInfo = (): StationInfo => ({
  titleBlock: [],
  lines: [],
  legend: [],
  notes: [],
  tables: [],
  procedures: [],
  aspectCharts: [],
  revisions: [],
})
