import { ChevronDown, CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import type { ValidationIssue } from '@/sip/model'
import { popover, useDismissableDetails } from './ui'

const chip = 'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium'

export function ValidationSummary({ issues }: { issues: ValidationIssue[] }) {
  const ref = useDismissableDetails()
  if (issues.length === 0) {
    return (
      <span className={`${chip} border-success/30 bg-success/10 text-success`} title="The station data passed every check">
        <CircleCheck className="size-3.5" aria-hidden />
        Model valid
      </span>
    )
  }
  const errors = issues.filter((i) => i.level === 'error').length
  const warnings = issues.length - errors
  const parts = [errors && `${errors} error${errors === 1 ? '' : 's'}`, warnings && `${warnings} warning${warnings === 1 ? '' : 's'}`].filter(Boolean).join(', ')
  const tone = errors ? 'border-error/40 bg-error/10 text-error' : 'border-warning/40 bg-warning/10 text-warning'
  const sorted = [...issues].sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'))
  return (
    <details ref={ref} className="group relative text-xs">
      <summary className={`${chip} ${tone} list-none transition-colors hover:brightness-110`}>
        {errors ? <CircleX className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}
        {parts}
        <ChevronDown className="size-3.5 opacity-70 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className={`${popover} absolute right-0 z-50 mt-2 w-96 overflow-hidden`}>
        <p className="border-b border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface">Model checks</p>
        <ul className="max-h-80 divide-y divide-outline-variant overflow-y-auto">
          {sorted.map((issue, i) => (
            <li key={i} className="flex gap-2 px-3 py-2 text-on-surface">
              {issue.level === 'error' ? (
                <CircleX className="mt-0.5 size-3.5 shrink-0 text-error" aria-label="Error" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-label="Warning" />
              )}
              <span className="leading-snug">{issue.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
