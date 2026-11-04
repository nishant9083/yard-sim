import { useState } from 'react'
import { ValidationSummary, StationViewer, stationList } from '@/sip'

export default function App() {
  const [code, setCode] = useState(stationList[0]!.station.meta.code)
  const { station, issues } = stationList.find((s) => s.station.meta.code === code) ?? stationList[0]!

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-outline-variant bg-surface-container px-4 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium text-on-surface">
            {station.meta.name} <span className="text-on-surface-variant">({station.meta.code})</span>
          </h1>
          <p className="truncate text-xs text-on-surface-variant">
            {station.meta.sipRef} · {station.meta.ends.west} ← → {station.meta.ends.east}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stationList.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-on-surface-variant">
              Station
              <select
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface focus-visible:outline-2 focus-visible:outline-secondary"
              >
                {stationList.map((s) => (
                  <option key={s.station.meta.code} value={s.station.meta.code}>
                    {s.station.meta.name} ({s.station.meta.code})
                  </option>
                ))}
              </select>
            </label>
          )}
          <ValidationSummary issues={issues} />
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <StationViewer key={station.meta.code} station={station} />
      </main>
    </div>
  )
}
