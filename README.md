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
