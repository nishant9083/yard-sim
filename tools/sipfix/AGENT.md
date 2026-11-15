---
name: sip-fixer
description: Checks a station JSON made by tools/sipx against its Signal Interlocking Plan PDF and corrects it by hand until it is a faithful copy of the SIP. Use when given an extracted station JSON (or a SIP PDF to extract first) that must be made complete and correct.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# SIP fixer

You turn an automatically extracted station JSON into a correct, complete copy of the Signal Interlocking Plan (SIP).
The PDF is the only source of truth. The extractor got most of the drawing right; your job is to find what it got
wrong or missed, by looking at the sheet, and fix the JSON.

## Inputs and outputs

You are given:

* `PDF`: the SIP sheet.
* `JSON`: the extractor's output, normally `tools/out/<code>.extracted.json`. If you only have the PDF, make it first:
  `python3 tools/sipx/run.py PDF --code XXX --name "Name" --out tools/out/xxx.extracted.json`
* `tools/reports/<code>.report.json`: what the extractor itself knows it could not do. Start your to-do list from it.

You produce:

* `src/sip/data/<code>.json`: the corrected station. The viewer picks up every JSON in that folder.
* `tools/stations/<code>.fixlog.md`: what you changed and why, and a final **Unresolved** list of anything you could not
  read or decide. Someone will read this list, so make each entry specific (where on the sheet, what is unclear).

Work on a copy (`cp JSON tools/out/<code>.work.json`), save a numbered backup before each stage
(`<code>.work.1.json`, ...), and copy the finished file to `src/sip/data/` at the end.
Never re-run the extractor over a file you have corrected: it would throw your work away.

## Ground rules

1. **Never invent.** Everything in the JSON must be visible on the sheet, or follow from a rule printed on it
   (a note such as "ALL POINTS ARE 1 IN 12 (TWS)"). If you cannot read something, leave the best reading,
   and put it in the Unresolved list. Do not fill gaps from what is "usual" at Indian Railways stations.
2. **Exact text.** Codes are copied as printed (`S-03`, `SH103`, `31A`, `C12T`), with the OCR errors removed:
   on drawings `0`/`O`/`Ø`, `1`/`I`, `5`/`S`, `8`/`B`, `2`/`Z` are easily confused; decide from context
   (signal and circuit numbers are digits, prefixes are letters).
3. **JSON coordinates only.** All positions are drawing points with y growing downward. They equal sheet points
   minus `meta.sheet.offset`. The helper tools take and print JSON coordinates, so you never convert by hand.
4. **Positions come from the drawing, not from the picture.** Read a position off the ruler of a `view` image only
   to find the area, then take the exact value from `prims` (vector sheets). On scans, the ruler is all there is:
   read it at zoom 4 or more and round to 0.5 pt.
5. **Small, checked steps.** After every stage run `check` and render the area you touched.
6. **Keep ids stable** and follow the conventions below, so references between objects stay valid.

## Tools

All in `tools/sipfix/sipfix.py` (Python 3, PyMuPDF and Pillow; `--ocr` also needs tesseract):

| Command | What it gives you |
|---|---|
| `summary JSON` | Every track (x range, y), connection, signal, point, track circuit and joint in one listing. Read it first. |
| `check JSON` | Errors (the viewer will reject or misdraw), warnings, and to-dos (gaps that are probably extraction misses). Exit code 1 while errors remain. |
| `tiles JSON PDF --out DIR [--width 500] [--plain]` | The whole yard cut into images, current JSON drawn over the sheet. `--plain` gives the sheet alone. |
| `view JSON PDF --x0 A --x1 B [--y0 C --y1 D] [--zoom Z] [--plain] --out F.png` | One window. The grid is labelled in JSON coordinates. Narrow windows (150 to 400 pt) are needed to read small captions. |
| `prims JSON PDF --x0 --x1 --y0 --y1 [--what ticks,arrows,circles,lines,text]` | The vector primitives in a box, with exact JSON coordinates: joint ticks, arrow tips, lamp circles, lines, real text. |
| `text JSON PDF --find REGEX [--ocr]` | Where a caption is. Without `--ocr` only real (selectable) text; with `--ocr` also text drawn as strokes (slow). |
| `near JSON X Y [--r 40]` | The rail at a point (and its y at that x), and every node, signal, point, joint and circuit near it. |

Look at images with the Read tool. Overlay colours: tracks blue with their id, connections green, nodes as rings
(magenta junction, black boundary, dark red buffer stop) with their id, joints orange ticks, track circuits cyan bars
with their code (`~` = approximate), signals black dot at the foot with `code kind direction >|< elements`,
points magenta `code ratio switch crankHandle`.

Edit with short Python scripts (load, change, `json.dump(st, open(path, "w"), indent=1)`), not by hand-editing
thousands of lines. Keep the scripts out of the repository (use a scratch folder).

## The station JSON (src/sip/model/types.ts, assets.ts, info.ts)

```
meta: code, name, zone, sipRef, coordinateSpace, ends {west, east}, chainage {originX, metresPerUnit, label, origin},
      scale {horizontal, vertical}, viewHints {yExaggeration}, sheet {pdf, page, offset}
nodes[]:       {id "N001", x, y, kind: boundary | bufferStop | sandHump | junction | plain, label?}
tracks[]:      {id "L1".."Ln" running lines, "T01".. others; name, lineNo?, kind: main | loop | siding | overrun,
                direction: UP | DN | BOTH, nodeIds[] ordered by x, remarks?}
connections[]: {id "C<point no>", kind: crossover (two running lines) | turnout (to a siding/overrun/loop leg),
                from nodeId, to nodeId, via?: [{x,y}] shape points, label?}
assets.points[]:  {id "P31A", code "31A", nodeId (the junction node at the toe), connectionId, ratio "1 IN 12",
                   switch "CS"|"SS"|"TWS"|"", ratioInferred (true when the ratio comes from a note), control (number),
                   crankHandle? "CH1", label {x,y} (where the number is printed)}
assets.signals[]: {id "SIG_<code>", code, fullCode?, name, kind: signal|distant|home|starter|advancedStarter|shunt,
                   direction UP|DN, trackId, footX (x where the post meets the rail = arrow tip), anchorX (x where the wire
                   meets the head), side above|below (of the rail), headDir east|west (the head is drawn to the right|left
                   of the post), elements[] listed from the wire outward, control?, label? {x,y}}
   elements: {kind:"lamp", style: slash|vbar|hbar|solid} | {kind:"marker", text:"P"|"C"|"B"|...} | {kind:"callingOn"}
           | {kind:"routeIndicator"} | {kind:"shunt", text?}
assets.joints[]:  {id "IJ_<track>_<x rounded>", trackId, x}       (joints on a connection: assets.connectionJoints {connectionId, x, y})
assets.trackCircuits[]: {id "TC_<code>", code, kind trackCircuit|axleCounter, spans [{trackId, x0, x1} | {connectionId}],
                   label {x,y}, approx (true if a limit is not a printed joint), text?}
assets: platforms, structures, bridges, chainageMarks, gradients, dimensions, routeLabels, annotations, breaks
info:   titleBlock [{label,value}], lines, legend, notes [{no,text}], tables [{id,title,columns,rows}], procedures,
        aspectCharts [{direction,title,signals[{name,code}],gaps,rows}], revisions
```

Structural rules (`check` enforces them): every id unique; a track has at least 2 nodes, ordered so x only rises;
only a track's first and last node may be `boundary`/`bufferStop`/`sandHump`; both ends of a connection are nodes that lie on
tracks; a node where a connection starts must be in the track's `nodeIds` (insert it in x order); every signal,
joint and span refers to an existing track and lies within its x range; span `x1 > x0`; the yard is one connected
graph. If you add or move a node on a sloping track, compute its y on the line between its neighbours.

## Reading the sheet

Use the conventions of the Indian Railways SIP (see "Handbook on Signalling Symbols & Terminology" if it is
available to you) and of the sheet's own legend, which wins.

* **Running lines** are the long horizontal lines; their name is printed at the line (`MAIN LINE`, `LOOP LINE`,
  `LINE No. 3`, `CSL ...`). Sidings, overrun lines and trap legs end in a buffer stop or a short end.
* **Turnouts and crossovers**: slanted legs between lines. Each leg end on a running line is a point; the number
  is printed near the toe (`31A`, `31B`). Ratio and switch type are printed along the leg (`1 IN 12 (CS)`) or given
  by a note. Crank handles come from the crank-handle table (`CH1: 31A/B, 41A/B`).
* **Insulated joints**: short ticks square across the rail. Track circuits run from joint to joint; the code is
  printed above or below the rail between them (`02AT`, `41BT`), sometimes with a relay reference underneath
  (`(5RL)`), which is not part of the code. A circuit can extend over a crossover leg: add `{connectionId}`.
* **Signals**: a post stands on the rail (arrow tip on the rail, or a short stem), a wire runs along beside the rail
  to the head. Read the elements outward from the wire: lamps (circle with slash / upright bar / level bar / solid),
  marker letters in small circles (`P` permissive/distant, `C`, `B`), calling-on (small circle with a cross inside an
  oval), route indicator (slanted arms past the last lamp), shunt (quarter disc with two small circles).
  Name: the caption nearest the head (`SIG NO.D02` is code `D02`; `S/C02B` style names keep their slash).
  Kind: shunt disc only = shunt; `DIST`/`D`/P marker = distant; with calling-on or route indicator = home; B marker =
  advanced starter; otherwise starter, unless the aspect chart or caption names it (`HOME`, `MAIN STR`, `ADV STR`,
  `INN DIST` = distant). Direction: the sheet's own UP/DN arrows decide; on most sheets odd numbers are UP and even DN.
  A struck-through or "TO BE REMOVED" signal: keep it only if the SIP still shows it as existing; note the decision.
* **Chainage**: `CH: 550.000m` captions and bridge blocks (`BR. NO 56`). If `meta.chainage` is missing or the fit was
  poor (report `chainageFit`), refit it: metresPerUnit = (CH_b - CH_a) / (x_b - x_a) from two far-apart captions on
  the same side of the centre line, originX where the chainage is 0 (station centre).
* **Title block, notes, tables**: compare `info` with the sheet text. Correct OCR errors in notes and table cells;
  add missing rows. `meta.ends.west/east` are the neighbouring stations printed at the two ends (`TO WADSA`).

## Procedure

Work in this order: later stages depend on the earlier ones being right.

**0. Triage.**
`summary`, `check`, read the report, then make `tiles` twice (with overlay, and `--plain`) and look at every tile.
Write down the inventory of the sheet as you see it: number of running lines, turnouts, signals (count the posts),
points, track-circuit captions, joints. That inventory is the target the final JSON must match.

**1. Meta and info.** Code, name, zone, division, plan number, ends, scale. Fix notes and table text.

**2. Track skeleton.** For every tile: is every drawn rail present, joined at the right places, and nothing extra
(a dimension line, table rule or platform edge taken for rail)? Fix node order (x must rise), missing or extra
tracks, legs that end at the wrong line, sidings cut short, wrong `kind`/`name`/`lineNo`/`direction`.
The graph must end up connected. Run `check`.

**3. Points.** One per toe of every turnout leg; codes, ratio, switch, crank handle, `ratioInferred` when it comes from a note.

**4. Joints.** For each rail, list the ticks with `prims --what ticks` along the rail's y (±8 pt). A joint is a tick
crossing the rail; a dimension or leader end is not. Add missing, remove false ones, use exact x.

**5. Signals.** For each post (left to right): `view` a 200 to 300 pt window at zoom 4 or more, read code, elements,
side, head direction; `prims --what arrows,circles` for exact `footX` (arrow tip x) and `anchorX`. Fix or add.
New signals copy the shape of an existing one; `label` is the centre of the printed name.

**6. Track circuits.** Every caption on the sheet becomes one circuit; its span runs between the joints that bound
the caption. Remove circuits that are not on the sheet; fix codes; set `approx: true` only where a limit is not a
drawn joint. `check`'s `trackCircuit.gap` lines show rail not in any circuit; that is right only where the sheet
really leaves it unlabelled (say so in the log).

**7. Other assets.** Platforms, bridges, chainage marks, gradients, structures: fix what is clearly wrong,
add what is clearly missing. These are lower priority than stages 2 to 6.

**8. Verify.**
* `check`: 0 errors. Every remaining warning or to-do is either fixed or explained in the log.
* Fresh `tiles` with the overlay; look at every tile once more against the sheet.
* Compare `summary` counts with your inventory from stage 0.
* If the project builds: `npx tsc -b` must pass and the station must load in the viewer (`npm run dev`).
* Write the fix log, then copy the work file to `src/sip/data/<code>.json`.

## Sheet types

* **Vector, real text** (`report.reader` = `vector`): `text` and `prims` give exact text and positions. Fastest case.
* **Vector, stroke text** (`vector+stroke-text`): positions from `prims` are exact, but text exists only as drawing.
  Read captions from `view` images at zoom 4 to 6; `text --ocr` finds where a caption is but may misspell it.
* **Scan** (`raster`): `prims` has nothing useful; every position is read from the image grid at high zoom.
  Expect more work on the skeleton and joints, and say in the log that positions are from the image.
* **Schematic engine** (`report.engine` = `schematic`, 45-degree ladder drawings): same JSON, same procedure;
  signals there are drawn as simple heads with no post, so `footX` is the x of the head's nearest rail point.

## Fix log format

```markdown
# <CODE> <Name>: corrections to the extracted SIP
Source: <pdf file>, extracted <date>, fixed <date>.
Inventory on the sheet: <n> lines, <n> turnouts, <n> signals, <n> points, <n> track circuits, <n> joints.
Final JSON: same counts, or explain each difference.

## Changes
- Skeleton: L2 node order fixed (N001 at x 215.8 was before N002 at x 40) ...
- Signals: ?4 at L2 x 598.1 is ID02 (DN INN DIST), kind distant ...

## Unresolved
- Signal at L2 x 5155.8: name not legible (looks like S27 or S29); left as S27.
```
