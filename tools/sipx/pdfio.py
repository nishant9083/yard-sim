"""Read a SIP PDF page into plain Python structures (segments, words, rectangles)."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import pymupdf


@dataclass
class Seg:
    x0: float
    y0: float
    x1: float
    y1: float
    width: float = 0.72
    dashed: bool = False

    @property
    def length(self) -> float:
        return math.hypot(self.x1 - self.x0, self.y1 - self.y0)

    @property
    def axis_aligned(self) -> bool:
        return abs(self.x1 - self.x0) < 0.05 or abs(self.y1 - self.y0) < 0.05


@dataclass
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    color: int = 0
    rotation: float = 0.0  # degrees, 0 = horizontal

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class Page:
    width: float
    height: float
    segs: list[Seg] = field(default_factory=list)       # stroked lines, curves flattened
    fills: list[tuple[float, float, float, float]] = field(default_factory=list)  # bboxes of filled shapes
    words: list[Word] = field(default_factory=list)
    frame: tuple[float, float, float, float] | None = None  # sheet border


def _flatten_bezier(p0, p1, p2, p3, n=10):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t**3
        pts.append((a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y))
    return pts


def read_page(path: str, page_no: int = 0) -> Page:
    doc = pymupdf.open(path)
    pg = doc[page_no]
    page = Page(pg.rect.width, pg.rect.height)
    M = pg.rotation_matrix  # drawings and text come in unrotated space; the viewer sees the rotated sheet
    rot_extra = -float(pg.rotation)

    def T(p):
        q = pymupdf.Point(p.x if hasattr(p, 'x') else p[0], p.y if hasattr(p, 'y') else p[1]) * M
        return pymupdf.Point(q.x, q.y)

    def TR(r):
        q = pymupdf.Rect(r) * M
        q.normalize()
        return q
    for d in pg.get_drawings():
        filled = d.get("fill") is not None
        stroked = d.get("color") is not None
        dashed = bool(d.get("dashes")) and d["dashes"] not in ("[] 0", "")
        w = d.get("width") or 0.0
        if filled:
            r = TR(d["rect"])
            page.fills.append((r.x0, r.y0, r.x1, r.y1))
        if not stroked:
            continue
        cur = None
        for it in d["items"]:
            kind = it[0]
            if kind == "l":
                a, b = T(it[1]), T(it[2])
                page.segs.append(Seg(a.x, a.y, b.x, b.y, w, dashed))
            elif kind == "c":
                pts = [(T(it[1]).x, T(it[1]).y)] + _flatten_bezier(T(it[1]), T(it[2]), T(it[3]), T(it[4]))
                for a, b in zip(pts, pts[1:]):
                    page.segs.append(Seg(a[0], a[1], b[0], b[1], w, dashed))
            elif kind == "re":
                r = TR(it[1])
                for a, b in (((r.x0, r.y0), (r.x1, r.y0)), ((r.x1, r.y0), (r.x1, r.y1)), ((r.x1, r.y1), (r.x0, r.y1)), ((r.x0, r.y1), (r.x0, r.y0))):
                    page.segs.append(Seg(a[0], a[1], b[0], b[1], w, dashed))
            elif kind == "qu":
                q = it[1]
                pts = [T(q.ul), T(q.ur), T(q.lr), T(q.ll), T(q.ul)]
                for a, b in zip(pts, pts[1:]):
                    page.segs.append(Seg(a.x, a.y, b.x, b.y, w, dashed))
        del cur
    for b in pg.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            dx, dy = ln["dir"]
            rot = (math.degrees(math.atan2(-dy, dx)) + rot_extra + 180) % 360 - 180
            for sp in ln["spans"]:
                txt = sp["text"].strip()
                if not txt:
                    continue
                bb = TR(sp["bbox"])
                x0, y0, x1, y1 = bb.x0, bb.y0, bb.x1, bb.y1
                page.words.append(Word(txt, x0, y0, x1, y1, sp.get("color", 0), rot))
    # overprinted text (the same string drawn twice at the same spot) would otherwise appear doubled
    seen: set[tuple[str, int, int]] = set()
    uniq = []
    for w in page.words:
        k = (w.text, round(w.x0), round(w.y0))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(w)
    page.words = uniq
    page.frame = _find_frame(page)
    return page


def _find_frame(page: Page):
    """Sheet border: the longest axis-aligned segments that nearly span the page."""
    xs = [s for s in page.segs if abs(s.y0 - s.y1) < 0.05 and s.length > page.width * 0.5]
    ys = [s for s in page.segs if abs(s.x0 - s.x1) < 0.05 and s.length > page.height * 0.5]
    if not xs or not ys:
        return None
    return (min(s.x0 for s in ys), min(s.y0 for s in xs), max(s.x0 for s in ys), max(s.y0 for s in xs))
