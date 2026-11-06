import {
  Building2,
  CircleDot,
  Hand,
  MousePointer2,
  RectangleHorizontal,
  SeparatorVertical,
  Spline,
  TrafficCone,
  TrainTrack,
  Type,
  Waypoints,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { SIGNAL_PRESETS, STRUCTURE_NAMES, TRACK_KINDS, type ToolId, type ToolOptions } from '@/sip/edit'
import type { StructureKind } from '@/sip/model'
import { CheckField } from './fields'

interface ToolDef {
  id: ToolId
  label: string
  key: string
  icon: LucideIcon
}

export const TOOL_GROUPS: { title: string; tools: ToolDef[] }[] = [
  {
    title: 'View',
    tools: [
      { id: 'select', label: 'Select / move', key: 'V', icon: MousePointer2 },
      { id: 'pan', label: 'Pan', key: 'H', icon: Hand },
    ],
  },
  {
    title: 'Lines',
    tools: [
      { id: 'track', label: 'Line', key: 'T', icon: TrainTrack },
      { id: 'connect', label: 'Crossover / turnout', key: 'X', icon: Spline },
    ],
  },
  {
    title: 'Signalling',
    tools: [
      { id: 'signal', label: 'Signal', key: 'S', icon: TrafficCone },
      { id: 'point', label: 'Point machine', key: 'P', icon: CircleDot },
      { id: 'joint', label: 'Insulated joint', key: 'J', icon: SeparatorVertical },
      { id: 'circuit', label: 'Track circuit', key: 'C', icon: Zap },
    ],
  },
  {
    title: 'Surroundings',
    tools: [
      { id: 'platform', label: 'Platform', key: 'L', icon: RectangleHorizontal },
      { id: 'structure', label: 'Building / box', key: 'B', icon: Building2 },
      { id: 'bridge', label: 'Bridge', key: 'G', icon: Waypoints },
      { id: 'text', label: 'Text', key: 'A', icon: Type },
    ],
  },
]

interface ToolPaletteProps {
  tool: ToolId
  onTool: (tool: ToolId) => void
  options: ToolOptions
  onOptions: (options: ToolOptions) => void
}

const selectClass = 'w-full rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface focus-visible:outline-2 focus-visible:outline-secondary'

export function ToolPalette({ tool, onTool, options, onOptions }: ToolPaletteProps) {
  return (
    <nav aria-label="Tools" className="flex h-full w-52 shrink-0 flex-col overflow-y-auto border-r border-outline-variant bg-surface-container">
      <div className="space-y-3 p-2">
        {TOOL_GROUPS.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <p className="px-2 text-[10px] font-medium tracking-wide text-on-surface-variant uppercase">{group.title}</p>
            {group.tools.map(({ id, label, key, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={tool === id}
                onClick={() => onTool(id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-secondary ${
                  tool === id ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{label}</span>
                <kbd className={`rounded px-1 text-[10px] ${tool === id ? 'bg-on-primary/15' : 'bg-surface-container-high text-on-surface-variant'}`}>{key}</kbd>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-2 border-t border-outline-variant p-3">
        {tool === 'track' && (
          <label className="block space-y-1 text-[11px] text-on-surface-variant">
            Type of line
            <select className={selectClass} value={options.trackKind} onChange={(e) => onOptions({ ...options, trackKind: e.target.value as ToolOptions['trackKind'] })}>
              {TRACK_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {tool === 'connect' && (
          <CheckField label="Add point machines" checked={options.connectWithPoints} onChange={(v) => onOptions({ ...options, connectWithPoints: v })} hint="Codes such as 31A / 31B are numbered for you." />
        )}
        {tool === 'signal' && (
          <label className="block space-y-1 text-[11px] text-on-surface-variant">
            Signal type
            <select className={selectClass} value={options.signalPreset} onChange={(e) => onOptions({ ...options, signalPreset: e.target.value })}>
              {SIGNAL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="block">Number, direction and side are filled in. Change the head afterwards.</span>
          </label>
        )}
        {tool === 'structure' && (
          <label className="block space-y-1 text-[11px] text-on-surface-variant">
            What to place
            <select className={selectClass} value={options.structureKind} onChange={(e) => onOptions({ ...options, structureKind: e.target.value as StructureKind })}>
              {Object.entries(STRUCTURE_NAMES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {tool !== 'track' && tool !== 'connect' && tool !== 'signal' && tool !== 'structure' && (
          <p className="text-[11px] text-on-surface-variant">Space + drag pans from any tool. Scroll to zoom. Ctrl+Z undoes.</p>
        )}
      </div>
    </nav>
  )
}
