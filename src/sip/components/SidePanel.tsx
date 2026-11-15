import { BookOpen, ChevronLeft, ChevronRight, FileText, List, Table2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { EntityRef, Station } from '@/sip/model'
import { AssetsPanel } from './AssetsPanel'
import { LegendPanel } from './LegendPanel'
import { NotesPanel } from './NotesPanel'
import { TablesPanel } from './TablesPanel'

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
      <aside className="flex h-full w-9 shrink-0 flex-col border-l border-outline-variant bg-surface-container">
        <button type="button" onClick={onToggle} aria-label="Expand side panel" title="Expand side panel" className="flex w-full items-center justify-center py-2.5 text-on-surface-variant hover:text-on-surface">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      </aside>
    )
  }
  return (
    <aside className="flex h-full w-[26rem] max-w-[45vw] shrink-0 flex-col border-l border-outline-variant bg-surface-container">
      <div role="tablist" aria-label="Station information" className="flex border-b border-outline-variant">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-secondary ${
              tab === id ? 'border-primary text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
        <button type="button" onClick={onToggle} aria-label="Collapse side panel" title="Collapse side panel" className="px-2 text-on-surface-variant hover:text-on-surface">
          <ChevronRight className="size-4" aria-hidden />
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
