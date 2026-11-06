import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { EntityRef, Station, ValidationIssue } from '@/sip/model'
import { findEntityById } from '@/sip/edit'

interface IssuesPanelProps {
  station: Station
  issues: ValidationIssue[]
  onSelect: (ref: EntityRef) => void
}

export function IssuesPanel({ station, issues, onSelect }: IssuesPanelProps) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-on-surface-variant">
        <CheckCircle2 className="size-4 text-sip-tc-b" aria-hidden />
        No problems found.
      </div>
    )
  }
  const sorted = [...issues].sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'))
  return (
    <ul className="divide-y divide-outline-variant">
      {sorted.map((issue, i) => {
        const ref = issue.entityId ? findEntityById(station, issue.entityId) : null
        const Icon = issue.level === 'error' ? XCircle : AlertTriangle
        return (
          <li key={`${issue.code}-${issue.entityId ?? i}-${i}`}>
            <button
              type="button"
              disabled={!ref}
              onClick={() => ref && onSelect(ref)}
              className="flex w-full items-start gap-2 px-4 py-2 text-left text-xs hover:bg-surface-container-high disabled:cursor-default disabled:hover:bg-transparent"
            >
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${issue.level === 'error' ? 'text-error' : 'text-primary'}`} aria-hidden />
              <span className="text-on-surface">{issue.message}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
