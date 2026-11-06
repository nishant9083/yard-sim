import { useCallback, useReducer } from 'react'
import type { Station } from '@/sip/model'

const LIMIT = 200

interface History {
  present: Station
  past: Station[]
  future: Station[]
  /** Station as it was when the current drag began; null when no drag is running. */
  gestureBase: Station | null
}

type Action =
  | { type: 'commit'; station: Station }
  | { type: 'live'; station: Station }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; station: Station }

const push = (past: Station[], s: Station) => [...past.slice(-(LIMIT - 1)), s]

function reducer(h: History, a: Action): History {
  switch (a.type) {
    case 'commit':
      if (a.station === h.present) return h
      return { present: a.station, past: push(h.past, h.gestureBase ?? h.present), future: [], gestureBase: null }
    case 'live':
      return { ...h, present: a.station, gestureBase: h.gestureBase ?? h.present }
    case 'end':
      if (!h.gestureBase) return h
      return h.gestureBase === h.present
        ? { ...h, gestureBase: null }
        : { present: h.present, past: push(h.past, h.gestureBase), future: [], gestureBase: null }
    case 'undo': {
      const prev = h.past[h.past.length - 1]
      if (!prev) return h
      return { present: prev, past: h.past.slice(0, -1), future: [h.present, ...h.future], gestureBase: null }
    }
    case 'redo': {
      const next = h.future[0]
      if (!next) return h
      return { present: next, past: push(h.past, h.present), future: h.future.slice(1), gestureBase: null }
    }
    case 'reset':
      return { present: a.station, past: [], future: [], gestureBase: null }
  }
}

/**
 * Undo/redo over whole-station snapshots (cheap: edits share structure).
 * `live` updates during a drag, `end` closes the drag as a single undo step.
 */
export function useHistory(initial: Station) {
  const [h, dispatch] = useReducer(reducer, { present: initial, past: [], future: [], gestureBase: null })
  return {
    station: h.present,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    commit: useCallback((station: Station) => dispatch({ type: 'commit', station }), []),
    live: useCallback((station: Station) => dispatch({ type: 'live', station }), []),
    end: useCallback(() => dispatch({ type: 'end' }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    reset: useCallback((station: Station) => dispatch({ type: 'reset', station }), []),
  }
}
