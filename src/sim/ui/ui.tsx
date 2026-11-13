import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { Simulation } from '../engine/simulation'

export const useSimVersion = (sim: Simulation): number => useSyncExternalStore((cb) => sim.subscribe(cb), () => sim.version)

export const btn =
  'inline-flex h-7 items-center justify-center gap-1 rounded-md border border-outline-variant px-2 text-xs text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-secondary disabled:opacity-40 disabled:hover:bg-transparent'
export const btnPrimary = 'inline-flex h-7 items-center justify-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-on-primary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-secondary disabled:opacity-40'
export const field = 'h-7 rounded-md border border-outline-variant bg-surface px-1.5 text-xs text-on-surface focus-visible:outline-2 focus-visible:outline-secondary'

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-outline-variant px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-medium tracking-wide text-on-surface-variant uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'idle' | 'info'; children: ReactNode }) {
  const c = { ok: 'text-[#3ddc84] border-[#3ddc84]/40', warn: 'text-[#ffb454] border-[#ffb454]/40', bad: 'text-error border-error/40', idle: 'text-on-surface-variant border-outline-variant', info: 'text-secondary border-secondary/40' }[tone]
  return <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] leading-4 ${c}`}>{children}</span>
}
