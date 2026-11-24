/**
 * Shared interface styles. One place for buttons, inputs, tabs and panels so the
 * viewer, the editor and the simulator look and behave the same.
 */
import { useEffect, useRef } from 'react'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-fg'
const disabled = 'disabled:cursor-not-allowed disabled:opacity-40'

/** Bordered secondary button (32 px). */
export const btn = `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-outline-variant bg-surface-container-high/40 px-2.5 text-xs font-medium text-on-surface transition-colors hover:border-outline hover:bg-surface-container-high ${focus} ${disabled} disabled:hover:border-outline-variant disabled:hover:bg-transparent`

/** Main action of a view or dialog. */
export const btnPrimary = `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-xs font-medium text-on-accent shadow-sm transition-colors hover:bg-accent-hover ${focus} ${disabled}`

/** Destructive action. */
export const btnDanger = `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-error/40 px-2.5 text-xs font-medium text-error transition-colors hover:border-error hover:bg-error/10 ${focus} ${disabled}`

/** Borderless button for toolbars. */
export const btnGhost = `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface ${focus} ${disabled}`

/** Square icon-only button. */
export const btnIcon = `inline-flex size-8 shrink-0 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface ${focus} ${disabled}`

/** Toggle state on a toolbar button (pair with aria-pressed). */
export const pressed = 'bg-surface-container-highest text-on-surface shadow-[inset_0_0_0_1px_var(--color-outline)]'

/** Text input and select. */
export const input = `h-8 w-full min-w-0 rounded-md border border-outline-variant bg-surface-container-low px-2.5 text-xs text-on-surface placeholder:text-on-surface-variant/60 transition-colors hover:border-outline focus:border-accent focus:outline-none ${focus}`

/** Floating panel over the drawing. */
export const floating = 'rounded-lg border border-outline-variant bg-surface-container/95 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)] backdrop-blur-sm'

/** Dropdown / popover surface. */
export const popover = 'rounded-lg border border-outline bg-surface-container shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)]'

/** Overline heading for a group inside a panel. */
export const overline = 'text-[11px] font-semibold tracking-[0.06em] text-on-surface-variant uppercase'

/** Vertical rule between toolbar groups. */
export const divider = 'mx-1 h-5 w-px shrink-0 bg-outline-variant'

/** A tab in a panel tab bar (pair with aria-selected). */
export function tabClass(active: boolean) {
  return `relative flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-2 text-xs font-medium transition-colors ${focus} focus-visible:-outline-offset-2 ${
    active
      ? 'text-on-surface after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-fg'
      : 'text-on-surface-variant hover:text-on-surface'
  }`
}

/**
 * Close a <details> popover when the user clicks outside it or presses Escape.
 * Returns the ref to put on the <details> element.
 */
export function useDismissableDetails<T extends HTMLDetailsElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const el = ref.current
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) el.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current
      if (e.key === 'Escape' && el?.open) {
        el.open = false
        el.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  return ref
}
