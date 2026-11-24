import type { LucideIcon } from 'lucide-react'
import { btnGhost, pressed } from './ui'

interface LayerToggleProps {
  icon: LucideIcon
  label: string
  active: boolean
  onToggle: () => void
}

export function LayerToggle({ icon: Icon, label, active, onToggle }: LayerToggleProps) {
  return (
    <button type="button" aria-pressed={active} title={`${active ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onClick={onToggle} className={`${btnGhost} ${active ? pressed : ''}`}>
      <Icon className={`size-4 ${active ? 'text-on-surface' : 'opacity-70'}`} aria-hidden />
      {label}
    </button>
  )
}
