# SIP PDF to station JSON

`tools/sipx` reads a Signal Interlocking Plan and writes the station JSON the viewer and simulator load.
One command for every kind of sheet; it decides how to read it and which engine to use:

| The sheet is | Reader | Tested on |
|---|---|---|
| Vector PDF with real (selectable) text | `pdfio.py` | Jarati, Gonpura |
| Vector PDF whose text is drawn as lines (AutoCAD stroke/SHX fonts; nothing selectable) | `pdfio.py` + `stroketext.py` (OCR of the redrawn strokes) | Armori |
| Scan, photo or image-only PDF (also `.png/.jpg/.tif`) | `raster.py` (image processing + OCR) | Gonpura and Armori turned into 200 dpi image-only PDFs |

| The drawing is | Engine |
|---|---|
| Yard along the sheet, standard SIP symbols (signal posts with arrows, lamps, IJ ticks, captions) | `cad` (this folder) |
| Plain schematic: 45-degree ladders, everything in one pen, no signal posts (Waltair RYD/CYD) | `schematic` (`tools/sipx_schematic`, vector with real text only) |

With `--engine auto` (the default) the CAD engine runs first; if it finds no turnouts or no signals the schematic
engine is tried too and the richer result is kept. The console line and the report say which reader and engine were used.

## What each reader can get, honestly

* **Vector with text**: everything this document lists. Use these whenever the drawing office can supply them.
* **Vector with stroke text**: the same line work and symbols, exactly; text is OCR, so a few captions are misread or
  missing (on Armori about 85% of yard captions come through; signal names next to struck-through heads are often lost).
  Letters drawn identically are clustered and vote on what they are, so a letter read well once is read well everywhere.
* **Scan**: line work is rebuilt from pixels, so it is approximate. On the simulated Gonpura scan the main lines, most
  legs, signals with lamps, track-circuit captions, tables and notes come through; turnout heels, insulated joints,
  shunt discs and point numbers are weak. Expect to correct by hand. 300 dpi, straight, clean scans do best.

## Use

```bash
pip install -r tools/sipx/requirements.txt          # once
sudo apt install tesseract-ocr                       # once, only needed for stroke-text sheets and scans

# 1. extract
npm run sip:extract -- path/to/plan.pdf --code GNPR --out src/sip/data/gnpr.json

# 2. check by eye: what was found, drawn on top of the sheet itself
npm run sip:overlay -- path/to/plan.pdf tools/out/gnpr_overlay

# 3. read the to-do list
cat tools/reports/gnpr.report.json
```

`--name "Gonpura"` sets the display name (otherwise the title block's STATION value is used).
`--engine cad|schematic` forces an engine, `--raster` reads a vector sheet as a picture, `--dpi 300` sets scan resolution.
In a config file the same switches are `"engine"`, `"raster"`, `"dpi"`, and `"strokeText": true|false|"auto"`.
`--config tools/stations/<code>.json` adds tuning and hand corrections (see "Corrections").
If you have a hand-checked JSON of the same sheet, `npm run sip:score -- extracted.json reference.json` lists every difference.

## What it relies on

Nothing depends on colour, layer names or line weights chosen by the draughtsman. Every rule is about shape,
position and the standard captions.

| Thing | How it is recognised |
|---|---|
| Rail | A long line that carries a track-circuit caption (`3T`, `31/33T`, `C12T`, `URXT`) is rail. Any line or curve whose end lands on rail is rail too. A line is never rail if it ends in an arrow head (dimension), turns a square corner (platform or box edge), is steeper than 42 degrees (leader, bridge mark) or only runs parallel beside a rail. |
| Running line vs link | A flat line is a track. A curve or slanted line with both ends on tracks is a connection (turnout leg or crossover). A slanted line with a free end is a siding. Pieces that meet end to end across a break mark are one track. |
| Junction | Where a leg lands on a line. Legs are drawn starting beside the line (a gap or a small heel hook); the junction is slid back along the line so the leg leaves at a slant, never past an insulated joint. |
| Insulated joint | A short heavy tick square across a rail (on tracks and on legs). |
| Signal | An arrow head whose tip stands on a rail, square to it. Its wire is followed to the head. Lamp = circle about 6 to 7 pt radius: slash, upright bar, level bar, or solid. Marker = a letter (P, C, B) in a small circle or on the wire. Calling-on = small crossed circle in an oval. Shunt = quarter disc with two small circles. Route indicator = slanted arms past the last lamp. Elements are listed from where the wire arrives. |
| Signal name | The nearest caption shaped like a signal number (`S-03`, `SH-103`, `C-12`, `1A/B/C`, `UP DIST`). On sheets that write `S-03`, bare numbers are left for points. |
| Signal kind | Shunt disc only = shunt. P marker or `D-`/DIST = distant. Calling-on or route indicator = home. B marker = advanced starter. Otherwise starter. If an aspect chart names the signals (HOME, MAIN STR., ADV. STR), that wins. |
| UP / DN | Odd number = UP, even = DN. |
| Point | One at each end of every connection. Number = nearest free label at the heel. Switch angle = the `1 IN 8.5 (SS)` caption lying along that leg, else the list or default in the notes. Crank handle = the table that lists points against `CH1..`. A point listed in that table but drawn without a second leg (trap) is placed on the rail beside its number. |
| Track circuit | Each caption grows along the rails, through points, until an insulated joint or a line end. If two captions meet with no joint between them, the rail is split half-way and both are marked `approx`. |
| Chainage scale | A straight-line fit through every printed `CH:` caption (46 on Gonpura, error under 2 m). So a plot that is not exactly 1:1000 still gives right chainages. |
| Line names | `LINE No. n` caption, the name on the same row, and `CSL / CSR / CAL` captions, each given to the nearest line. |
| Platforms, buildings | A caption with PLATFORM / BUILDING / ROOM / GOOMTY and the box drawn round it. Length and width are read from the caption. |
| Bridges, gradient posts, chainage captions | Caption blocks containing `BR. NO.`, slanted gradient values beside a `CH:` caption, and upright `CH:` captions. |
| Dimensions | Two arrow heads facing away from each other on one line, with a length between them. |
| Tables, notes, aspect charts, title block | Ruled grids read cell by cell; numbered lines under a NOTES heading; the box titled ASPECT CONTROL CHART; label and value pairs (ZONE, DIVISION, STATION, plan number, scale). |

## Stages (tools/sipx)

`pdfio.py` primitives from the PDF (strokes, circles, arcs, arrow heads, boxes, dots, text)  
`stroketext.py` text drawn as strokes: group letters into lines, redraw each line, OCR, letter-shape voting  
`raster.py` scans: ink mask, OCR (level and upright, then a second pass on letter-sized ink), long straight lines by morphology, solid blobs (arrows, dots, boxes), lamps by Hough + coverage check, the rest by skeleton tracing  
`tracks.py` which lines are rail  
`network.py` nodes, tracks, connections  
`symbols.py` joints, signals, points  
`circuits.py` track-circuit limits  
`furniture.py` names, platforms, bridges, chainage, dimensions, loose text  
`info.py` tables, notes, charts, title block  
`run.py` ties it together; `overlay.py` and `score.py` are for checking; `overrides.py` applies corrections  
`patterns.py` every caption pattern in one place

## How the stroke-text and scan readers stay generic

Both produce the very same primitives as the vector reader (strokes, circles, arrow heads, words), so every rule
below them is shared and a fix to a rule helps all three kinds of sheet. Rules that were tightened for these sheets
and apply everywhere: a dimension line's arrow points along it (a signal arrow stands square to the rail); a table
rule is boxed in by uprights and has a twin row; a line through a lamp is a strike-through, not a rail; the station is
one connected network; a joint can be one tick or two stubs either side of the rail; a signal can also be found from
its lamps and post when the foot arrow is missing; `SIG NO.D01` reads as `D01`; the chainage fit drops misread captions.

## Result on the test sheets

Jarati, against the hand-checked data (`tools/out/jrt.score.txt`): 18 of 18 signals, 17 of 17 points with angles and crank
handles, 30 of 30 track circuits, all 23 reference joints plus 7 the hand data lacked. The one signal that differs (15)
and the circuit limits that differ (L4T1 to L4T3, marked approximate in the hand data) are right in the extracted file.

Gonpura: 5 lines, 7 crossovers and turnouts, 18 signals, 14 points, 32 track circuits, 37 joints, 2 platforms, 11 bridges,
10 tables, both aspect charts. The viewer reports the model valid.

Armori (stroke text, about 35 s): main, loop, hot axle siding; crossovers 31 and 41 with crank handles CH1/CH2 and 51B (CH51);
13 signals, 10 track circuits, 18 joints, 7 tables, 22 notes, chainage scale fitted from OCR'd captions (0.3525 m/pt).
Missing: about half the signals (several heads are struck through as defunct, some names unread), the overrun legs.

Waltair RYD/CYD (auto picks the schematic engine): 51 lines, 15 links, 145 signals, 63 points, 96 sections.

Gonpura as a 200 dpi image-only PDF (about 2.5 min): 16 line pieces (should be 5), 3 links, 12 signals, 20 track
circuits, 9 tables, 33 notes; no joints. This is the floor to expect from a scan.

## Corrections

Put them in `tools/stations/<code>.json` and pass `--config`, so they survive a re-run. Coordinates are sheet points.

```json
{
  "code": "XYZ", "name": "Example", "yExaggeration": 4,
  "ends": { "west": "ABC end", "east": "DEF end" },
  "tracks": { "link_reach": 13, "max_slope_deg": 42, "min_rail_len": 45 },
  "overrides": {
    "tracks": { "L3": { "name": "UP MAIN LINE", "direction": "UP" } },
    "signals": { "S-03": { "kind": "home" } },
    "points": { "54B": { "ratio": "1 IN 12", "switch": "CS" } },
    "drop": { "signals": ["?3"] },
    "add": { "signals": [ { "id": "SIG_X", "code": "X", "...": "..." } ] }
  }
}
```

## Limits

* Stroke text and scans depend on OCR (tesseract). Hindi captions are not read.
* On mixed sheets (real text plus some stroke text, like Gonpura's `120m(MIN)` dimensions) the stroke part is not read;
  set `"strokeText": true` in the config to force it.
* The schematic engine reads vector sheets with real text only.
* The yard must be drawn along the sheet in one row. A yard split over two rows, or a schematic with 45 degree
  ladders (Waltair), is not handled here; `tools/sipx_schematic` is the older extractor for that style.
* Diamond crossings and slips are drawn but not modelled as such.
* A starter cannot be told from an advanced starter by shape alone; without a B marker or an aspect chart it is `starter`.
* A point with no angle caption and no rule in the notes is reported (`pointsWithoutAngle`).
* Signal aspects, route tables and interlocking logic are not on the SIP; they come from the RCC.
* Tables with merged cells can come out with shifted columns.
* Always look at the overlay once. The report lists what the script knows it could not place; it cannot list what it never saw.

## When a new sheet breaks a rule

1. Run the overlay and find the first thing that is wrong.
2. If it is a naming habit (a new caption format), add it to `patterns.py`.
3. If it is a size or distance, it is a field of `Params` in `tracks.py`; try it from the config first.
4. Add the sheet's hand-checked JSON as a reference and keep `sip:score` clean for every sheet you have.
