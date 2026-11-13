#!/usr/bin/env python3
"""Extract a Route Control Chart (RCC) workbook into the raw RCC JSON the simulator reads.

    python3 tools/rcc/xlsx_to_rcc.py <chart.xlsx> <STATION_CODE> <out.json> [patches.json]
    npm run rcc:jrt            # Jarati, uses the paths in package.json

What it does (and does not do)
------------------------------
* Reads every route row from the "route" sheets (the ones with the 1..18 column-number row)
  and the point / crank-handle control charts.
* Cleans OCR damage in the text (CHSIN -> CH5IN, OV1  13 -> OV1_13, 5H3 -> SH3 ...).
* Keeps every cell as TEXT. Meaning (points, track circuits, lock lists, timers) is decided in
  TypeScript (`src/sim/rcc/parse.ts`), so a hand-edited JSON works exactly like an extracted one.

The extraction is column-number driven: the chart prints the numbers 1..18 above the columns, and
each sheet is mapped through that row, so merged cells and shifted layouts do not matter.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

COLS = {
    1: "sl", 2: "sig", 3: "route", 4: "dest", 5: "vdu",
    6: "ptsRoute", 7: "ptsOverlap", 8: "isolation",
    9: "tcRoute", 10: "tcOverlap", 11: "controls",
    12: "approach", 13: "backLock", 14: "ovCleared", 15: "ovOccupied",
    16: "locksRoutes", 17: "locksOverlaps", 18: "remarks",
}

OCR_FIXES = [
    (re.compile(r" "), " "),
    (re.compile(r"\bCHSIN\b"), "CH5IN"),
    (re.compile(r"\bCH(\d)\.IN\b"), r"CH\1IN"),
    (re.compile(r"CONT[-.]\s*(\d+)\s*IN"), r"CONT.\1 IN"),
    (re.compile(r"\bCONT-(\d+)IN\b"), r"CONT.\1 IN"),
    (re.compile(r"\bSETTO\b"), "SET TO"),
    (re.compile(r"\bOV(\d)\s+(\d+)\b"), r"OV\1_\2"),
    (re.compile(r"\bOV(\d)-(\d+)\b"), r"OV\1_\2"),
    (re.compile(r"\bOV-(\d+)\b"), r"OV_\1"),
    (re.compile(r"\bOV(\d{2})\b(?!_)"), r"OV_\1"),
    (re.compile(r"\b5H(\d)"), r"SH\1"),
    (re.compile(r"\bDELA1\b"), "DELAY"),
    (re.compile(r"\bC-(\d[ABC])"), r"C-\1"),
]


def norm(value, keep_lines: bool = False) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r", "")
    for pattern, repl in OCR_FIXES:
        text = pattern.sub(repl, text)
    if keep_lines:
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
        return "\n".join(ln for ln in lines if ln)
    return re.sub(r"\s+", " ", text).strip()


def find_number_row(ws) -> tuple[int, dict[int, int]] | None:
    """Row whose cells hold 1,2,3.. (the printed column numbers). Returns row and {number: column index}."""
    for r in range(1, min(ws.max_row, 10) + 1):
        found: dict[int, int] = {}
        for c in range(1, ws.max_column + 1):
            v = ws.cell(r, c).value
            if v is not None and re.fullmatch(r"\d{1,2}", str(v).strip()):
                found[int(str(v).strip())] = c
        if all(n in found for n in (1, 2, 3, 6, 9, 16, 18)):
            return r, found
    return None


def extract_routes(ws) -> list[dict]:
    located = find_number_row(ws)
    if not located:
        return []
    header_row, colmap = located
    rows = []
    last_sl = 0
    for r in range(header_row + 1, ws.max_row + 1):
        sl = ws.cell(r, colmap[1]).value
        route = ws.cell(r, colmap[3]).value
        sig = ws.cell(r, colmap[2]).value
        has_sl = sl is not None and re.fullmatch(r"\d+", str(sl).strip())
        # A scanned chart can lose the serial number (Jarati C1B). Accept the row when it has a route and a signal,
        # and number it after the previous row.
        if not has_sl and not (route and sig and str(route).strip()):
            continue
        row = {"sheet": ws.title, "excelRow": r}
        for number, key in COLS.items():
            col = colmap.get(number)
            raw = ws.cell(r, col).value if col else None
            row[key] = norm(raw, keep_lines=(key in ("vdu", "route")))
        row["sl"] = int(row["sl"]) if has_sl else last_sl + 1
        row["slInferred"] = not has_sl
        last_sl = row["sl"]
        rows.append(row)
    return rows


def find_text(ws, pattern: str, max_row: int = 8):
    rx = re.compile(pattern, re.I)
    for r in range(1, min(ws.max_row, max_row) + 1):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(r, c).value
            if v is not None and rx.search(str(v)):
                yield r, c


def extract_point_chart(ws) -> list[dict]:
    hits = lambda p: list(find_text(ws, p))
    c_point = next((c for _, c in hits(r"POINT\s*NO")), None)
    c_ch = next((c for _, c in hits(r"CRANK\s*HANDLE")), None)
    c_tc = next((c for _, c in hits(r"TRACK\s*CIRCUIT")), None)
    on_route = sorted(c for _, c in hits(r"^ON\s*ROUTE$"))
    on_overlap = sorted(c for _, c in hits(r"^ON\s*OVERLAP$"))
    if not (c_point and c_ch and c_tc and len(on_route) == 2 and len(on_overlap) == 2):
        raise SystemExit(f"point chart layout not recognised in {ws.title}")
    out = []
    for r in range(1, ws.max_row + 1):
        point = norm(ws.cell(r, c_point).value)
        if not re.fullmatch(r"\d+[AB]?(/[AB])?", point):
            continue
        out.append({
            "point": point,
            "crankHandle": norm(ws.cell(r, c_ch).value),
            "tcs": norm(ws.cell(r, c_tc).value),
            "normalRoutes": norm(ws.cell(r, on_route[0]).value),
            "normalOverlaps": norm(ws.cell(r, on_overlap[0]).value),
            "reverseRoutes": norm(ws.cell(r, on_route[1]).value),
            "reverseOverlaps": norm(ws.cell(r, on_overlap[1]).value),
        })
    return out


def extract_handle_chart(ws) -> list[dict]:
    hits = lambda p: list(find_text(ws, p))
    c_ctrl = next((c for _, c in hits(r"CONTROL\s*NO")), None)
    c_routes = next((c for _, c in hits(r"^ROUTES$")), None)
    c_over = next((c for _, c in hits(r"^OVERLAPS$")), None)
    c_pt = next((c for _, c in hits(r"CONTROL\s*POINT")), None)
    if not (c_ctrl and c_routes and c_over and c_pt):
        raise SystemExit(f"handle chart layout not recognised in {ws.title}")
    out = []
    for r in range(1, ws.max_row + 1):
        ctrl = norm(ws.cell(r, c_ctrl).value)
        if not re.match(r"^(CH\d|CONT\.\d+)", ctrl):
            continue
        out.append({
            "control": ctrl,
            "routes": norm(ws.cell(r, c_routes).value),
            "overlaps": norm(ws.cell(r, c_over).value),
            "points": norm(ws.cell(r, c_pt).value),
        })
    return out


def apply_patches(routes: list[dict], patch_file: Path) -> list[dict]:
    """Manual corrections verified against the scanned drawing. Each must match the extracted value exactly."""
    patches = json.loads(patch_file.read_text(encoding="utf-8"))["patches"]
    by_sl = {r["sl"]: r for r in routes}
    for p in patches:
        row = by_sl[p["sl"]]
        if row[p["field"]] != p["from"]:
            raise SystemExit(f"patch for row {p['sl']} {p['field']} expects {p['from']!r} but the extract has {row[p['field']]!r}; "
                             "the workbook changed, re-check the patch")
        row[p["field"]] = p["to"]
    return patches


def main() -> None:
    if len(sys.argv) not in (4, 5):
        raise SystemExit(__doc__)
    src, code, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    patch_file = Path(sys.argv[4]) if len(sys.argv) == 5 else None
    wb = openpyxl.load_workbook(src, data_only=True)
    routes: list[dict] = []
    point_chart: list[dict] = []
    handle_chart: list[dict] = []
    for ws in wb:
        title_cells = re.sub(r"\s+", " ", " ".join(str(ws.cell(1, c).value or "") for c in range(1, ws.max_column + 1)).replace("\xa0", " ")).upper()
        if "CRANK HANDLE" in title_cells and "CONTROL CHART" in title_cells:
            handle_chart = extract_handle_chart(ws)
        elif "POINT CONTROL CHART" in title_cells:
            point_chart = extract_point_chart(ws)
        else:
            routes.extend(extract_routes(ws))
    routes.sort(key=lambda r: r["sl"])
    applied = apply_patches(routes, patch_file) if patch_file else []
    doc = {
        "station": code,
        "source": {"file": src.name, "note": "OCR-cleaned by tools/rcc/xlsx_to_rcc.py; review residual typos with the validator"},
        "patches": applied,
        "routes": routes,
        "pointChart": point_chart,
        "handleChart": handle_chart,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{code}: {len(routes)} routes, {len(point_chart)} points, {len(handle_chart)} handle controls -> {out}")


if __name__ == "__main__":
    main()
