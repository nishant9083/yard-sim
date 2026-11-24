import { ChevronDown, Layers } from 'lucide-react'
import { useState } from 'react'
import type { LayerVisibility } from '@/sip/render'
import { ASSET_LAYERS, SKELETON_LAYERS, type LayerEntry } from './layerCatalog'
import { btnGhost, overline, popover, useDismissableDetails } from './ui'

interface LayerMenuProps {
  layers: LayerVisibility
  onChange: (layers: LayerVisibility) => void
}

function Group({ title, entries, layers, onChange }: { title: string; entries: LayerEntry[] } & LayerMenuProps) {
  return (
    <fieldset className="space-y-0.5">
      <legend className={`${overline} mb-1.5 px-1.5`}>{title}</legend>
      {entries.map(({ key, label, icon: Icon, hint }) => (
        <label key={key} title={hint} className="flex h-7 items-center gap-2 rounded-md px-1.5 text-xs text-on-surface transition-colors hover:bg-surface-container-high">
          <input type="checkbox" checked={layers[key]} onChange={() => onChange({ ...layers, [key]: !layers[key] })} className="size-3.5" />
          <Icon className="size-3.5 text-on-surface-variant" aria-hidden />
          {label}
        </label>
      ))}
    </fieldset>
  )
}

export function LayerMenu({ layers, onChange }: LayerMenuProps) {
  const ref = useDismissableDetails()
  // Open towards whichever side has room, and never taller than the window.
  const [place, setPlace] = useState<{ right: boolean; maxHeight: number }>({ right: false, maxHeight: 480 })
  const onToggle = () => {
    const el = ref.current
    if (!el?.open) return
    const r = el.getBoundingClientRect()
    const width = 20 * 16 + 8
    setPlace({ right: r.left + width > window.innerWidth && r.right - width >= 0, maxHeight: Math.max(200, window.innerHeight - r.bottom - 16) })
  }
  const all = [...SKELETON_LAYERS, ...ASSET_LAYERS]
  const setAll = (value: boolean) => onChange(all.reduce((acc, { key }) => ({ ...acc, [key]: value }), { ...layers }))
  const on = all.filter(({ key }) => layers[key]).length
  return (
    <details ref={ref} className="group relative" onToggle={onToggle}>
      <summary className={`${btnGhost} list-none group-open:bg-surface-container-highest group-open:text-on-surface`} title="Choose which layers of the drawing are shown">
        <Layers className="size-4" aria-hidden />
        Layers
        <span className="rounded bg-surface-container-high px-1 font-mono text-[10px] text-on-surface-variant tabular-nums">
          {on}/{all.length}
        </span>
        <ChevronDown className="size-3.5 opacity-60 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div
        className={`${popover} absolute top-10 z-20 flex w-[20rem] max-w-[calc(100vw-1rem)] flex-col ${place.right ? 'right-0' : 'left-0'}`}
        style={{ maxHeight: place.maxHeight }}
      >
        <div className="grid min-h-0 grid-cols-2 gap-x-3 gap-y-3 overflow-y-auto p-3">
          <Group title="Lines" entries={SKELETON_LAYERS} layers={layers} onChange={onChange} />
          <Group title="Assets" entries={ASSET_LAYERS} layers={layers} onChange={onChange} />
        </div>
        <div className="flex items-center justify-end gap-1 border-t border-outline-variant px-3 py-2">
          <button type="button" className={btnGhost} onClick={() => setAll(false)}>
            Hide all
          </button>
          <button type="button" className={btnGhost} onClick={() => setAll(true)}>
            Show all
          </button>
        </div>
      </div>
    </details>
  )
}
