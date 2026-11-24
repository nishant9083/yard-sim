import { useState } from 'react'
import type { NewStationInput } from '@/sip/edit'
import { buttonClass } from './fields'
import { btnPrimary, input, popover } from '../ui'

interface NewStationDialogProps {
  existingCodes: string[]
  onCreate: (input: NewStationInput) => void
  onCancel: () => void
}

const inputClass = `${input} mt-1 h-9 text-[13px]`

export function NewStationDialog({ existingCodes, onCreate, onCancel }: NewStationDialogProps) {
  const [form, setForm] = useState<NewStationInput>({ code: '', name: '', zone: '', sipRef: '' })
  const code = form.code.trim().toUpperCase()
  const error = !code ? 'Enter a station code.' : existingCodes.includes(code) ? `A station with code ${code} already exists.` : !form.name.trim() ? 'Enter the station name.' : null
  const set = (patch: Partial<NewStationInput>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="new-station-title" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <form
        className={`${popover} w-full max-w-md overflow-hidden`}
        onSubmit={(e) => {
          e.preventDefault()
          if (!error) onCreate(form)
        }}
      >
        <div className="border-b border-outline-variant px-5 pt-4 pb-3">
          <h2 id="new-station-title" className="text-sm font-semibold text-on-surface">
            New station
          </h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">Start with the basics. Everything else is drawn, and can be changed later.</p>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-3.5 px-5 py-4">
          <label className="block text-xs font-medium text-on-surface-variant">
            Code
            <input autoFocus className={`${inputClass} uppercase`} value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="JRT" />
          </label>
          <label className="col-span-2 block text-xs font-medium text-on-surface-variant">
            Name
            <input className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Jarati" />
          </label>
          <label className="block text-xs font-medium text-on-surface-variant">
            Zone
            <input className={inputClass} value={form.zone} onChange={(e) => set({ zone: e.target.value })} placeholder="ECoR" />
          </label>
          <label className="col-span-2 block text-xs font-medium text-on-surface-variant">
            SIP reference
            <input className={inputClass} value={form.sipRef} onChange={(e) => set({ sipRef: e.target.value })} placeholder="SI-23265" />
          </label>
          <label className="col-span-3 grid grid-cols-2 gap-3 text-xs font-medium text-on-surface-variant">
            <span className="block">
              West end
              <input className={inputClass} value={form.west ?? ''} onChange={(e) => set({ west: e.target.value })} placeholder="towards ..." />
            </span>
            <span className="block">
              East end
              <input className={inputClass} value={form.east ?? ''} onChange={(e) => set({ east: e.target.value })} placeholder="towards ..." />
            </span>
          </label>
        </div>
        {error && form.code + form.name !== '' && <p className="-mt-1 px-5 pb-3 text-xs text-error">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-outline-variant bg-surface-container-low/60 px-5 py-3">
          <button type="button" className={buttonClass} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!!error} className={btnPrimary}>
            Create and draw
          </button>
        </div>
      </form>
    </div>
  )
}
