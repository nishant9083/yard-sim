import type { ReactNode } from 'react'

/** Small product mark: two lines joined by a crossover. */
export function AppMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="5" className="fill-surface-container-high stroke-outline" />
      <path d="M4 8.5h16M4 15.5h16" className="stroke-on-surface" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M8.5 8.5l7 7" className="stroke-primary" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

interface AppHeaderProps {
  /** Where the user is, e.g. "Station viewer". */
  section: string
  /** Main title, usually the station name. */
  title: ReactNode
  /** Secondary line under the title. */
  subtitle?: ReactNode
  /** Controls placed before the brand (e.g. a back button). */
  leading?: ReactNode
  /** Controls placed right after the title (e.g. the station picker). */
  context?: ReactNode
  /** Actions on the right. */
  children?: ReactNode
}

/** The bar across the top of every screen. */
export function AppHeader({ section, title, subtitle, leading, context, children }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container px-3">
      {leading}
      <div className="flex shrink-0 items-center gap-2.5 pr-1" title="SIP Viewer: Signal Interlocking Plans">
        <AppMark />
        <div className="hidden leading-tight xl:block">
          <p className="text-[13px] font-semibold text-on-surface">SIP Viewer</p>
          <p className="text-[11px] text-on-surface-variant">{section}</p>
        </div>
      </div>
      <span className="h-7 w-px shrink-0 bg-outline-variant" aria-hidden />
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate text-sm font-semibold text-on-surface">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">{subtitle}</p>}
      </div>
      {context}
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  )
}

/** Monospace code badge, e.g. the station code next to its name. */
export function CodeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 inline-flex h-5 items-center rounded border border-outline-variant bg-surface-container-high px-1.5 align-[1px] font-mono text-[11px] font-medium text-on-surface-variant">
      {children}
    </span>
  )
}
