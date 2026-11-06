import { useState } from 'react'
import type { NewStationInput } from '@/sip/edit'
import { buttonClass } from './fields'

interface NewStationDialogProps {
  existingCodes: string[]
  onCreate: (input: NewStationInput) => void
  onCancel: () => void
}

const inputClass = 'w-full rounded-md border border-outline-variant bg-surface px-2 py-1.5 text-sm text-on-surface focus-visible:outline-2 focus-visible:outline-secondary'

export function NewStationDialog({ existingCodes, onCreate, onCancel }: NewStationDialogProps) {
  const [form, setForm] = useState<NewStationInput>({ code: '', name: '', zone: '', sipRef: '' })
  const code = form.code.trim().toUpperCase()
  const error = !code ? 'Enter a station code.' : existingCodes.includes(code) ? `A station with code ${code} already exists.` : !form.name.trim() ? 'Enter the station name.' : null
  const set = (patch: Partial<NewStationInput>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="new-station-title">
      <form
        className="w-full max-w-md space-y-4 rounded-xl border border-outline-variant bg-surface-container p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          if (!error) onCreate(form)
        }}
      >
        <h2 id="new-station-title" className="text-base font-medium text-on-surface">
          New station
        </h2>
        <p className="text-xs text-on-surface-variant">Start with the basics. Everything else is drawn, and can be changed later.</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-1 text-xs text-on-surface-variant">
            Code
            <input autoFocus className={`${inputClass} uppercase`} value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="JRT" />
          </label>
          <label className="col-span-2 space-y-1 text-xs text-on-surface-variant">
            Name
            <input className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Jarati" />
          </label>
          <label className="space-y-1 text-xs text-on-surface-variant">
            Zone
            <input className={inputClass} value={form.zone} onChange={(e) => set({ zone: e.target.value })} placeholder="ECoR" />
          </label>
          <label className="col-span-2 space-y-1 text-xs text-on-surface-variant">
            SIP reference
            <input className={inputClass} value={form.sipRef} onChange={(e) => set({ sipRef: e.target.value })} placeholder="SI-23265" />
          </label>
          <label className="col-span-3 grid grid-cols-2 gap-3 text-xs text-on-surface-variant">
            <span className="space-y-1">
              West end
              <input className={inputClass} value={form.west ?? ''} onChange={(e) => set({ west: e.target.value })} placeholder="towards ..." />
            </span>
            <span className="space-y-1">
              East end
              <input className={inputClass} value={form.east ?? ''} onChange={(e) => set({ east: e.target.value })} placeholder="towards ..." />
            </span>
          </label>
        </div>
        {error && form.code + form.name !== '' && <p className="text-xs text-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!!error} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40">
            Create and draw
          </button>
        </div>
      </form>
    </div>
  )
}
