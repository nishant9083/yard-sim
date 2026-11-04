import { Layers } from 'lucide-react'
import type { LayerVisibility } from '@/sip/render'
import { ASSET_LAYERS, SKELETON_LAYERS, type LayerEntry } from './layerCatalog'

interface LayerMenuProps {
  layers: LayerVisibility
  onChange: (layers: LayerVisibility) => void
}

function Group({ title, entries, layers, onChange }: { title: string; entries: LayerEntry[] } & LayerMenuProps) {
  return (
    <fieldset className="space-y-0.5">
      <legend className="mb-1 text-[11px] font-medium tracking-wide text-on-surface-variant uppercase">{title}</legend>
      {entries.map(({ key, label, icon: Icon, hint }) => (
        <label
          key={key}
          title={hint}
          className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-on-surface hover:bg-surface-container-high"
        >
          <input
            type="checkbox"
            checked={layers[key]}
            onChange={() => onChange({ ...layers, [key]: !layers[key] })}
            className="size-3.5 accent-primary"
          />
          <Icon className="size-3.5 text-on-surface-variant" aria-hidden />
          {label}
        </label>
      ))}
    </fieldset>
  )
}

export function LayerMenu({ layers, onChange }: LayerMenuProps) {
  const all = [...SKELETON_LAYERS, ...ASSET_LAYERS]
  const setAll = (value: boolean) => onChange(all.reduce((acc, { key }) => ({ ...acc, [key]: value }), { ...layers }))
  return (
    <details className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-secondary">
        <Layers className="size-4" aria-hidden />
        Layers
      </summary>
      <div className="absolute top-10 left-0 z-20 grid w-[19rem] grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-outline-variant bg-surface-container p-3 shadow-xl">
        <Group title="Lines" entries={SKELETON_LAYERS} layers={layers} onChange={onChange} />
        <Group title="Assets" entries={ASSET_LAYERS} layers={layers} onChange={onChange} />
        <div className="col-span-2 flex gap-2 border-t border-outline-variant pt-2 text-xs">
          <button type="button" className="rounded-md px-2 py-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface" onClick={() => setAll(true)}>
            All on
          </button>
          <button type="button" className="rounded-md px-2 py-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface" onClick={() => setAll(false)}>
            All off
          </button>
        </div>
      </div>
    </details>
  )
}
