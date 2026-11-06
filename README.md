# SIP Viewer

Interactive rendering of Signal Interlocking Plans (SIP). **Step 1: track layout.**
Tracks, crossovers and sidings are drawn from one JSON file per station.
Signals, points, track circuits and routes come in the next steps.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

Stack: React 19, Vite, Tailwind CSS v4, TypeScript (strict).

## Data model (`src/sip/model/types.ts`)

| Entity       | What it is                                                              |
|--------------|-------------------------------------------------------------------------|
| `TrackNode`  | A vertex: `boundary`, `bufferStop`, `junction` or `plain`, with x/y.    |
| `Track`      | A named, ordered list of node ids (LINE 1..4, sidings, overruns).       |
| `Connection` | A diagonal/curved link between nodes of two tracks, optional `via` shape points. |

Coordinates are drawing space (PDF points), x towards the east end, y downward.
Tracks may share end nodes (e.g. L1 continues into the TM siding at `J36`).
Connections are where points will attach in step 2 (`31A/31B`, `34B/34A` ...).

## Layout of the code

```
src/sip/
  model/       types, index lookups, validation, loadStation()
  data/        jrt.json  + registry (data/index.ts)
  layout/      geometry helpers, layoutStation() (y stretch, bounds, end tangents)
  render/      camera, theme (reads CSS tokens), draw* functions, hit testing
  hooks/       useElementSize, useCameraControls (wheel zoom, drag pan, tap)
  components/  SipCanvas, Toolbar, InspectorPanel, ValidationSummary, StationViewer
```

Rendering is pure functions over a `CanvasRenderingContext2D`, so the same code can
render in a test or an offscreen canvas.

## Adding a station

1. Create `src/sip/data/<code>.json` (copy `jrt.json`).
2. Register it in `src/sip/data/index.ts`.
3. Open the app: the header shows validation errors (missing nodes, duplicate ids,
   disconnected graph, zero-length segments, ...).

## Interaction

Wheel = zoom, drag = pan, hover = inspect, click = pin, double-click = fit station.
"Vertical stretch" exaggerates y so parallel lines stay readable on very long yards.

## Known simplifications in `jrt.json` (to refine)

- Positions were read from the PDF's vector geometry and are approximate.
- West approach lines are straightened; the drawing has small jogs near x = 600 (PDF pt).
- Point 36's short diverging arc is not drawn; the TM siding continues straight from L1.
- Track `L3X` (stub beyond 34B) is named by position; confirm its purpose in the SIP.
- Curved turnouts are polylines; the 35 overrun leg and the 37/39 siding legs use `via` points.

## Next steps

2. Assets: signals, points (attach to connections), track circuits, platforms.
3. Tables and routes: crank handles, overlaps, route labels, aspect charts.
4. PDF extraction + review editor to produce station JSON automatically.

## Step 2 – assets, legend, tables, lengths

- `tools/jrt/gen_jrt.py` regenerates `src/sip/data/jrt.json` (signals, points, track circuits, platforms, structures, bridges, chainage marks, gradients, dimensions, info tables, notes).
- Chainage is F/CSB, measured from the station centre line (1:1000 scale, 1 pt = 0.35278 m). Vertical is 1:500, so vertical dimensions are labelled but not to scale.
- Right panel: Assets (searchable, click to focus), Legend, Tables (title block, CSL, controls, crank handles, overlaps, working, aspects), Notes (16 notes, key Q/P procedures, revisions).

### Interpretations to verify against the signed PDF
- Track-circuit limits are approximate (derived from insulated-joint positions); L4 boundaries mirror L3.
- Default point ratios (note 4); meaning of PT/FM/DS/DE is shown as printed.
- Signal head/stem geometry, platform polygons and the box-with-circle detector are approximated.
- Purpose of the T36 leg is unclear; aspect-chart connector lines are tabulated only.
- Revisions text is partly uncertain.

## Step 3 – more stations and the extractor

* `tools/sipx/` reads a SIP PDF and writes the station JSON; see `tools/METHODOLOGY.md` for the one-command workflow, what it detects, how to correct it and its limits.
* Every `*.json` in `src/sip/data/` appears in the station picker automatically.
* Waltair RYD & CYD (`src/sip/data/ryd.json`, config `tools/stations/ryd.json`) is produced entirely by the extractor. Jarati stays on its hand-checked generator.

## Step 4 – the SIP editor

Draw or edit a station directly in the app. Header buttons: **Edit** (copy of the station being viewed), **New station**, **Import** (a station JSON).
Edits are autosaved as a *draft* in the browser (the bundled file is never touched); the viewer always shows the bundled stations, and **Edit** reopens your saved draft if there is one (the editor's *Draft* picker switches between drafts).
Export the JSON from the editor's *Station* tab and drop it in `src/sip/data/` to ship it. Design and rationale: `docs/EDITOR_PLAN.md`.

| Tool (key) | What a click does |
|---|---|
| Select (V) | select / drag symbols and vertices, double-click a line to add a bend, Delete removes |
| Line (T) | click points, double-click or Enter to finish; start/end on another line to join it |
| Crossover / turnout (X) | click a spot on each of two lines; junctions and points `nA`/`nB` are created |
| Signal (S) | click beside a line: number (UP odd / DN even), direction, side and head come from where you click |
| Point (P), Joint (J) | on a junction / on a line |
| Track circuit (C) | click a section between joints: limits and code (`31/33T`) are generated |
| Platform (L), Building/box (B) | drag a rectangle; lengths and chainages come from the chainage scale |
| Bridge (G), Text (A) | click |

Space+drag pans, wheel zooms, Ctrl+Z / Ctrl+Y undo and redo, Alt while dragging turns the grid snap off.
Generated fields show an **auto** badge and a reset button. The *Issues* tab lists structural errors and blanks only the user can fill (bridge number, platform width, point ratio).

Code: pure edit functions in `src/sip/edit/` (`ops.ts`, `autogen.ts`, `snap.ts`, `history.ts`), UI in `src/sip/components/editor/`.
The editor reuses the viewer's renderer, so what you draw is what the viewer shows.
