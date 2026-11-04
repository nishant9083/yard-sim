# From a SIP PDF to a station in the viewer

## One command

```bash
pip install pymupdf pillow                      # once
npm run sip:extract -- path/to/plan.pdf --out src/sip/data/xyz.json
npm run dev                                     # the new station is in the picker (every *.json in src/sip/data is loaded)
```

With no config the script guesses code, name and sheet number from the PDF and file name. To set them (and to
keep corrections between runs), put them in `tools/stations/<code>.json` and add `--config` (example: `tools/stations/ryd.json`).
Add `--debug graph.png` to get a picture of the extracted track graph.

Each run also writes `tools/reports/<code>.report.json`: what could not be placed (signals with no stem found, axle
labels with no track nearby, rotated text skipped). Read it first; it is the to-do list for corrections.

## What the script does (tools/sipx)

| Stage | File | How |
|---|---|---|
| Read the sheet | `pdfio.py` | PyMuPDF. Applies the page `/Rotate`, flattens curves, drops text printed twice on top of itself. |
| Track graph | `topology.py` | Strokes join into lines; lines drawn in pieces are merged; a line end that touches another line (up to 5 pt, drawn gaps at points) becomes a junction; crossings become nodes; tables and the sheet frame are removed; short stubs (ticks, buffer bars) are pruned. |
| Tracks and links | `assemble.py` | At each junction a line carries straight on (smallest bend). A path that starts and ends on other lines is a *connection* (crossover/link); everything else is a *track*. |
| Station skeleton | `build_station.py` | Nodes, tracks, connections in the viewer's JSON model; ends become `boundary` (sheet edge) or `bufferStop`. |
| Assets | `assets.py` | See below. |
| Notes and tables | `info.py` | Notes: the lines under a "NOTES" heading. Tables: ruled grids, read cell by cell. Crank handles are matched back to points. Loose text becomes notes; big text becomes the title. |
| Corrections | `run.py` | `overrides` in the config (below). |

### How each asset is recognised

* **Points**: a black number (`151`, `31A`, `112A/B`) within 28 pt of a junction.
* **Signals**: red text (or names starting `SH`/`C` + digit). The stem is the vertical stroke near the label that touches a rail; the head is the filled circles around its far end, which gives the side and the head direction.
* **Axle-counter sections**: labels such as `151AXT`, `211XT`, `L1AXT`. The section runs between the detection ticks either side of the label.
* **Detection ticks**: short thick bars crossing a rail at a right angle.
* **Line names**: a caption containing LINE/YARD/SIDING near a track end; or `L<n>AXT` on the track.
* **Everything else** near a track is kept as a text annotation, so nothing printed is silently lost.

## When the output is wrong

Fix it in the config, not in the JSON, so the fix survives a re-run:

```json
{
  "code": "XYZ", "name": "Example", "yExaggeration": 1,
  "yardBox": [x0, y0, x1, y1],            // sheet points; ignore line work outside it (title block, dimension strips)
  "excludeBoxes": [[x0, y0, x1, y1]],     // ignore a region (legend, a table the detector took for track)
  "topology": { "touch_eps": 4, "min_line_len": 12 },   // any field of Params in topology.py
  "overrides": {
    "tracksAt": [{ "at": [pageX, pageY], "set": { "name": "UP Main", "kind": "main", "direction": "UP" } }],
    "signals": { "126A/B": { "kind": "home", "direction": "DN" } },
    "points": { "151": { "ratio": "1 IN 8.5", "switch": "CS" } },
    "dropSignals": ["S8"], "dropPoints": [], "dropTrackCircuits": []
  }
}
```

Page coordinates are the sheet's own points (the debug PNG is at 3 px per point).

## Known limits (be honest with yourself about these)

* The extractor reads **vector** PDFs. A scanned or raster SIP needs OCR and line tracing first; this does not do that.
* It works best on a clean schematic like the Waltair sheet. A large, dimension-heavy SIP such as Jarati (platform outlines, gradient posts, dimension lines in the same pen as the rails) comes out with extra "tracks". Jarati therefore stays on its hand-checked generator, `tools/jrt/gen_jrt.py` (`npm run sip:jrt`). For that style of sheet use `yardBox`/`excludeBoxes` and expect to correct by hand.
* Point ratios, switch types, signal aspects and head details are **not** read from the geometry. They come from text near the symbol or stay blank.
* Signal direction (UP/DN) comes from which side the head faces; the convention is east = UP. Check it against the sheet.
* Track-circuit extents are taken from detection ticks and may be approximate; the report flags those.
* Rotated text (route names along diagonal tracks) is not placed yet; it is listed in the report.
* Every heuristic is a rule in one place, so when a new sheet breaks a rule, change the rule or add a config knob there rather than patching one station's JSON.

## Checklist for a new station

1. Run the command; open the viewer, pick the station, press **Whole yard**.
2. Header shows validation: fix any red errors first (usually a track or connection ending in the wrong place; use `touch_eps`, `yardBox`).
3. Compare against the PDF: track count, line names, point numbers, signals per line, axle sections.
4. Read the report; add overrides for what is missing or wrong.
5. Commit the config and the JSON together.
