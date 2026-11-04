import type { Connection, Station, Track, TrackNode } from './types'

export interface StationIndex {
  nodeById: Map<string, TrackNode>
  trackById: Map<string, Track>
  connectionById: Map<string, Connection>
  tracksByNode: Map<string, Track[]>
  connectionsByNode: Map<string, Connection[]>
}

function pushTo<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export function indexStation(station: Station): StationIndex {
  const tracksByNode = new Map<string, Track[]>()
  const connectionsByNode = new Map<string, Connection[]>()

  for (const track of station.tracks) {
    for (const id of new Set(track.nodeIds)) pushTo(tracksByNode, id, track)
  }
  for (const connection of station.connections) {
    pushTo(connectionsByNode, connection.from, connection)
    pushTo(connectionsByNode, connection.to, connection)
  }

  return {
    nodeById: new Map(station.nodes.map((n) => [n.id, n])),
    trackById: new Map(station.tracks.map((t) => [t.id, t])),
    connectionById: new Map(station.connections.map((c) => [c.id, c])),
    tracksByNode,
    connectionsByNode,
  }
}
