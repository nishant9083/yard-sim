import type { LucideIcon } from 'lucide-react'

interface LayerToggleProps {
  icon: LucideIcon
  label: string
  active: boolean
  onToggle: () => void
}

export function LayerToggle({ icon: Icon, label, active, onToggle }: LayerToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onToggle}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-secondary ${
        active
          ? 'bg-surface-container-high text-on-surface'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  )
}
