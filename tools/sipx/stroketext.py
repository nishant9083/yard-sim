"""Read text that is drawn as line work (AutoCAD stroke/SHX fonts, where nothing can be selected in the PDF).

The strokes of the letters are small paths.  They are grouped into words and lines by position, each line is
redrawn on its own, upright and without the surrounding drawing, and read by OCR (tesseract).  Lines that read
as text become ordinary words for the rest of the pipeline and their strokes are taken out of the line work.
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import dataclass, field

from graphutil import UnionFind
from pdfio import Page, Word

Pt = tuple[float, float]


@dataclass
class TextLine:
    paths: list[int] = field(default_factory=list)       # indexes into page.small_paths
    angle: float = 0.0                                    # degrees, reading direction (0 = left to right, 90 = upward)
    bbox: tuple[float, float, float, float] = (0, 0, 0, 0)
    size: float = 6.0                                     # letter height
    text: str = ""
    conf: float = 0.0


def letter_height(page: Page) -> float:
    """The usual letter height on the sheet: the most common stroke height among small strokes."""
    hist: dict[int, int] = defaultdict(int)
    for _, pts, b in page.small_paths:
        h = max(b[2] - b[0], b[3] - b[1])
        if 3.0 <= h <= 14.0 and len(pts) >= 3:
            hist[int(round(h * 2))] += 1
    if not hist:
        return 6.0
    return max(hist, key=lambda k: hist[k]) / 2.0


def _group(page: Page, max_dim=18.0):
    cap = letter_height(page)
    # strokes that belong to a symbol are not letters: the small circles inside a shunt disc, a calling-on oval or a lamp
    hosts = [a.bbox for a in page.arcs if max(a.bbox[2] - a.bbox[0], a.bbox[3] - a.bbox[1]) >= 8.0]
    hosts += [(c.cx - c.r, c.cy - c.r, c.cx + c.r, c.cy + c.r) for c in page.circles if c.r >= 4.5]
    cell = 30.0
    hgrid: dict[tuple[int, int], list[tuple]] = defaultdict(list)
    for h in hosts:
        for gx in range(int(h[0] // cell), int(h[2] // cell) + 1):
            for gy in range(int(h[1] // cell), int(h[3] // cell) + 1):
                hgrid[(gx, gy)].append(h)

    def in_symbol(b) -> bool:
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        return any(h[0] - 0.5 <= cx <= h[2] + 0.5 and h[1] - 0.5 <= cy <= h[3] + 0.5 and (h[2] - h[0]) > (b[2] - b[0]) + 2
                   for h in hgrid.get((int(cx // cell), int(cy // cell)), ()))
    def lamp(sp) -> bool:
        b = sp[2]
        w, h = b[2] - b[0], b[3] - b[1]
        return abs(w - h) <= 0.15 * max(w, h) and max(w, h) > 1.2 * cap      # a round outline bigger than a letter O
    page.small_paths = [sp for sp in page.small_paths
                        if max(sp[2][2] - sp[2][0], sp[2][3] - sp[2][1]) <= 1.75 * cap and not in_symbol(sp[2]) and not lamp(sp)]
    paths = page.small_paths
    n = len(paths)
    uf = UnionFind(n)
    cell = 12.0
    grid: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, (_, _, b) in enumerate(paths):
        grid[(int(((b[0] + b[2]) / 2) // cell), int(((b[1] + b[3]) / 2) // cell))].append(i)
    dim = [max(b[2] - b[0], b[3] - b[1]) for _, _, b in paths]
    for (cx, cy), lst in grid.items():
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                other = grid.get((cx + dx, cy + dy))
                if not other:
                    continue
                for i in lst:
                    bi = paths[i][2]
                    for j in other:
                        if j <= i:
                            continue
                        bj = paths[j][2]
                        S = min(14.0, max(4.0, dim[i], dim[j]))
                        gx = max(bi[0], bj[0]) - min(bi[2], bj[2])
                        gy = max(bi[1], bj[1]) - min(bi[3], bj[3])
                        # letters of one word nearly touch along the reading direction and overlap across it
                        if max(gx, gy) <= 0.42 * S and min(gx, gy) <= 0.05 * S:
                            uf.union(i, j)
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[uf.find(i)].append(i)
    return list(groups.values())


def _bbox(page: Page, idx: list[int]):
    bs = [page.small_paths[i][2] for i in idx]
    return (min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs))


def _angle(page: Page, idx: list[int]) -> float | None:
    """Reading direction of a word.  Upright letters are taller than wide, so in level text many strokes are a full
    letter height tall; in text that runs up the sheet they are a full letter height wide instead."""
    bs = [page.small_paths[i][2] for i in idx]
    cap = max(max(b[2] - b[0], b[3] - b[1]) for b in bs)
    n_h = sum(1 for b in bs if (b[3] - b[1]) >= 0.8 * cap)
    n_w = sum(1 for b in bs if (b[2] - b[0]) >= 0.8 * cap)
    b = _bbox(page, idx)
    w, h = b[2] - b[0], b[3] - b[1]
    cs = [((q[0] + q[2]) / 2, (q[1] + q[3]) / 2) for q in bs]
    if len(cs) >= 6 and max(w, h) >= 4 * cap and min(w, h) >= 2.2 * cap:
        mx = sum(c[0] for c in cs) / len(cs)
        my = sum(c[1] for c in cs) / len(cs)
        sxx = sum((c[0] - mx) ** 2 for c in cs)
        syy = sum((c[1] - my) ** 2 for c in cs)
        sxy = sum((c[0] - mx) * (c[1] - my) for c in cs)
        ang = -math.degrees(0.5 * math.atan2(2 * sxy, sxx - syy))
        if 7 <= abs(ang) <= 83:
            return ang                      # text lying along a slanted line
    if n_h > n_w:
        return 0.0
    if n_w > n_h:
        return 90.0
    if w >= 1.6 * h:
        return 0.0
    if h >= 1.6 * w:
        return 90.0
    return None


def find_lines(page: Page) -> list[TextLine]:
    words = []
    for idx in _group(page):
        b = _bbox(page, idx)
        if max(b[2] - b[0], b[3] - b[1]) < 2.0:
            continue
        # the dashes of a dashed line: nothing but straight strokes, all pointing the same way
        if all(len(page.small_paths[i][1]) == 2 for i in idx):
            angs = [math.atan2(page.small_paths[i][1][1][1] - page.small_paths[i][1][0][1], page.small_paths[i][1][1][0] - page.small_paths[i][1][0][0]) % math.pi for i in idx]
            if max(angs) - min(angs) < 0.06 or (math.pi - (max(angs) - min(angs))) < 0.06:
                continue
        words.append({"idx": idx, "bbox": b, "angle": _angle(page, idx)})
    for w in words:
        b = w["bbox"]
        w["cap"] = max(max(q[2] - q[0], q[3] - q[1]) for q in (page.small_paths[i][2] for i in w["idx"]))
        w["slant"] = w["angle"] is not None and w["angle"] not in (0.0, 90.0)

    def chain(axis: int):
        """Join words that follow one another along x (axis 0) or along y (axis 1) on a common baseline."""
        uf = UnionFind(len(words))
        o = 1 - axis
        order = sorted((i for i in range(len(words)) if not words[i]["slant"]), key=lambda i: words[i]["bbox"][axis])
        for a_i, i in enumerate(order):
            bi = words[i]["bbox"]
            for j in order[a_i + 1: a_i + 80]:
                bj = words[j]["bbox"]
                H = max(words[i]["cap"], words[j]["cap"])
                gap = bj[axis] - bi[axis + 2]
                if gap > 1.5 * H:
                    if bj[axis] - bi[axis] > 400:
                        break
                    continue
                if gap < -0.6 * H:
                    continue
                # across the reading direction the two must sit on one line: centres and far edges agree
                ci, cj = (bi[o] + bi[o + 2]) / 2, (bj[o] + bj[o + 2]) / 2
                if abs(ci - cj) <= 0.45 * H and max(abs(bi[o] - bj[o]), abs(bi[o + 2] - bj[o + 2])) <= 0.75 * H:
                    uf.union(i, j)
        g: dict[int, list[int]] = defaultdict(list)
        for i in range(len(words)):
            g[uf.find(i)].append(i)
        return g

    def letters(i: int, level: bool) -> int:
        """How many strokes of this word are a full letter height tall (level text) / wide (text running up the sheet)."""
        cap = words[i]["cap"]
        k = 3 if level else 2
        return sum(1 for q in (page.small_paths[p][2] for p in words[i]["idx"]) if (q[k] - q[k - 2]) >= 0.8 * cap)

    gh, gv = chain(0), chain(1)
    of_h = {i: k for k, lst in gh.items() for i in lst}
    of_v = {i: k for k, lst in gv.items() for i in lst}
    out: list[TextLine] = []
    done: set[int] = set()
    # decide line by line: a run of words is level or upright according to how its letters stand
    for k, lst in sorted(gh.items(), key=lambda kv: -len(kv[1])):
        lst = [i for i in lst if i not in done and not words[i]["slant"]]
        if not lst:
            continue
        up = sum(letters(i, True) for i in lst)
        side = sum(letters(i, False) for i in lst)
        if up >= side:
            for i in lst:
                done.add(i)
            idx = [p for i in lst for p in words[i]["idx"]]
            out.append(TextLine(idx, 0.0, _bbox(page, idx), max(words[i]["cap"] for i in lst)))
    for k, lst in gv.items():
        lst = [i for i in lst if i not in done and not words[i]["slant"]]
        if not lst:
            continue
        for i in lst:
            done.add(i)
        idx = [p for i in lst for p in words[i]["idx"]]
        out.append(TextLine(idx, 90.0, _bbox(page, idx), max(words[i]["cap"] for i in lst)))
    for i, w in enumerate(words):
        if w["slant"]:
            out.append(TextLine(list(w["idx"]), w["angle"], w["bbox"], w["cap"]))
    return out


def _render(page: Page, ln: TextLine, cap_px=46, pad=14, pen=3, flip=False):
    """The line alone, turned upright, as a PIL image."""
    from PIL import Image, ImageDraw
    a = math.radians(ln.angle + (180 if flip else 0))
    ux, uy = math.cos(a), -math.sin(a)
    vx, vy = -uy, ux
    polys = []
    for i in ln.paths:
        polys.append([(p[0] * ux + p[1] * uy, p[0] * vx + p[1] * vy) for p in page.small_paths[i][1]])
    xs = [p[0] for pl in polys for p in pl]
    ys = [p[1] for pl in polys for p in pl]
    s = cap_px / max(ln.size, 2.5)
    W, H = int((max(xs) - min(xs)) * s) + 2 * pad, int((max(ys) - min(ys)) * s) + 2 * pad
    im = Image.new("L", (max(W, 20), max(H, 20)), 255)
    d = ImageDraw.Draw(im)
    for pl in polys:
        q = [((x - min(xs)) * s + pad, (y - min(ys)) * s + pad) for x, y in pl]
        if len(q) >= 2:
            d.line(q, fill=0, width=pen, joint="curve")
            for (x, y) in (q[0], q[-1]):
                d.ellipse([x - pen / 2, y - pen / 2, x + pen / 2, y + pen / 2], fill=0)
    return im


def _ocr_batch(images, psm=6):
    """Read many single-line images in one tesseract call: stack them in a column and split the result by row."""
    import pytesseract
    from PIL import Image
    gap = 34
    W = max(im.width for im in images) + 40
    H = sum(im.height for im in images) + gap * (len(images) + 1)
    sheet = Image.new("L", (W, H), 255)
    rows = []
    y = gap
    for im in images:
        sheet.paste(im, (20, y))
        rows.append((y, y + im.height))
        y += im.height + gap
    d = pytesseract.image_to_data(sheet, config=f"--psm {psm} -c preserve_interword_spaces=1", output_type=pytesseract.Output.DICT)
    texts: list[list[tuple[int, str, float]]] = [[] for _ in images]
    for t, c, top, h, left in zip(d["text"], d["conf"], d["top"], d["height"], d["left"]):
        if not t.strip():
            continue
        cy = top + h / 2
        k = min(range(len(rows)), key=lambda r: abs((rows[r][0] + rows[r][1]) / 2 - cy))
        if rows[k][0] - 12 <= cy <= rows[k][1] + 12:
            texts[k].append((left, t, float(c)))
    out = []
    for lst in texts:
        lst.sort()
        txt = " ".join(t for _, t, _ in lst)
        conf = sum(c for _, _, c in lst) / len(lst) if lst else 0.0
        out.append((txt, conf))
    return out


def read_lines(page: Page, lines: list[TextLine], batch=36, progress=None) -> None:
    todo = [ln for ln in lines if len(ln.paths) >= 1]
    for k in range(0, len(todo), batch):
        chunk = todo[k: k + batch]
        res = _ocr_batch([_render(page, ln) for ln in chunk])
        for ln, (t, c) in zip(chunk, res):
            ln.text, ln.conf = t, c
        if progress:
            progress(min(k + batch, len(todo)), len(todo))
    # upright text that reads badly may be upside down (or run downward): try the other way round
    weak = [ln for ln in todo if (ln.conf < 55 or not re.search(r"[A-Za-z0-9]", ln.text)) and len(ln.paths) >= 3]
    for k in range(0, len(weak), batch):
        chunk = weak[k: k + batch]
        res = _ocr_batch([_render(page, ln, flip=True) for ln in chunk])
        for ln, (t, c) in zip(chunk, res):
            if c > ln.conf + 8 and re.search(r"[A-Za-z0-9]", t):
                ln.text, ln.conf = t, c
                ln.angle = (ln.angle + 180 + 180) % 360 - 180


# --------------------------------------------------------------------------- letter shapes

def units(page: Page, ln: TextLine):
    """Split a line into letters (strokes that overlap along the reading direction) with the gaps between them."""
    a = math.radians(ln.angle)
    ux, uy = math.cos(a), -math.sin(a)
    vx, vy = -uy, ux
    items = []
    for i in ln.paths:
        pts = [(p[0] * ux + p[1] * uy, p[0] * vx + p[1] * vy) for p in page.small_paths[i][1]]
        items.append((min(p[0] for p in pts), max(p[0] for p in pts), pts))
    items.sort(key=lambda t: t[0])
    out: list[dict] = []
    join = 0.12 * max(ln.size, 3.0)          # strokes of one letter touch or overlap; letters stand apart
    for lo, hi, pts in items:
        if out and lo - out[-1]["hi"] <= join:
            out[-1]["hi"] = max(out[-1]["hi"], hi)
            out[-1]["paths"].append(pts)
            continue
        out.append({"lo": lo, "hi": hi, "paths": [pts]})
    hs = []
    for u in out:
        ys = [p[1] for pl in u["paths"] for p in pl]
        u["y0"], u["y1"] = min(ys), max(ys)
        hs.append(u["y1"] - u["y0"])
    cap = sorted(hs)[int(len(hs) * 0.7)] if hs else ln.size
    cap = max(cap, 2.0)
    for u in out:
        h = max(u["y1"] - u["y0"], u["hi"] - u["lo"], 0.5)
        sig = []
        for pl in u["paths"]:
            q = [((x - u["lo"]) / h, (y - u["y0"]) / h) for x, y in pl]
            if q[0] > q[-1]:
                q = q[::-1]
            sig.append(q)
        sig.sort(key=lambda q: (len(q), q[0]))
        u["sig"] = sig
        u["rel"] = round(min(1.6, (u["y1"] - u["y0"]) / cap) * 2) / 2      # coarse height class (case, punctuation)
    return out, cap


class Shapes:
    """Letters that are drawn identically get one cluster; OCR readings vote for what the cluster is."""

    def __init__(self):
        self.buckets: dict[tuple, list[int]] = defaultdict(list)
        self.sigs: list[list] = []
        self.votes: list[dict[str, float]] = []

    def cluster(self, u: dict) -> int:
        key = (u["rel"], tuple(len(q) for q in u["sig"]))
        for cid in self.buckets[key]:
            ref = self.sigs[cid]
            if all(abs(a[0] - b[0]) < 0.07 and abs(a[1] - b[1]) < 0.07 for qa, qb in zip(ref, u["sig"]) for a, b in zip(qa, qb)):
                return cid
        self.sigs.append(u["sig"])
        self.votes.append(defaultdict(float))
        self.buckets[key].append(len(self.sigs) - 1)
        return len(self.sigs) - 1

    def label(self, cid: int):
        v = self.votes[cid]
        if not v:
            return None, 0.0
        tot = sum(v.values())
        ch = max(v, key=lambda k: v[k])
        return ch, v[ch] / tot


def decode(page: Page, lines: list[TextLine], passes=((46, 3), (30, 3), (60, 5)), progress=None) -> Shapes:
    """OCR every line a few ways, let identical letter shapes agree on what they are, then spell each line from its shapes."""
    shapes = Shapes()
    info = []
    for ln in lines:
        us, cap = units(page, ln)
        for u in us:
            u["cid"] = shapes.cluster(u)
        info.append((us, cap))
    readings: list[list[tuple[str, float]]] = [[] for _ in lines]
    for pi, (cap_px, pen) in enumerate(passes):
        for k in range(0, len(lines), 36):
            chunk = list(range(k, min(k + 36, len(lines))))
            res = _ocr_batch([_render(page, lines[i], cap_px=cap_px, pen=pen) for i in chunk])
            for i, r in zip(chunk, res):
                readings[i].append(r)
        if progress:
            progress(pi + 1, len(passes))
    for i, ln in enumerate(lines):
        us, _ = info[i]
        for txt, conf in readings[i]:
            t = txt.replace(" ", "")
            if len(t) == len(us) and conf >= 55:
                for u, ch in zip(us, t):
                    shapes.votes[u["cid"]][ch] += conf / 100.0
    for i, ln in enumerate(lines):
        us, cap = info[i]
        best_txt, best_conf = max(readings[i], key=lambda r: r[1]) if readings[i] else ("", 0.0)
        aligned = next((t.replace(" ", "") for t, c in sorted(readings[i], key=lambda r: -r[1]) if len(t.replace(" ", "")) == len(us)), None)
        out, known = [], 0
        for k, u in enumerate(us):
            if k and u["lo"] - us[k - 1]["hi"] > 0.55 * cap:
                out.append(" ")
            ch, share = shapes.label(u["cid"])
            tot = sum(shapes.votes[u["cid"]].values())
            if ch is not None and tot >= 1.5 and share >= 0.66:
                out.append(ch)
                known += 1
            elif aligned:
                out.append(aligned[k])
            else:
                out.append("?")
        if us and (aligned or known >= 0.85 * len(us)):
            ln.text = "".join(out)
            ln.conf = max(best_conf, 100.0 * known / len(us)) if aligned else 100.0 * known / len(us)
        else:
            ln.text, ln.conf = best_txt, best_conf * 0.7
    return shapes



def apply(page: Page, min_conf=55.0, progress=None) -> dict:
    """Read stroke text and hand it to the rest of the pipeline as ordinary words; take its strokes out of the line work."""
    lines = find_lines(page)
    decode(page, lines, progress=progress)
    text_dids: set[int] = set()
    added = 0
    for ln in lines:
        t = re.sub(r"\s+", " ", ln.text).strip(" |~_-—")
        if ln.conf < min_conf or not re.search(r"[A-Za-z0-9]", t) or len(t.replace(" ", "")) < 1:
            continue
        if len(t) == 1 and not re.match(r"[A-Z0-9]", t):
            continue
        b = ln.bbox
        rot = 0.0 if ln.angle == 0 else 90.0 if ln.angle == 90 else ln.angle
        page.words.append(Word(t, b[0], b[1], b[2], b[3], rot, ln.size * 1.35, False))
        for i in ln.paths:
            text_dids.add(page.small_paths[i][0])
        added += 1
    if text_dids:
        page.segs = [s for s in page.segs if s.did not in text_dids]
        page.circles = [c for c in page.circles if c.did not in text_dids]
        page.arcs = [a for a in page.arcs if a.did not in text_dids]
    page.source = "vector+stroke-text"
    return {"lines": len(lines), "read": added, "strokesRemoved": len(text_dids)}
