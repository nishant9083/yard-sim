import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { Simulation } from '../engine/simulation'

export const useSimVersion = (sim: Simulation): number => useSyncExternalStore((cb) => sim.subscribe(cb), () => sim.version)

/* Compact (28 px) versions of the shared controls in src/sip/components/ui.ts, for dense simulator panels. */
export const btn =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-outline-variant bg-surface-container-high/40 px-2 text-xs font-medium text-on-surface transition-colors hover:border-outline hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-accent-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-outline-variant disabled:hover:bg-transparent'
export const btnPrimary =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-accent px-2.5 text-xs font-medium text-on-accent shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent-fg disabled:cursor-not-allowed disabled:opacity-40'
export const field =
  'h-7 rounded-md border border-outline-variant bg-surface-container-low px-1.5 text-xs text-on-surface transition-colors hover:border-outline focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-fg'

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-outline-variant px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.06em] text-on-surface-variant uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'idle' | 'info'; children: ReactNode }) {
  const c = {
    ok: 'text-success border-success/40 bg-success/10',
    warn: 'text-warning border-warning/40 bg-warning/10',
    bad: 'text-error border-error/40 bg-error/10',
    idle: 'text-on-surface-variant border-outline-variant',
    info: 'text-secondary border-secondary/40 bg-secondary/10',
  }[tone]
  return <span className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-px text-[10px] leading-4 font-medium ${c}`}>{children}</span>
}
