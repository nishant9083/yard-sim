"""What the sheet prints away from the yard: ruled tables, numbered notes, the title block and the aspect charts."""
from __future__ import annotations

import re
from collections import defaultdict

from graphutil import UnionFind
from patterns import SIGNAL_RE
from pdfio import Word

ASPECT = re.compile(r"^(G|R|Y|YY|YwU|Ywu|YWU|Yw|YYwU|GG)$")
LEN_LIKE = re.compile(r"\d\s*(m|M|KM|km|Km)\b|\(MIN\)|APPROX", re.I)


def _cluster(vals, tol):
    out: list[list[float]] = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(c) / len(c) for c in out]


def _join(ws: list[Word]) -> str:
    ws = sorted(ws, key=lambda w: (round(w.cy / 4.0), w.x0))
    return " ".join(w.text for w in ws).strip()


def rules(ctx: dict):
    """Axis-aligned straight strokes: candidates for table rules and boxes (taken raw, before any merging)."""
    H, V = [], []
    for s in ctx["page"].segs:
        if s.curve or s.length < 6:
            continue
        if abs(s.y0 - s.y1) < 0.5:
            H.append((s.y0, min(s.x0, s.x1), max(s.x0, s.x1)))
        elif abs(s.x0 - s.x1) < 0.5:
            V.append((s.x0, min(s.y0, s.y1), max(s.y0, s.y1)))
    return H, V


def extract_tables(page, ctx: dict, yard, claimed: set[int]) -> list[dict]:
    H, V = rules(ctx)
    n = len(H) + len(V)
    uf = UnionFind(n)
    tol = 1.5
    # index verticals by x bucket for speed
    buckets: dict[int, list[int]] = defaultdict(list)
    for j, v in enumerate(V):
        buckets[int(v[0] // 50)].append(j)
    for i, h in enumerate(H):
        for b in range(int((h[1] - tol) // 50), int((h[2] + tol) // 50) + 1):
            for j in buckets.get(b, ()):
                v = V[j]
                if h[1] - tol <= v[0] <= h[2] + tol and v[1] - tol <= h[0] <= v[2] + tol:
                    uf.union(i, len(H) + j)
    comps: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        comps[uf.find(i)].append(i)
    words = [w for w in page.words if w.horizontal and id(w) not in claimed]
    tables = []
    for comp in comps.values():
        hs = [H[i] for i in comp if i < len(H)]
        vs = [V[i - len(H)] for i in comp if i >= len(H)]
        if len(hs) < 3 or len(vs) < 3:
            continue
        x0, x1 = min(h[1] for h in hs), max(h[2] for h in hs)
        y0, y1 = min(v[1] for v in vs), max(v[2] for v in vs)
        if x1 - x0 < 60 or y1 - y0 < 24:
            continue
        # not the yard itself (platform boxes, dimension frames)
        if yard[0] <= (x0 + x1) / 2 <= yard[2] and yard[1] - 40 <= (y0 + y1) / 2 <= yard[3] + 40:
            continue
        ycov: dict[float, float] = defaultdict(float)
        for y, a, b in hs:
            ycov[round(y)] += b - a
        xcov: dict[float, float] = defaultdict(float)
        for x, a, b in vs:
            xcov[round(x)] += b - a
        rows_y = _cluster([y for y, c in ycov.items() if c >= 0.55 * (x1 - x0)], 2.0)
        cols_x = _cluster([x for x, c in xcov.items() if c >= 0.45 * (y1 - y0)], 2.0)
        if len(rows_y) < 3 or len(cols_x) < 3:
            continue
        inside = [w for w in words if x0 - 1 <= w.cx <= x1 + 1 and y0 - 1 <= w.cy <= y1 + 1]
        if len(inside) < 4:
            continue
        grid = []
        for r in range(len(rows_y) - 1):
            row = []
            for c in range(len(cols_x) - 1):
                cell = [w for w in inside if cols_x[c] <= w.cx < cols_x[c + 1] and rows_y[r] <= w.cy < rows_y[r + 1]]
                row.append(_join(cell))
            grid.append(row)
        for w in inside:
            claimed.add(id(w))
        title = ""
        while grid and sum(1 for c in grid[0] if c) <= 1 and len(grid) > 2:
            t = next((c for c in grid[0] if c), "")
            title = title or t
            grid.pop(0)
        if not title:
            above = [w for w in words if id(w) not in claimed and y0 - 18 <= w.cy < y0 and x0 - 10 <= w.cx <= x1 + 10]
            if above:
                title = _join(above)
                for w in above:
                    claimed.add(id(w))
        grid = [r for r in grid if any(r)]
        if len(grid) < 2:
            continue
        tables.append({"id": f"table{len(tables) + 1}", "title": title or grid[0][0] or f"Table {len(tables) + 1}", "columns": grid[0], "rows": grid[1:],
                       "_box": (x0, y0, x1, y1)})
    tables.sort(key=lambda t: (t["_box"][0], t["_box"][1]))
    for i, t in enumerate(tables, 1):
        t["id"] = f"table{i}"
    return tables


NOTE_START = re.compile(r"^\(?(\d{1,2}|[ivxIVX]{1,4})(?:[.)]\s*|\s+(?=[A-Z\u2018\u2019'\"(]))(.*)$")


def extract_notes(page, yard, claimed: set[int]) -> list[dict]:
    words = [w for w in page.words if w.horizontal and id(w) not in claimed
             and not (yard[0] <= w.cx <= yard[2] and yard[1] - 60 <= w.cy <= yard[3] + 60)]
    # text lines: words on one baseline that are close together
    words.sort(key=lambda w: (round(w.cy / 3.0), w.x0))
    lines: list[list[Word]] = []
    for w in words:
        placed = False
        for ln in reversed(lines[-40:]):
            if abs(ln[-1].cy - w.cy) <= 3.2 and 0 <= w.x0 - ln[-1].x1 <= 45:
                ln.append(w)
                placed = True
                break
        if not placed:
            lines.append([w])
    heads = [ln for ln in lines if re.search(r"\bNOTES?\b", ln[0].text, re.I) and len(" ".join(w.text for w in ln)) < 60]
    starts = [ln for ln in lines if NOTE_START.match(ln[0].text) and re.match(r"^\d", ln[0].text)]
    cols = _cluster([ln[0].x0 for ln in starts], 14.0)
    notes: list[dict] = []
    for cx in cols:
        col_starts = sorted((ln for ln in starts if abs(ln[0].x0 - cx) <= 14), key=lambda ln: ln[0].cy)
        if len(col_starts) < 2:
            continue
        head = None
        hc = [h for h in heads if h[0].cy < col_starts[0][0].cy and col_starts[0][0].cy - h[0].cy <= 70 and cx - 40 <= h[0].cx <= cx + 800]
        if hc:
            head = max(hc, key=lambda h: h[0].cy)
        if head:
            notes.append({"no": "", "text": " ".join(w.text for w in head).strip(" :-")})
            for w in head:
                claimed.add(id(w))
        for k, st in enumerate(col_starts):
            y_next = col_starts[k + 1][0].cy if k + 1 < len(col_starts) else st[0].cy + 60
            m = NOTE_START.match(st[0].text)
            text = [m.group(2)] + [w.text for w in st[1:]]
            for w in st:
                claimed.add(id(w))
            last_y = st[0].cy
            for ln in lines:
                if ln is st or id(ln[0]) in claimed:
                    continue
                if st[0].cy + 2 < ln[0].cy < y_next - 2 and cx + 2 <= ln[0].x0 <= cx + 420 and ln[0].cy - last_y <= 18 and not NOTE_START.match(ln[0].text):
                    text += [w.text for w in ln]
                    last_y = ln[0].cy
                    for w in ln:
                        claimed.add(id(w))
            notes.append({"no": m.group(1), "text": re.sub(r"\s+", " ", " ".join(t for t in text if t)).strip()})
    return notes


def _right_of(words, label: Word, dx=320.0, dy=9.0):
    cand = [w for w in words if w is not label and abs(w.cy - label.cy) <= dy and 0 < w.x0 - label.x1 <= dx]
    return min(cand, key=lambda w: w.x0, default=None)


def extract_title(page, tables, claimed: set[int]) -> tuple[list[dict], dict]:
    """Zone / division / station / plan number, read as label -> value pairs wherever they are printed."""
    words = [w for w in page.words if w.horizontal]
    rows: list[dict] = []
    facts: dict[str, str] = {}

    def put(label, value):
        if value and label not in facts:
            facts[label] = value.strip()
            rows.append({"label": label, "value": value.strip()})

    big = sorted((w for w in words if re.search(r"INTERLOCKING PLAN", w.text, re.I)), key=lambda w: -w.size)
    if big:
        put("Title", big[0].text)
    for key, label in (("STATION", "Station"), ("ZONE", "Zone"), ("DIVISION", "Division"), ("CLASS", "Class"), ("STANDARD", "Standard of interlocking")):
        for w in words:
            if w.text.strip().upper().rstrip(":") == key or (key == "STANDARD" and w.text.strip().upper().startswith("STANDARD")):
                v = _right_of(words, w)
                if v and not re.search(r"^(ZONE|DIVISION|STATION|CLASS)$", v.text.strip(), re.I) and len(v.text.strip()) <= (14 if key in ("CLASS", "STANDARD") else 40):
                    put(label, v.text)
                    break
    for w in words:
        m = re.search(r"([A-Za-z]+[./]SIP[./][\w./\-]+\d|SIP[./][\w./\-]*\d[\w./\-]*)", w.text)
        if m:
            put("Plan no.", m.group(1))
            break
    for w in words:
        if re.search(r"SCALE", w.text, re.I) and re.search(r"1\s*:\s*\d+", w.text):
            put("Scale", w.text)
            break
    for w in words:
        for key, label in (("LONGITUDINAL", "Longitudinal scale"), ("TRANSVERSE", "Transverse scale")):
            m = re.search(key + r"\s*:?\s*(.*)$", w.text, re.I)
            if m:
                val = m.group(1).strip(": ")
                if not val:
                    v = _right_of(words, w, 120, 5)
                    val = v.text.strip(": ") if v else ""
                if re.search(r"\d", val) and len(val) <= 24:
                    put(label, val)
    return rows, facts


def extract_aspect_charts(page, ctx: dict, claimed: set[int]) -> list[dict]:
    words = [w for w in page.words if w.horizontal]
    charts = []
    H, _ = rules(ctx)
    for t in words:
        if not re.search(r"ASPECT\s+CONTROL\s+CHART", t.text, re.I):
            continue
        # the chart box: the stroked rectangle just under / around the title, else a guessed region
        box = None
        for r in page.rects:
            if r[0] - 5 <= t.cx <= r[2] + 5 and r[1] - 25 <= t.cy <= r[1] + 30 and (r[2] - r[0]) > 150:
                if box is None or (r[2] - r[0]) * (r[3] - r[1]) > (box[2] - box[0]) * (box[3] - box[1]):
                    box = r
        if box is None:
            # the frame drawn as separate strokes: the rule just above the title and the next long rule below it
            tops = [h for h in H if h[1] - 5 <= t.cx <= h[2] + 5 and -14 <= t.cy - h[0] <= 22 and h[2] - h[1] > 150]
            if tops:
                top = max(tops, key=lambda h: h[0])
                bots = [h for h in H if h[0] > top[0] + 40 and abs(h[1] - top[1]) < 6 and abs(h[2] - top[2]) < 6]
                if bots:
                    box = (top[1], top[0], top[2], min(bots, key=lambda h: h[0])[0])
        if box is None:
            others = [o for o in words if o is not t and re.search(r"ASPECT\s+CONTROL\s+CHART", o.text, re.I)]
            left = max([o.x1 for o in others if o.x1 < t.x0 and abs(o.cy - t.cy) < 200] + [t.cx - 520])
            right = min([o.x0 for o in others if o.x0 > t.x1 and abs(o.cy - t.cy) < 200] + [t.cx + 520])
            box = (max(left + 10, t.cx - 520), t.cy - 4, min(right - 10, t.cx + 520), t.cy + 170)
        inside = [w for w in words if w is not t and box[0] <= w.cx <= box[2] and max(box[1], t.cy + 4) <= w.cy <= box[3] and id(w) not in claimed]
        if len(inside) < 4:
            continue
        rows_y = _cluster([w.cy for w in inside], 4.5)
        rows = [[w for w in inside if abs(w.cy - y) <= 4.5] for y in rows_y]
        # header: the first row that has at least two non-aspect names
        names_row = next((r for r in rows if sum(1 for w in r if not ASPECT.match(w.text) and not LEN_LIKE.search(w.text)) >= 2), None)
        if not names_row:
            continue
        names = sorted((w for w in names_row if not LEN_LIKE.search(w.text) and not ASPECT.match(w.text)), key=lambda w: w.cx)
        cols = [w.cx for w in names]
        gaps_w = sorted((w for r in rows for w in r if LEN_LIKE.search(w.text) and abs(w.cy - names_row[0].cy) <= 14), key=lambda w: w.cx)
        body = []
        codes = [""] * len(cols)
        for r in rows:
            if r is names_row:
                continue
            if not any(codes) and r and all(SIGNAL_RE.match(w.text.strip()) for w in r) and 0 < r[0].cy - names_row[0].cy <= 22:
                for w in r:                       # the signal numbers printed under the names
                    k = min(range(len(cols)), key=lambda i: abs(cols[i] - w.cx))
                    codes[k] = w.text.strip()
                continue
            asp = [w for w in r if ASPECT.match(w.text)]
            other = [w for w in r if not ASPECT.match(w.text) and not LEN_LIKE.search(w.text)]
            if asp:
                row = [""] * len(cols)
                for w in asp:
                    k = min(range(len(cols)), key=lambda i: abs(cols[i] - w.cx))
                    row[k] = (row[k] + " " + w.text).strip()
                body.append(row)
            elif other and len(other) <= 2:
                row = [""] * len(cols)
                for w in other:
                    k = min(range(len(cols)), key=lambda i: abs(cols[i] - w.cx))
                    row[k] = f"({w.text})"
                body.append(row)
        for w in inside + [t]:
            claimed.add(id(w))
        direction = "UP" if re.search(r"\bUP\b", t.text) else "DN"
        charts.append({"direction": direction, "title": t.text.strip(),
                       "signals": [{"name": w.text.strip(), "code": codes[k] or (w.text.strip() if SIGNAL_RE.match(w.text.strip()) else "")} for k, w in enumerate(names)],
                       "gaps": [w.text.strip() for w in gaps_w][: max(0, len(names) - 1)], "rows": body})
    return charts


def crank_handles(tables: list[dict]) -> dict[str, str]:
    """Point number -> crank handle group, from any table that lists them side by side."""
    out: dict[str, str] = {}
    for t in tables:
        cols = [c.upper() for c in t["columns"]]
        ch = next((i for i, c in enumerate(cols) if re.search(r"CRANK|GROUP|^CH\b", c)), None)
        cp = next((i for i, c in enumerate(cols) if "POINT" in c), None)
        if ch is None or cp is None or ch == cp:
            continue
        for r in t["rows"]:
            if max(ch, cp) >= len(r):
                continue
            handle = r[ch].strip()
            if not re.match(r"^CH[-\s]?\d+", handle, re.I):
                continue
            for tok in re.split(r"[\s,;&]+", r[cp].replace(".", " ")):
                m = re.match(r"^(\d+)([A-Z](?:/[A-Z])*)?$", tok.strip())
                if m:
                    out[m.group(1)] = handle
    return out
