"""Everything printed around the rails that is not a rail symbol: line names, platforms, buildings, bridges,
chainage captions, gradient posts, dimension lines, route labels and loose text."""
from __future__ import annotations

import math
import re
from collections import defaultdict

from chainage import calibrate, scale_from_text
from net import Net
from patterns import TC_RE
from symbols import _slug, uniq
from textblocks import CH_RE, KM_RE, Block, blocks, chainage_of

Pt = tuple[float, float]

LINE_NO = re.compile(r"LINE\s*No\.?\s*-?\s*(\d+)", re.I)
CSL = re.compile(r"^(CSL|CSR|CAL)\b", re.I)
LEN_TXT = re.compile(r"\d\s*(?:m|M|KM|Km|km)\b|\d\s*[mM]\(|\dRL\b|^\(?\d+(?:\.\d+)?\s*[mM]\)?$")
ROUTE = re.compile(r"^(?:[A-Z]{0,3}-?\d+[A-Z]?(?:\([A-Z0-9\-]+\))?\s*[.,]\s*)+(?:[A-Z]{0,3}-?\d+[A-Z]?(?:\([A-Z0-9\-]+\))?)?\.?$")
PLAT_DIM = re.compile(r"(\d+(?:\.\d+)?)\s*[mM]?\s*(?:LONG)?\s*[xX]\s*(\d+(?:\.\d+)?)\s*[mM]?")
BRIDGE = re.compile(r"\bBR(?:IDGE)?\.?\s*N[Oo]\.?\s*[-:]?\s*(\d+[A-Z]?)", re.I)


def name_tracks(page, st: dict, origin: Pt, claimed: set[int]):
    """Line numbers, names and standing lengths from the captions printed along each line. Returns (lines summary, id map)."""
    ox, oy = origin
    net = Net(st)
    words = [w for w in page.words if w.horizontal]
    by_id = {t["id"]: t for t in st["tracks"]}

    def track_under(w, reach=28.0):
        """The line a caption belongs to: the nearest one above or below it."""
        best = None
        for y, tid in net.tracks_at_x(w.cx - ox):
            d = abs(y - (w.cy - oy))
            if d <= reach and (best is None or d < best[0]):
                best = (d, tid)
        return best[1] if best else None

    summary = []
    for w in words:
        m = LINE_NO.search(w.text)
        if not m:
            continue
        tid = track_under(w)
        if not tid or "lineNo" in by_id[tid]:
            continue
        t = by_id[tid]
        t["lineNo"] = int(m.group(1))
        claimed.add(id(w))
        row = [o for o in words if abs(o.cy - w.cy) <= 6 and o is not w and abs(o.cx - w.cx) <= 1400 and track_under(o) == tid]
        name = min((o for o in row if re.search(r"LINE|LOOP|SIDING", o.text, re.I) and not LINE_NO.search(o.text) and not CSL.match(o.text)
                    and not re.search(r"OVER\s*RUN", o.text, re.I)),
                   key=lambda o: abs(o.cx - w.cx), default=None)
        if name:
            t["name"] = name.text.strip()
            claimed.add(id(name))
        csls = sorted((o for o in words if CSL.match(o.text.strip()) and abs(o.cx - w.cx) <= 1600 and track_under(o) == tid), key=lambda o: o.cx)
        for o in csls:
            claimed.add(id(o))
        if csls:
            t["remarks"] = ". ".join(o.text.strip() for o in csls)
        up = t["name"].upper()
        t["direction"] = "UP" if up.startswith("UP") else "DN" if up.startswith("DN") else "BOTH"
        if "MAIN" in up:
            t["kind"] = "main"
        elif "SIDING" in up:
            t["kind"] = "siding"
        else:
            t["kind"] = "loop"
        csl_txt = next((o.text.strip() for o in csls if re.match(r"CS[LR]", o.text, re.I)), csls[0].text.strip() if csls else "")
        mm = re.search(r"(\d+(?:\.\d+)?)\s*[mM]", csl_txt)
        summary.append({"track": "", "lineNo": t["lineNo"], "name": t["name"], "csl": csl_txt, "cslM": float(mm.group(1)) if mm else 0, "_tid": tid})

    # sidings / overrun lines named by a caption lying on them
    for w in words:
        if id(w) in claimed or not re.search(r"SIDING|OVER\s*RUN", w.text, re.I) or LINE_NO.search(w.text):
            continue
        nr = net.nearest((w.cx - ox, w.cy - oy), tracks_only=True)
        if not nr or nr[0] > 26:
            continue
        t = by_id[nr[2]]
        claimed.add(id(w))
        if "lineNo" not in t and t["name"].startswith("Track "):
            t["name"] = w.text.strip()
            t["kind"] = "overrun" if re.search(r"OVER\s*RUN", w.text, re.I) else "siding"
        else:
            t["remarks"] = (t.get("remarks", "") + ". " if t.get("remarks") else "") + w.text.strip()
    for t in st["tracks"]:
        if "lineNo" not in t and t["name"].startswith("Track "):
            kinds = [net.kind[t["nodeIds"][0]], net.kind[t["nodeIds"][-1]]]
            if "bufferStop" in kinds:
                t["kind"] = "siding"

    # stable ids: L<n> for numbered lines
    idmap = {}
    used = set()
    for t in st["tracks"]:
        new = f"L{t['lineNo']}" if "lineNo" in t else t["id"]
        if new in used:
            new = t["id"]
        used.add(new)
        idmap[t["id"]] = new
        t["id"] = new
    for s in summary:
        s["track"] = idmap[s.pop("_tid")]
    summary.sort(key=lambda s: s["lineNo"])
    return summary, idmap


def yard_ends(page, yard, claimed):
    """Names of the neighbouring stations printed at either end of the yard."""
    x0, y0, x1, y1 = yard
    ends = {}
    cand = [w for w in page.words if w.horizontal and y0 - 110 <= w.cy <= y1 + 110 and re.search(r"[A-Z]{3}", w.text)]
    for side, lo, hi in (("west", x0 - 200, x0 + 0.14 * (x1 - x0)), ("east", x1 - 0.14 * (x1 - x0), x1 + 200)):
        pool = [w for w in cand if lo <= w.cx <= hi]
        to = [w for w in pool if re.match(r"^TO\s+\S", w.text)]
        pick = max(to or [w for w in pool if w.size >= 11 and not re.search(r"\d{2}", w.text)] or [None],
                   key=lambda w: (w.size if w else 0))
        if pick:
            ends[side] = re.sub(r"^TO\s+", "", pick.text).strip()
            claimed.add(id(pick))
    return ends


def chainage_scale(page, yard, words_hint=None):
    """Fit the chainage scale from every caption that prints a CH value. Returns (originX, m/pt, rms, n) in page coords."""
    x0, y0, x1, y1 = yard
    pairs = []
    for w in page.words:
        if not (x0 - 50 <= w.cx <= x1 + 50 and y0 - 420 <= w.cy <= y1 + 420):
            continue
        if abs(abs(w.rotation) - 90) > 25:
            continue
        c = chainage_of(w.text)
        if c is not None:
            pairs.append((w.cx, c))
    hint = scale_from_text(page.words)
    fit = calibrate(pairs, hint)
    if fit and fit[2] <= 12:
        return fit[0], fit[1], fit[2], len(pairs)
    return None


def find_furniture(page, st: dict, net: Net, ctx: dict, claimed: set[int], cal):
    ox, oy = ctx["origin"]
    rails = ctx["rails"]
    xs = [q[0] for l in rails for q in l.pts]
    ys = [q[1] for l in rails for q in l.pts]
    yard = (min(xs), min(ys), max(xs), max(ys))
    ymid = (yard[1] + yard[3]) / 2
    ids: set[str] = set()
    report: dict[str, list] = defaultdict(list)
    X = lambda v: round(v - ox, 2)      # noqa: E731
    Y = lambda v: round(v - oy, 2)      # noqa: E731

    def x_of_chainage(ch: float, near_x: float) -> float:
        if not cal:
            return near_x
        x0, k = cal[0], cal[1]
        return x0 + (1 if near_x >= x0 else -1) * ch / k

    def chainage_at(x: float) -> float:
        return abs(x - cal[0]) * cal[1] if cal else 0.0

    region = [w for w in page.words if yard[0] - 80 <= w.cx <= yard[2] + 80 and yard[1] - 430 <= w.cy <= yard[3] + 430 and id(w) not in claimed]
    blks = blocks(region)

    # ------------------------------------------------------------------ bridges, gradient posts, chainage captions
    bridges, gradients, marks = [], [], []
    slanted = [w for w in region if 3 < abs(w.rotation) < 40 and re.search(r"LEVEL|IN\s*\d|^\d{2,4}$|[RF]\s*=", w.text, re.I)]
    for b in blks:
        txt = b.text
        mb = BRIDGE.search(txt)
        if mb:
            ch = chainage_of(txt)
            bx = b.cx
            x = x_of_chainage(ch, bx) if ch is not None else bx
            spec = " / ".join(l.strip() for l in b.lines if not BRIDGE.search(l) and not CH_RE.search(l) and not KM_RE.search(l))
            km = KM_RE.search(txt)
            br = {"id": uniq("BR" + mb.group(1), ids), "number": mb.group(1), "chainage": round(ch if ch is not None else chainage_at(bx), 2),
                  "x": X(x), "spec": (spec + (f" (km {km.group(1)})" if km else "")).strip()}
            if re.search(r"\(NEW\)", txt, re.I):
                br["isNew"] = True
            bridges.append(br)
            for w in b.words:
                claimed.add(id(w))
            continue
        if abs(abs(b.rotation) - 90) > 25:
            continue
        chs = list(CH_RE.finditer(txt))
        if not chs:
            continue
        near = [w for w in slanted if abs(w.cx - b.cx) <= 75 and abs(w.cy - b.cy) <= 110]
        if near:
            left = [w for w in near if w.cx < b.cx]
            right = [w for w in near if w.cx >= b.cx]
            ch = float(chs[0].group(1))
            up = "UP" if re.search(r"\bUP\b", txt) else "DN" if re.search(r"\bDN\b", txt) else "BOTH"
            val = lambda ws: " ".join(w.text.strip() for w in sorted(ws, key=lambda w: w.cx)) or None   # noqa: E731
            gradients.append({"id": uniq("G", ids), "direction": up, "x": X(x_of_chainage(ch, b.cx)), "chainage": ch,
                              "from": val(left), "to": val(right), "text": chs[0].group(0).strip()})
            for w in b.words + near:
                claimed.add(id(w))
            continue
        prev = 0
        for m in chs:
            kind = re.sub(r"F/CSB|FROM CSB|\bM\b", "", txt[prev:m.start()]).strip(" :-.") or "CH"
            prev = m.end()
            ch = float(m.group(1))
            marks.append({"id": uniq("CM", ids), "kind": kind[:24], "chainage": ch, "x": X(x_of_chainage(ch, b.cx)),
                          "lane": "top" if b.cy < ymid else "bottom"})
        for w in b.words:
            claimed.add(id(w))
    gradients.sort(key=lambda g: g["x"])
    marks.sort(key=lambda m: m["x"])
    bridges.sort(key=lambda b: b["x"])

    # ------------------------------------------------------------------ dimension lines (paired arrow heads + a length)
    dims = []
    used_t: set[int] = set()
    tris = page.tris
    horiz = [(i, t) for i, t in enumerate(tris) if min(abs(math.degrees(t.direction)), 180 - abs(math.degrees(t.direction))) < 12]
    vert = [(i, t) for i, t in enumerate(tris) if abs(abs(math.degrees(t.direction)) - 90) < 12]
    hwords = [w for w in region if w.horizontal and LEN_TXT.search(w.text) and not TC_RE.match(w.text.replace(" ", ""))]
    vwords = [w for w in region if abs(abs(w.rotation) - 90) < 20 and re.search(r"\d\s*[mM]\b|\d[mM]$", w.text) and not CH_RE.search(w.text)]
    pairs = []
    for i, a in horiz:
        if abs(math.degrees(a.direction)) < 90:
            continue                                   # a = the west-pointing head (left end)
        for j, b in horiz:
            if abs(math.degrees(b.direction)) > 90 or abs(a.tip[1] - b.tip[1]) > 1.5 or b.tip[0] - a.tip[0] < 12:
                continue
            pairs.append((b.tip[0] - a.tip[0], i, j))
    for span, i, j in sorted(pairs):
        if i in used_t or j in used_t:
            continue
        a, b = tris[i], tris[j]
        y = (a.tip[1] + b.tip[1]) / 2
        cand = [w for w in hwords if a.tip[0] - 2 <= w.cx <= b.tip[0] + 2 and abs(w.cy - y) <= 11 and id(w) not in claimed]
        if not cand:
            continue
        w = min(cand, key=lambda w: abs(w.cx - (a.tip[0] + b.tip[0]) / 2))
        used_t.update((i, j))
        claimed.add(id(w))
        dims.append({"id": uniq("DH", ids), "kind": "horizontal", "y": Y(y), "x0": X(a.tip[0]), "x1": X(b.tip[0]), "text": w.text.strip(),
                     "label": {"x": X(w.cx), "y": Y(w.cy)}})
    pairs = []
    for i, a in vert:
        if math.degrees(a.direction) > 0:
            continue                                   # a = the upward-pointing head (top end)
        for j, b in vert:
            if math.degrees(b.direction) < 0 or abs(a.tip[0] - b.tip[0]) > 1.5 or b.tip[1] - a.tip[1] < 8:
                continue
            pairs.append((b.tip[1] - a.tip[1], i, j))
    for span, i, j in sorted(pairs):
        if i in used_t or j in used_t:
            continue
        a, b = tris[i], tris[j]
        x = (a.tip[0] + b.tip[0]) / 2
        cand = [w for w in vwords if a.tip[1] - 2 <= w.cy <= b.tip[1] + 2 and abs(w.cx - x) <= 13 and id(w) not in claimed]
        if not cand:
            continue
        w = min(cand, key=lambda w: abs(w.cy - (a.tip[1] + b.tip[1]) / 2))
        used_t.update((i, j))
        claimed.add(id(w))
        dims.append({"id": uniq("DV", ids), "kind": "vertical", "x": X(x), "y0": Y(a.tip[1]), "y1": Y(b.tip[1]), "text": w.text.strip(),
                     "label": {"x": X(w.cx), "y": Y(w.cy)}})

    # ------------------------------------------------------------------ platforms and buildings (boxes with a caption)
    hlines, vlines = [], []
    for ln in ctx["lines"]:
        if ln in rails or len(ln.pts) != 2:
            continue
        (ax, ay), (bx, by) = ln.pts
        if abs(ay - by) < 0.6:
            hlines.append((ay, min(ax, bx), max(ax, bx)))
        elif abs(ax - bx) < 0.6:
            vlines.append((ax, min(ay, by), max(ay, by)))
    for lp in ctx["loops"]:
        for (ax, ay), (bx, by) in zip(lp, lp[1:]):
            if abs(ay - by) < 0.6 and abs(ax - bx) > 6:
                hlines.append((ay, min(ax, bx), max(ax, bx)))
            elif abs(ax - bx) < 0.6 and abs(ay - by) > 6:
                vlines.append((ax, min(ay, by), max(ay, by)))
    for r in page.rects:
        hlines += [(r[1], r[0], r[2]), (r[3], r[0], r[2])]
        vlines += [(r[0], r[1], r[3]), (r[2], r[1], r[3])]

    def box_around(cx, cy, max_h=140.0):
        up = [h for h in hlines if h[0] < cy and h[1] - 2 <= cx <= h[2] + 2 and cy - h[0] <= max_h]
        dn = [h for h in hlines if h[0] > cy and h[1] - 2 <= cx <= h[2] + 2 and h[0] - cy <= max_h]
        if not up or not dn:
            return None
        top = max(up, key=lambda h: h[0])
        bot = min(dn, key=lambda h: h[0])
        x0, x1 = max(top[1], bot[1]), min(top[2], bot[2])
        if x1 - x0 < 8:
            return None
        return (x0, top[0], x1, bot[0])

    def unspace(t: str) -> str:
        # letter-spaced captions: 'P L A T F O R M  N O. - 1' -> 'PLATFORM NO.-1'
        if re.search(r"(?:\b\S ){5,}", t):
            return re.sub(r"(?<=\S) (?=\S)", "", t).replace("  ", " ")
        return t

    platforms, structures = [], []
    hblocks = [b for b in blks if abs(b.rotation) < 20 and yard[1] - 260 <= b.cy <= yard[3] + 260]
    for b in hblocks:
        txt = unspace(b.text)
        if any(id(w) in claimed for w in b.words):
            continue
        if re.search(r"PLATFORM|\bPF\b", txt, re.I) and not re.search(r"END|RAMP", txt, re.I):
            box = box_around(b.cx, b.cy)
            if not box:
                report["platformWithoutOutline"].append(txt[:60])
                continue
            m = PLAT_DIM.search(txt)
            no = re.search(r"No\.?\s*-?\s*(\d+)", txt, re.I)
            name = f"PLATFORM No. {no.group(1)}" if no else re.sub(r"\s*\(?\d.*$", "", txt).strip().title()
            pf = {"id": uniq("PF" + (no.group(1) if no else str(len(platforms) + 1)), ids), "name": name,
                  "kind": "rail" if re.search(r"RAIL\s*LEVEL|R\.\s*L\.", txt, re.I) else "high", "text": txt.strip(),
                  "lengthM": float(m.group(1)) if m else 0, "widthM": float(m.group(2)) if m else 0,
                  "polygon": [{"x": X(box[0]), "y": Y(box[3])}, {"x": X(box[0]), "y": Y(box[1])}, {"x": X(box[2]), "y": Y(box[1])}, {"x": X(box[2]), "y": Y(box[3])}],
                  "label": {"x": X(b.cx), "y": Y(b.cy)}}
            if cal:
                pf["startChainage"] = round(chainage_at(box[0]), 2)
                pf["endChainage"] = round(chainage_at(box[2]), 2)
            platforms.append(pf)
            for w in b.words:
                claimed.add(id(w))
        elif re.search(r"BLDG|BUILDING|GOOMTY|ROOM|CABIN|V\.?D\.?U|RELAY|HUT|\bFOB\b|PANEL", txt, re.I):
            box = box_around(b.cx, b.cy, 70)
            if not box or (box[2] - box[0]) > 500:
                continue
            up = txt.upper()
            kind = "fob" if "FOB" in up else "goomty" if re.search(r"GOOMTY|HUT", up) else "smRoom" if re.search(r"S\.?M\.?\s*ROOM|ROOM", up) else "building"
            structures.append({"id": uniq("ST_" + _slug(txt)[:18], ids), "kind": kind, "name": txt.strip()[:60],
                               "shape": {"type": "rect", "x0": X(box[0]), "y0": Y(box[1]), "x1": X(box[2]), "y1": Y(box[3])},
                               "label": {"x": X(b.cx), "y": Y(b.cy)}, **({"chainage": round(chainage_at(b.cx), 1)} if cal else {})})
            for w in b.words:
                claimed.add(id(w))

    # small captioned boxes beside the yard: huts, boards, relay rooms
    taken = [s["shape"] for s in structures if "shape" in s] + [s["shape"] for s in ctx.get("posts", []) if "shape" in s]
    for r in page.rects:
        w_, h_ = r[2] - r[0], r[3] - r[1]
        if not (8 <= w_ <= 140 and 6 <= h_ <= 80) or not (yard[0] - 40 <= r[0] and r[2] <= yard[2] + 40 and yard[1] - 220 <= r[1] and r[3] <= yard[3] + 220):
            continue
        if any(abs(X(r[0]) - t["x0"]) < 2 and abs(Y(r[1]) - t["y0"]) < 2 for t in taken):
            continue
        inside = [w for w in page.words if r[0] <= w.cx <= r[2] and r[1] <= w.cy <= r[3] and id(w) not in claimed]
        if not (1 <= len(inside) <= 3) or not any(re.search(r"[A-Za-z*]", w.text) for w in inside):
            continue
        txt = " ".join(w.text for w in sorted(inside, key=lambda w: (round(w.cy / 4), w.cx)))
        up = txt.upper()
        kind = "goomty" if re.search(r"GOOMTY|HUT|LOC|GTY", up) else "locoPilotBoard" if re.fullmatch(r"SL|DL|\*|[A-Z]", up.strip()) else "building"
        structures.append({"id": uniq("ST_" + (_slug(txt)[:18] or "BOX"), ids), "kind": kind, "name": txt[:60],
                           "shape": {"type": "rect", "x0": X(r[0]), "y0": Y(r[1]), "x1": X(r[2]), "y1": Y(r[3])},
                           "label": {"x": X((r[0] + r[2]) / 2), "y": Y((r[1] + r[3]) / 2)}})
        taken.append(structures[-1]["shape"])
        for w in inside:
            claimed.add(id(w))

    # ------------------------------------------------------------------ route labels and loose text along the yard
    routes, notes = [], []
    band = [w for w in region if w.horizontal and yard[1] - 75 <= w.cy <= yard[3] + 75 and id(w) not in claimed]
    for w in band:
        txt = w.text.strip()
        if ROUTE.match(txt.replace(" ", "")) and re.search(r"[.,]", txt):
            arrow = None
            for t in tris:
                if abs(t.tip[1] - w.cy) <= 5 and min(abs(t.tip[0] - w.x0), abs(t.tip[0] - w.x1), abs(t.base[0] - w.x0), abs(t.base[0] - w.x1)) <= 45:
                    deg = abs(math.degrees(t.direction))
                    if deg < 20:
                        arrow = "east"
                    elif deg > 160:
                        arrow = "west"
            r = {"id": uniq("R", ids), "text": txt, "x": X(w.cx), "y": Y(w.cy)}
            if arrow:
                r["arrow"] = arrow
            routes.append(r)
            claimed.add(id(w))
    for w in band:
        if id(w) in claimed:
            continue
        txt = w.text.strip()
        if len(txt) < 2 or len(txt) > 70:
            continue
        nr = net.nearest((w.cx - ox, w.cy - oy))
        if not nr or nr[0] > 70:
            continue
        notes.append({"id": uniq("A", ids), "text": txt, "x": X(w.cx), "y": Y(w.cy), "tone": "end" if (w.size >= 11 or w.bold) else "line"})
        claimed.add(id(w))

    breaks = []
    for t in st["tracks"]:
        for p in t.pop("_breaks", []):
            breaks.append({"trackId": t["id"], "x": X(p[0])})

    return {"platforms": platforms, "structures": structures, "bridges": bridges, "chainageMarks": marks, "gradients": gradients,
            "dimensions": dims, "routeLabels": routes, "annotations": notes, "breaks": breaks}, dict(report), yard
