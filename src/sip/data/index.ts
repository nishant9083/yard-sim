import { loadStation, type LoadedStation } from '@/sip/model'

/**
 * Every `*.json` in this folder is a station. Drop a file in (for example the output of
 * `npm run sip:extract`) and it appears in the station picker; nothing to register by hand.
 */
const modules = import.meta.glob<unknown>('./*.json', { eager: true, import: 'default' })

export const stations: Record<string, LoadedStation> = {}
for (const raw of Object.values(modules)) {
  const loaded = loadStation(raw as Parameters<typeof loadStation>[0])
  stations[loaded.station.meta.code] = loaded
}

export const stationList: LoadedStation[] = Object.values(stations).sort((a, b) => a.station.meta.name.localeCompare(b.station.meta.name))
