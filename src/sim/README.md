# Interlocking simulator

Runs a station from its Route Control Chart (RCC). The engine is station neutral; a station is data.

## Add a station
1. Put the RCC workbook in `tools/rcc/source/`, run
   `python3 tools/rcc/xlsx_to_rcc.py <xlsx> <CODE> src/sim/data/<code>.rcc.json [patches.json]`
   (add an `rcc:<code>` script to package.json like `rcc:jrt`). OCR slips found against the PDF go in a patches file, never by hand-editing the JSON.
2. Add `src/sim/data/<code>.sim.json` (see `config/types.ts`): signal post to station signal id, block sections, switch overrides.
3. Open the Simulate button, then the **Checks** tab. It walks every route over the drawing and lists chart/drawing mismatches. Fix the data or the drawing until it is quiet.

## What the chart parser accepts (so most charts need no code change)
The parser reads shapes, not a particular station's wording. Punctuation and spacing may differ between charts.
- **Route names**: `[C|SH|S][number][letters]` or `SLOT[number]`. `1A`, `C-1A`/`C1A` (calling-on), `SH42B` (shunt), `42A`, `17`/`S17` (starter), `SL71`/`SLOT- 71` (slot / interslotting row, kind `slot`, no signal, not walked). The signal post is the number; calling-on and shunt routes share the post of their main or starter signal.
- **Lock lists**: any mix of `1B/C`, `C-1A/B`, `42A 42B`, `SH4C/D`, `SLOT-71`, `(1A SET TO M/L)`.
- **Destination**: `S11`, `S-25`, `SS19`, `SH9` give the post number. A signal of another cabin (`S6 OF 'F' CABIN`, `SH18 OF 'E' CABIN`, `S15 OF VPT R&D YARD`) gives `<number>@<first word of the place>`: `6@F`, `18@E`, `15@VPT`. Anything else (`DE`, `SB`, a block section home) is an external stop point; a walk that runs out of track there has arrived.
- **Controls**: `CH1IN. CH2IN.` or `CH3. CH4.`; `CONT.37 IN`.
- **Track circuits**: dot- or space-separated, `OR` for either-of, `(144XT)` in brackets is ignored, hyphens stay in the code (`BULB-XT`).
- **Remarks**, numbered (`1.… 2.…`) or bullets joined by `.. `: `X IS RED` / `X & Y ARE RED` (red lamp proved), `X IS LIT` (lamp proved), `X RED LAMP PROTECTION`, `FLY BACK [TO ON] AFTER n SEC ON OCCUPATION OF <tc | REPLACEMENT TRACK>`, `RELEASES AFTER n SEC ON CLEARANCE`, `TWO MIN`, `CLEARS AFTER n SECONDS|MINUTES ON OCCUPATION OF <tc>`, `REQUIRES TGT|LC OF TLBI|DLBI FOR SEC: (X-Y)`.
- Post keys in `<code>.sim.json` are exactly those numbers (and the `@` form for other cabins). Slot rows need no entry.
Grammar tests: `src/sim/__tests__/parse.test.ts`. Something a new chart writes differently: add a case there first, then widen the reader.

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
