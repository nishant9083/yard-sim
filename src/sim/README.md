# Interlocking simulator

Runs a station from its Route Control Chart (RCC). The engine is station neutral; a station is data.

## Add a station
1. Put the RCC workbook in `tools/rcc/source/`, run
   `python3 tools/rcc/xlsx_to_rcc.py <xlsx> <CODE> src/sim/data/<code>.rcc.json [patches.json]`
   (add an `rcc:<code>` script to package.json like `rcc:jrt`). OCR slips found against the PDF go in a patches file, never by hand-editing the JSON.
2. Add `src/sim/data/<code>.sim.json` (see `config/types.ts`): signal post to station signal id, block sections, switch overrides.
3. Open the Simulate button, then the **Checks** tab. It walks every route over the drawing and lists chart/drawing mismatches. Fix the data or the drawing until it is quiet.

## Layout
- `rcc/` chart text to typed rows (`parse.ts`), `config/` per-station extras, `validate/` chart vs drawing checks
- `engine/network.ts` track graph: points, track circuit pieces, signals on the drawing; `engine/simulation.ts` interlocking, field and trains
- `ui/` overlay on the SIP canvas and the panels; `registry.ts` finds stations by file name

## Rules taken from the RCC row
Point positions (route, overlap, isolation) and crank handles; clear route and overlap circuits; lock-outs (routes and overlaps); lamp protection; block contacts; fly-back (circuit and delay); calling-on timer; back locking and the release delay; overlap release (stopping train, through train, timer).

## Signal aspects
Lamp symbols are read as: vertical bar = red, slash = yellow, horizontal bar = green (filled = green on a distant, yellow elsewhere). A stop signal cleared by a main route shows yellow, or green when it has a green lamp, the route is straight and the signal ahead is off. A diverging route lights the route indicator. Distants show yellow / double yellow / green after the home. Calling-on and shunt leave the main aspect red and light their own lamp (shunt: two whites, level at ON, inclined at OFF). Trains pass a shunt or calling-on signal at 15 km/h; a train running under a main signal is not stopped by an independent shunt signal at ON; nothing stops at a distant.

## Page
The simulator is its own page, `#/simulate/<CODE>`, opened from the viewer's Simulate button. The clock starts with the first route or train (or Start).

## Assumptions to confirm
Approach locking holds 120 s on cancel when a train is in the approach (`DEAD APPROACH`); emergency release uses the same time. Overlap timer 120 s. A signal that fell back on a fault needs a new request unless `autoReclear` is on. UN vs UN1 is read but does not change behaviour yet.

Tests: `npm test`. Scenarios can be saved and replayed from the toolbar (deterministic, 0.1 s tick).
