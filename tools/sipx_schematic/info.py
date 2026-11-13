"""Notes, tables and title text printed on the sheet (outside the yard)."""
from __future__ import annotations

import re
from collections import defaultdict

from pdfio import Page, Word


def _cluster(vals: list[float], tol: float) -> list[float]:
    out: list[list[float]] = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(c) / len(c) for c in out]


def _join(ws: list[Word]) -> str:
    ws = sorted(ws, key=lambda w: (round(w.cy / 2.5), w.x0))
    return " ".join(w.text for w in ws).strip()


def extract_tables(page: Page, table_edges: list, claimed: set[int]) -> list[dict]:
    words = [w for w in page.words if abs(w.rotation) < 1.0 and id(w) not in claimed]
    tables = []
    for n, es in enumerate(table_edges, 1):
        xs0 = min(p[0] for e in es for p in e.pts)
        xs1 = max(p[0] for e in es for p in e.pts)
        ys0 = min(p[1] for e in es for p in e.pts)
        ys1 = max(p[1] for e in es for p in e.pts)
        H = [(e.pts[0][1], min(e.pts[0][0], e.pts[-1][0]), max(e.pts[0][0], e.pts[-1][0])) for e in es if abs(e.pts[-1][1] - e.pts[0][1]) < 1]
        V = [(e.pts[0][0], min(e.pts[0][1], e.pts[-1][1]), max(e.pts[0][1], e.pts[-1][1])) for e in es if abs(e.pts[-1][0] - e.pts[0][0]) < 1]
        # keep only separators that run most of the way across (drops lines of merged cells)
        ycov: dict[float, float] = defaultdict(float)
        for y, a, b in H:
            ycov[round(y, 0)] += b - a
        xcov: dict[float, float] = defaultdict(float)
        for x, a, b in V:
            xcov[round(x, 0)] += b - a
        rows_y = _cluster([y for y, c in ycov.items() if c >= 0.6 * (xs1 - xs0)], 1.5)
        cols_x = _cluster([x for x, c in xcov.items() if c >= 0.5 * (ys1 - ys0)], 1.5)
        if len(rows_y) < 2 or len(cols_x) < 2:
            continue
        grid = []
        for r in range(len(rows_y) - 1):
            row = []
            for c in range(len(cols_x) - 1):
                cell = [w for w in words if cols_x[c] <= w.cx < cols_x[c + 1] and rows_y[r] <= w.cy < rows_y[r + 1]]
                row.append(_join(cell))
                for w in cell:
                    claimed.add(id(w))
            grid.append(row)
        # title: a first row with a single non-empty cell, or the text just above the box
        title = f"Table {n}"
        while grid and sum(1 for c in grid[0] if c) <= 1:
            t = next((c for c in grid[0] if c), "")
            if t:
                title = t
            grid.pop(0)
            rows_y.pop(0)
        if title == f"Table {n}":
            above = [w for w in words if id(w) not in claimed and rows_y[0] - 14 <= w.cy < rows_y[0] and cols_x[0] - 5 <= w.cx <= cols_x[-1] + 5]
            if above:
                title = _join(above)
                for w in above:
                    claimed.add(id(w))
        if len(grid) < 2:
            continue
        tables.append({"id": f"table{n}", "title": title.title() if title.isupper() else title,
                       "columns": grid[0], "rows": [r for r in grid[1:] if any(r)]})
    return tables


NOTE_MARK = re.compile(r"^(\d{1,2}|[A-Za-z])\.?$")


def extract_notes(page: Page, claimed: set[int]) -> list[dict]:
    words = [w for w in page.words if abs(w.rotation) < 1.0]
    head = next((w for w in words if w.text.strip().upper() in ("NOTES", "NOTE")), None)
    if not head:
        return []
    x_lo = head.x0 - 6
    cand = [w for w in words if w.y0 >= head.y1 - 1 and x_lo <= w.x0 <= head.x0 + 520 and id(w) not in claimed]
    cand.sort(key=lambda w: (round(w.cy / 1.2), w.x0))
    # stop at the first big vertical gap
    lines: list[list[Word]] = []
    for w in cand:
        if lines and abs(lines[-1][0].cy - w.cy) <= 1.2:
            lines[-1].append(w)
        else:
            if lines and w.cy - lines[-1][0].cy > 14:
                break
            lines.append([w])
    notes: list[dict] = []
    first_x = min(l[0].x0 for l in lines) if lines else 0
    for ln in lines:
        ln.sort(key=lambda w: w.x0)
        for w in ln:
            claimed.add(id(w))
        lead = ln[0]
        if abs(lead.x0 - first_x) < 3 and NOTE_MARK.match(lead.text) and len(ln) > 1:
            notes.append({"no": lead.text.rstrip("."), "text": " ".join(w.text for w in ln[1:])})
        elif notes:
            notes[-1]["text"] += " " + " ".join(w.text for w in ln)
        else:
            notes.append({"no": "", "text": " ".join(w.text for w in ln)})
    claimed.add(id(head))
    return notes


def extract_title_from(words: list[Word], claimed: set[int]) -> list[dict]:
    """Big text that is not beside any track: the sheet title / station name."""
    big = [w for w in words if (w.y1 - w.y0) >= 11]
    if not big:
        return []
    big.sort(key=lambda w: (round(w.cy / 3), w.x0))
    for w in big:
        claimed.add(id(w))
    return [{"label": "Title", "value": " ".join(w.text for w in big)}]


def free_blocks(words: list[Word], claimed: set[int]) -> list[dict]:
    """Remaining loose text (control ranges, legends) grouped into paragraphs by vertical proximity."""
    ws = sorted((w for w in words if id(w) not in claimed), key=lambda w: (round(w.cy / 2.0), w.x0))
    lines: list[list[Word]] = []
    for w in ws:
        if lines and abs(lines[-1][0].cy - w.cy) <= 2.0:
            lines[-1].append(w)
        else:
            lines.append([w])
    blocks: list[list[list[Word]]] = []
    for ln in lines:
        ln.sort(key=lambda w: w.x0)
        near = None
        for b in blocks:
            last = b[-1]
            if 0 < ln[0].cy - last[0].cy <= 9 and abs(ln[0].x0 - last[0].x0) <= 40:
                near = b
                break
        if near is not None:
            near.append(ln)
        else:
            blocks.append([ln])
    out = []
    for b in blocks:
        text = " ".join(" ".join(w.text for w in ln) for ln in b)
        for ln in b:
            for w in ln:
                claimed.add(id(w))
        if len(text) > 3:
            out.append({"no": "", "text": text})
    return out


def crank_handles(tables: list[dict]) -> dict[str, str]:
    """Map point numbers to crank handles from a table that has CRANK HANDLE and CONTROL POINTS columns."""
    out: dict[str, str] = {}
    for t in tables:
        cols = [c.upper() for c in t["columns"]]
        ch = next((i for i, c in enumerate(cols) if "CRANK" in c), None)
        cp = next((i for i, c in enumerate(cols) if "CONTROL" in c and "POINT" in c), None)
        if ch is None or cp is None:
            continue
        for r in t["rows"]:
            handle = r[ch]
            for tok in re.split(r"[\s,;]+", r[cp].replace(".", " ")):
                m = re.match(r"^(\d+)([A-Z](?:/[A-Z])*)?$", tok.strip())
                if not m:
                    continue
                base, suf = m.group(1), m.group(2)
                if suf:
                    for s in suf.split("/"):
                        out[base + s] = handle
                out.setdefault(base, handle)
    return out
