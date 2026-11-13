"""Read one sheet of a CAD-plotted SIP into primitives.

Nothing here depends on colour or layer names. A primitive is classified only by its geometry:

  seg      a stroked straight piece (curves are flattened); thick lines that AutoCAD plots as thin filled
           quads are turned back into their centre line and flagged `thick`
  circle   a closed round outline (signal lamps, markers, shunt lamps)
  arc      an open curved outline (shunt disc, track curves are kept as segs as well)
  tri      a small filled triangle (arrow head): tip + pointing direction
  box      a small filled rectangle (point machine body, fouling mark bar)
  dot      a small filled circle (point machine detector end)
  word     a text span with its rotation
"""
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
    thick: bool = False        # came from a filled thin quad (a heavy line)
    did: int = -1              # index of the drawing it came from (strokes of one path stay together)
    curve: bool = False        # flattened from a bezier

    @property
    def length(self) -> float:
        return math.hypot(self.x1 - self.x0, self.y1 - self.y0)

    @property
    def angle(self) -> float:
        """Direction folded into [0, pi)."""
        return math.atan2(self.y1 - self.y0, self.x1 - self.x0) % math.pi

    @property
    def mid(self) -> tuple[float, float]:
        return ((self.x0 + self.x1) / 2, (self.y0 + self.y1) / 2)


@dataclass
class Circle:
    cx: float
    cy: float
    r: float
    filled: bool = False
    did: int = -1


@dataclass
class Arc:
    pts: list[tuple[float, float]]
    bbox: tuple[float, float, float, float]
    did: int = -1


@dataclass
class Tri:
    tip: tuple[float, float]
    base: tuple[float, float]          # middle of the edge opposite the tip
    size: float
    did: int = -1

    @property
    def direction(self) -> float:
        """Angle the arrow points to (from base to tip)."""
        return math.atan2(self.tip[1] - self.base[1], self.tip[0] - self.base[0])


@dataclass
class Box:
    x0: float
    y0: float
    x1: float
    y1: float
    angle: float = 0.0
    did: int = -1

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    rotation: float = 0.0     # degrees, 0 = reads left to right, 90 = reads upward
    size: float = 0.0
    bold: bool = False

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def horizontal(self) -> bool:
        return abs(self.rotation) < 20


@dataclass
class Page:
    width: float
    height: float
    segs: list[Seg] = field(default_factory=list)
    circles: list[Circle] = field(default_factory=list)
    arcs: list[Arc] = field(default_factory=list)
    tris: list[Tri] = field(default_factory=list)
    boxes: list[Box] = field(default_factory=list)
    dots: list[Circle] = field(default_factory=list)
    words: list[Word] = field(default_factory=list)
    rects: list[tuple[float, float, float, float]] = field(default_factory=list)   # stroked axis-aligned rectangles
    strips: list[tuple[float, float, float, float]] = field(default_factory=list)  # slivers of solid fills (to test 'is this filled')
    small_paths: list[tuple[int, list[tuple[float, float]], tuple[float, float, float, float]]] = field(default_factory=list)  # (drawing id, polyline, bbox) of small strokes: text drawn as lines
    source: str = "vector"       # vector | vector+stroke-text | raster


def _bez(p0, p1, p2, p3, n=8):
    out = []
    for i in range(1, n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t**3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def _path_points(items, T):
    """Vertices of a drawing path in order (curves flattened), plus a flag: does it contain curves."""
    pts: list[tuple[float, float]] = []
    curved = False
    for it in items:
        k = it[0]
        if k == "l":
            a, b = T(it[1]), T(it[2])
            if not pts or math.hypot(pts[-1][0] - a[0], pts[-1][1] - a[1]) > 1e-6:
                pts.append(a)
            pts.append(b)
        elif k == "c":
            curved = True
            a = T(it[1])
            if not pts or math.hypot(pts[-1][0] - a[0], pts[-1][1] - a[1]) > 1e-6:
                pts.append(a)
            pts.extend(_bez(a, T(it[2]), T(it[3]), T(it[4])))
        elif k == "re":
            r = it[1]
            c = [T((r.x0, r.y0)), T((r.x1, r.y0)), T((r.x1, r.y1)), T((r.x0, r.y1))]
            pts.extend(c + [c[0]])
        elif k == "qu":
            q = it[1]
            c = [T(q.ul), T(q.ur), T(q.lr), T(q.ll)]
            pts.extend(c + [c[0]])
    return pts, curved


def _distinct(pts, eps=0.05):
    out = []
    for p in pts:
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > eps for q in out):
            out.append(p)
    return out


def read_page(path: str, page_no: int = 0) -> Page:
    doc = pymupdf.open(path)
    pg = doc[page_no]
    M = pg.rotation_matrix
    page = Page(pg.rect.width, pg.rect.height)

    def T(p):
        q = pymupdf.Point(p[0], p[1]) * M if not hasattr(p, "x") else pymupdf.Point(p.x, p.y) * M
        return (q.x, q.y)

    strips: list[tuple[float, float, float, float]] = []
    for did, d in enumerate(pg.get_drawings()):
        filled = d.get("fill") is not None
        stroked = d.get("color") is not None
        w = d.get("width") or 0.0
        items = d["items"]
        if not items:
            continue
        kinds = {it[0] for it in items}
        pts, curved = _path_points(items, T)
        if len(pts) < 2:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        bx0, by0, bx1, by1 = min(xs), min(ys), max(xs), max(ys)
        bw, bh = bx1 - bx0, by1 - by0
        closed = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 0.3

        # ---- round outlines
        if kinds == {"c"} and closed and bw > 0.8 and abs(bw - bh) <= 0.12 * max(bw, bh):
            c = Circle((bx0 + bx1) / 2, (by0 + by1) / 2, (bw + bh) / 4, filled and not _is_white(d.get("fill")), did)
            if c.filled and c.r <= 4.0:
                page.dots.append(c)
            else:
                page.circles.append(c)
            if stroked and not filled and max(bw, bh) <= 18:
                page.small_paths.append((did, pts, (bx0, by0, bx1, by1)))      # may be the letter O of a stroke font
            continue

        # ---- filled shapes (no curves): arrow heads, heavy lines, boxes
        if filled and not curved and not _is_white(d.get("fill")):
            v = _distinct(pts)
            if min(bw, bh) < 0.7 and max(bw, bh) <= 30:
                strips.append((bx0, by0, bx1, by1))              # scan-line sliver of a solid fill (dot, box, hatch)
                continue
            if len(v) == 3 and max(bw, bh) <= 16:
                e = [(math.hypot(v[i][0] - v[(i + 1) % 3][0], v[i][1] - v[(i + 1) % 3][1]), i) for i in range(3)]
                _, i = min(e)                                   # shortest edge is the base; the other vertex is the tip
                tip = v[(i + 2) % 3]
                base = ((v[i][0] + v[(i + 1) % 3][0]) / 2, (v[i][1] + v[(i + 1) % 3][1]) / 2)
                page.tris.append(Tri(tip, base, math.hypot(tip[0] - base[0], tip[1] - base[1]), did))
                continue
            if len(v) == 4:
                # a quad: thin = heavy line, otherwise a small box
                e = [(math.hypot(v[i][0] - v[(i + 1) % 4][0], v[i][1] - v[(i + 1) % 4][1]), i) for i in range(4)]
                short = sorted(e)[:2]
                long_ = sorted(e)[2:]
                thickness = (short[0][0] + short[1][0]) / 2
                length = (long_[0][0] + long_[1][0]) / 2
                if thickness < 0.5:
                    strips.append((bx0, by0, bx1, by1))          # scan-line sliver of a solid fill (dot, box, hatch)
                    continue
                if thickness <= 2.6 and length >= 3.0 and length / max(thickness, 0.05) >= 2.2:
                    mids = []
                    for _, i in short:
                        a, b = v[i], v[(i + 1) % 4]
                        mids.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
                    page.segs.append(Seg(mids[0][0], mids[0][1], mids[1][0], mids[1][1], max(thickness, 0.9), True, did))
                    continue
                if max(bw, bh) <= 30 and min(bw, bh) >= 2.0:
                    a, b = v[long_[0][1]], v[(long_[0][1] + 1) % 4]
                    page.boxes.append(Box(bx0, by0, bx1, by1, math.atan2(b[1] - a[1], b[0] - a[0]) % math.pi, did))
                    continue
            if not stroked or w == 0:
                continue        # glyph outlines, hatching, logos: not line work

        if not stroked:
            continue
        if max(bw, bh) <= 18 and not filled:
            page.small_paths.append((did, pts, (bx0, by0, bx1, by1)))
        # ---- stroked line work
        if curved and not closed and len(items) <= 3 and max(bw, bh) <= 40:
            page.arcs.append(Arc(pts, (bx0, by0, bx1, by1), did))
        if not curved and closed and len(_distinct(pts)) == 4 and _axis_rect(_distinct(pts)):
            page.rects.append((bx0, by0, bx1, by1))
        for a, b in zip(pts, pts[1:]):
            if math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-4:
                page.segs.append(Seg(a[0], a[1], b[0], b[1], w, False, did, curved))

    page.strips = strips
    _blobs(page, strips)
    seen = set()
    for b in pg.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            dx, dy = ln["dir"]
            rot = (math.degrees(math.atan2(-dy, dx)) - float(pg.rotation) + 180) % 360 - 180
            for sp in ln["spans"]:
                txt = sp["text"].strip()
                if not txt:
                    continue
                r = pymupdf.Rect(sp["bbox"]) * M
                r.normalize()
                k = (txt, round(r.x0), round(r.y0))
                if k in seen:
                    continue
                seen.add(k)
                page.words.append(Word(txt, r.x0, r.y0, r.x1, r.y1, rot, sp.get("size", 0.0), "Bold" in sp.get("font", "")))
    return page


def _blobs(page: Page, strips) -> None:
    """Solid fills arrive as stacks of hairline slivers. Group touching slivers and keep the small solid ones."""
    from graphutil import UnionFind
    n = len(strips)
    if not n:
        return
    uf = UnionFind(n)
    cell = 4.0
    grid: dict[tuple[int, int], list[int]] = {}
    for i, (x0, y0, x1, y1) in enumerate(strips):
        for cx in range(int(x0 // cell), int(x1 // cell) + 1):
            for cy in range(int(y0 // cell), int(y1 // cell) + 1):
                grid.setdefault((cx, cy), []).append(i)
    for lst in grid.values():
        for a in range(len(lst)):
            for b in range(a + 1, len(lst)):
                i, j = lst[a], lst[b]
                A, B = strips[i], strips[j]
                if A[0] <= B[2] + 0.4 and B[0] <= A[2] + 0.4 and A[1] <= B[3] + 0.7 and B[1] <= A[3] + 0.7:
                    uf.union(i, j)
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(uf.find(i), []).append(i)
    for g in groups.values():
        x0 = min(strips[i][0] for i in g)
        y0 = min(strips[i][1] for i in g)
        x1 = max(strips[i][2] for i in g)
        y1 = max(strips[i][3] for i in g)
        w, h = x1 - x0, y1 - y0
        if len(g) < 3 or max(w, h) > 30:
            continue                                   # hatching or a lone sliver
        cover = sum((strips[i][2] - strips[i][0]) for i in g) / max(len(g) * w, 1e-6)   # mean sliver width / box width
        if max(w, h) <= 7.5 and abs(w - h) <= 0.35 * max(w, h):
            page.dots.append(Circle((x0 + x1) / 2, (y0 + y1) / 2, (w + h) / 4, True))
        elif 8.0 <= max(w, h) <= 22 and abs(w - h) <= 0.2 * max(w, h) and 0.6 <= cover <= 0.92 and len(g) >= 6:
            page.circles.append(Circle((x0 + x1) / 2, (y0 + y1) / 2, (w + h) / 4, True))      # a solid lamp drawn without an outline
        elif cover > 0.8 and min(w, h) >= 2.0:
            page.boxes.append(Box(x0, y0, x1, y1))


def _is_white(fill) -> bool:
    return fill is not None and all(v > 0.8 for v in fill)


def _axis_rect(v) -> bool:
    xs = sorted({round(p[0], 1) for p in v})
    ys = sorted({round(p[1], 1) for p in v})
    return len(xs) == 2 and len(ys) == 2
