# SIP Editor – plan

Goal: draw or edit a SIP directly in the app (CAD / paint style) from a palette of assets, with the
app filling every field it can work out and asking only for what it cannot.

## Principles
1. **One data model.** The editor edits the same `Station` the viewer renders; the viewer's renderer is reused,
   so what you draw is exactly what you will see. Export is the station JSON the viewer already loads.
2. **Draw, don't type.** Every asset is placed with the mouse. Forms only hold what cannot be drawn.
3. **Auto-generate, but stay overridable.** Ids, codes, control numbers, directions, head side, chainages,
   platform sizes, circuit codes are generated. Generated fields carry an "auto" badge and a reset button.
4. **Never a dead end.** Unlimited undo/redo, autosaved drafts, live validation that jumps to the problem.
5. **Pure engine, thin UI.** All edits are pure `Station -> Station` functions (`src/sip/edit/ops.ts`), so they
   are testable and undo is just keeping snapshots.

## Architecture
```
src/sip/edit/
  ids.ts        unique id / next-number helpers
  autogen.ts    codes, directions, circuit limits, platform sizes, line table
  snap.ts       snapping to nodes, tracks, grid
  ops.ts        add / move / update / delete (with cascade) – pure
  checks.ts     editor-only completeness checks (blank bridge number, duplicate codes ...)
  catalog.ts    tool palette + signal presets
  history.ts    undo/redo reducer with gesture coalescing
  drafts.ts     blank station, localStorage drafts, JSON import/export
render/drawEditorOverlay.ts   grid underlay + snap marker, ghosts, handles
components/editor/            EditorView, EditorCanvas, ToolPalette, PropertiesPanel, IssuesPanel, StationPanel, ...
```

## Tools (key)
Select (V) · Track (T) · Crossover / turnout (X) · Signal (S) · Point (P) · Insulated joint (J) ·
Track circuit (C) · Platform (L) · Structure (B) · Bridge (G) · Text (A) · Pan (H or hold Space) · Delete (Del)

## Auto-generation
| Thing | Generated from |
|---|---|
| ids | prefix + next free number |
| track name / line no. | kind + next free number |
| node kinds | end of main line = boundary, siding end = buffer stop, shared = junction |
| crossover / turnout | split the clicked tracks, add junction nodes, add point machines (`31A`/`31B`) |
| signal code, control no. | next free number, UP odd / DN even |
| signal direction, head side | track direction, else which side of the track you clicked |
| point label, signal label | placed beside the symbol, away from the other line |
| track circuit limits | nearest insulated joints (or track ends) either side of the click |
| track circuit code | numbers of the points inside (`31/33T`), else `<track>T<n>` |
| platform length / chainages | geometry × chainage scale |
| bridge / structure chainage | x × chainage scale |
| line table (CSL) | track extents × chainage scale (marked approximate) |

## Out of scope for this iteration (documented, not forgotten)
Editing legend / notes / interlocking tables, platform vertex editing, multi-select, route authoring,
gradient and dimension tools, PDF import review (see `tools/`).
