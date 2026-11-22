import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { ValidationIssue } from '@/sip/model'

export function ValidationSummary({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        <CircleCheck className="size-4" aria-hidden />
        Model valid
      </span>
    )
  }
  const errors = issues.filter((i) => i.level === 'error').length
  return (
    <details className="relative text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-error">
        <TriangleAlert className="size-4" aria-hidden />
        {errors} errors, {issues.length - errors} warnings
      </summary>
      <ul className="absolute right-0 z-50 mt-2 w-80 space-y-1 rounded-lg border border-outline-variant bg-surface-container p-3 text-on-surface-variant">
        {issues.map((issue, i) => (
          <li key={i}>
            <span className={issue.level === 'error' ? 'text-error' : 'text-primary'}>{issue.level}</span> {issue.message}
          </li>
        ))}
      </ul>
    </details>
  )
}
