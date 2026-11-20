import type { Point, Station } from '@/sip/model'
import type { Anchor } from './ops'
import type { Snap } from './snap'

/** What the user is part-way through drawing. */
export type Draft =
  | { kind: 'track'; anchors: Anchor[] }
  | { kind: 'connect'; a: Anchor }
  | { kind: 'merge'; firstTrackId: string }
  | { kind: 'rect'; a: Point; b: Point }
  /** Outline of a platform or building, corner by corner. */
  | { kind: 'poly'; points: Point[] }

export function anchorOfSnap(snap: Snap): Anchor {
  switch (snap.kind) {
    case 'node':
      return { nodeId: snap.nodeId }
    case 'track':
      return { trackId: snap.trackId, p: snap.p }
    case 'free':
      return { p: snap.p }
  }
}

/** Where an anchor is on the drawing. */
export function anchorPoint(s: Station, a: Anchor): Point | null {
  if ('nodeId' in a) {
    const n = s.nodes.find((n) => n.id === a.nodeId)
    return n ? { x: n.x, y: n.y } : null
  }
  return a.p
}
