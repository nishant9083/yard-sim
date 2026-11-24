import { BookOpen, FileText, List, PanelRightClose, PanelRightOpen, Table2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { EntityRef, Station } from '@/sip/model'
import { AssetsPanel } from './AssetsPanel'
import { LegendPanel } from './LegendPanel'
import { NotesPanel } from './NotesPanel'
import { TablesPanel } from './TablesPanel'
import { btnIcon, tabClass } from './ui'

type TabId = 'assets' | 'legend' | 'tables' | 'notes'

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'assets', label: 'Assets', icon: List },
  { id: 'legend', label: 'Legend', icon: BookOpen },
  { id: 'tables', label: 'Tables', icon: Table2 },
  { id: 'notes', label: 'Notes', icon: FileText },
]

interface SidePanelProps {
  station: Station
  selected: EntityRef | null
  onSelect: (ref: EntityRef) => void
  open: boolean
  onToggle: () => void
}

export function SidePanel({ station, selected, onSelect, open, onToggle }: SidePanelProps) {
  const [tab, setTab] = useState<TabId>('assets')
  if (!open) {
    return (
      <aside aria-label="Station information" className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-l border-outline-variant bg-surface-container py-1.5">
        <button type="button" onClick={onToggle} aria-label="Expand side panel" title="Expand side panel" className={btnIcon}>
          <PanelRightOpen className="size-4" aria-hidden />
        </button>
        <span className="my-1 h-px w-6 bg-outline-variant" aria-hidden />
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id)
              onToggle()
            }}
            aria-label={`Open ${label}`}
            title={label}
            className={btnIcon}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </aside>
    )
  }
  return (
    <aside className="flex h-full w-[26rem] max-w-[45vw] shrink-0 flex-col border-l border-outline-variant bg-surface-container">
      <div className="flex items-center border-b border-outline-variant pr-1">
        <div role="tablist" aria-label="Station information" className="flex min-w-0 flex-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={tabClass(tab === id)}>
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onToggle} aria-label="Collapse side panel" title="Collapse side panel" className={btnIcon}>
          <PanelRightClose className="size-4" aria-hidden />
        </button>
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'assets' && <AssetsPanel station={station} selected={selected} onSelect={onSelect} />}
        {tab === 'legend' && <LegendPanel station={station} />}
        {tab === 'tables' && <TablesPanel station={station} />}
        {tab === 'notes' && <NotesPanel station={station} />}
      </div>
    </aside>
  )
}
