"""Find the track layout in the line work of a CAD-plotted SIP.

The yard is drawn along the sheet (x). Rails are the lines that carry track-circuit captions or are plotted
heavy; turnouts and crossovers are the curves and slanted lines whose ends land on those lines.  Everything
else that happens to be a line (dimension lines, leaders, platform edges, chart boxes) is left out because it
is closed, steep, ends in an arrow head, or is simply not connected to a rail.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

from graphutil import PointGrid, UnionFind, point_seg_distance
from patterns import TC_RE
from pdfio import Page, Seg

Pt = tuple[float, float]


@dataclass
class Params:
    join_eps: float = 0.6            # stroke ends this close are the same vertex
    min_len: float = 22.0            # shorter chains are symbol strokes
    gap_merge: float = 9.0           # collinear rail pieces separated by a break mark are one rail
    max_slope_deg: float = 42.0      # steeper lines are leaders / bridge marks, not rails
    flat_deg: float = 1.6            # a straight line flatter than this is a running line; slanted ones are links
    link_reach: float = 13.0         # a branch end this close to a rail joins it (drawn gap / heel hook)
    end_join: float = 7.0            # rail ends this close meet end to end
    caption_reach: float = 20.0      # a TC caption this close above/below a line marks it as a rail
    seed_min_len: float = 60.0
    merge_min_len: float = 15.0      # pieces shorter than this are not merged into a rail (scans: lower)
    min_rail_len: float = 45.0        # nothing shorter is a rail or a link


@dataclass
class Line:
    pts: list[Pt]
    thick: bool = False
    curved: bool = False
    hooks: list[int] = field(default_factory=list)     # 0 / -1: that end had a heel hook
    role: str = ""                                      # track | link | ""
    attach: dict[int, tuple[int, Pt]] = field(default_factory=dict)   # end index -> (line index, point on it)
    evidence: int = 0
    breaks: list[Pt] = field(default_factory=list)       # break marks (//) along the rail

    @property
    def length(self) -> float:
        return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(self.pts, self.pts[1:]))

    @property
    def chord_deg(self) -> float:
        (x0, y0), (x1, y1) = self.pts[0], self.pts[-1]
        return abs(math.degrees(math.atan2(y1 - y0, abs(x1 - x0) + 1e-9)))

    def max_seg_deg(self) -> float:
        m = 0.0
        for a, b in zip(self.pts, self.pts[1:]):
            if math.hypot(b[0] - a[0], b[1] - a[1]) < 0.8:
                continue
            m = max(m, abs(math.degrees(math.atan2(b[1] - a[1], abs(b[0] - a[0]) + 1e-9))))
        return m

    def flat_share(self, P: "Params") -> float:
        tot = flat = 0.0
        for a, b in zip(self.pts, self.pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            tot += L
            if abs(math.degrees(math.atan2(b[1] - a[1], abs(b[0] - a[0]) + 1e-9))) <= P.flat_deg:
                flat += L
        return flat / tot if tot else 0.0

    def is_flat(self, P: "Params") -> bool:
        return self.flat_share(P) >= 0.7


def chains(segs: list[Seg], P: Params):
    """Join strokes end to end (through vertices where exactly two strokes meet)."""
    grid = PointGrid(P.join_eps)
    ends, inc = [], defaultdict(list)
    for i, s in enumerate(segs):
        a, b = grid.add(s.x0, s.y0), grid.add(s.x1, s.y1)
        ends.append((a, b))
        if a != b:
            inc[a].append(i)
            inc[b].append(i)
    used = [False] * len(segs)
    out = []

    def walk(i, v):
        pts, idx = [grid.pts[v]], []
        while True:
            used[i] = True
            idx.append(i)
            a, b = ends[i]
            nv = b if a == v else a
            pts.append(grid.pts[nv])
            nxt = [j for j in inc[nv] if j != i and not used[j]]
            if len(inc[nv]) != 2 or not nxt:
                return pts, idx, nv
            v, i = nv, nxt[0]

    for v, lst in list(inc.items()):
        if len(lst) != 2:
            for i in lst:
                if not used[i]:
                    pts, idx, _ = walk(i, v)
                    out.append((pts, idx, False))
    for i in range(len(segs)):
        if not used[i] and ends[i][0] != ends[i][1]:
            pts, idx, endv = walk(i, ends[i][0])
            out.append((pts, idx, endv == ends[i][0]))
    return out


def _simplify(pts: list[Pt], tol=0.25) -> list[Pt]:
    """Drop vertices that lie on the straight line between their neighbours."""
    if len(pts) <= 2:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        d, _ = point_seg_distance(pts[i][0], pts[i][1], out[-1][0], out[-1][1], pts[i + 1][0], pts[i + 1][1])
        if d > tol:
            out.append(pts[i])
    out.append(pts[-1])
    return out


def _strip_hooks(ln: Line) -> None:
    """A turnout branch starts with a short square hook toward the rail it leaves; remove it and remember the end."""
    for end in (0, -1):
        if len(ln.pts) < 3:
            return
        a, b, c = (ln.pts[0], ln.pts[1], ln.pts[2]) if end == 0 else (ln.pts[-1], ln.pts[-2], ln.pts[-3])
        l1 = math.hypot(b[0] - a[0], b[1] - a[1])
        if l1 > 12:
            continue
        a1 = math.atan2(b[1] - a[1], b[0] - a[0])
        a2 = math.atan2(c[1] - b[1], c[0] - b[0])
        turn = abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi)
        if turn > math.radians(55):
            if end == 0:
                ln.pts = ln.pts[1:]
            else:
                ln.pts = ln.pts[:-1]
            ln.hooks.append(end)


def _trim_end_arcs(ln: Line, max_len=26.0, min_turn=22.0) -> None:
    """Rails are often finished with a small flare or arc; cut it so the rail ends where it stops being straight."""
    if len(ln.pts) < 4 or ln.length < 120:
        return
    # direction of the body: the longest segment
    body = max(zip(ln.pts, ln.pts[1:]), key=lambda ab: math.hypot(ab[1][0] - ab[0][0], ab[1][1] - ab[0][1]))
    ba = math.atan2(body[1][1] - body[0][1], body[1][0] - body[0][0]) % math.pi
    for end in (0, -1):
        cut, run = 0, 0.0
        seq = list(zip(ln.pts, ln.pts[1:])) if end == 0 else [(b, a) for a, b in zip(ln.pts, ln.pts[1:])][::-1]
        for k, (a, b) in enumerate(seq):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            ang = math.atan2(b[1] - a[1], b[0] - a[0]) % math.pi
            dev = min(abs(ang - ba), math.pi - abs(ang - ba))
            if dev > math.radians(min_turn) and run + L <= max_len:
                run += L
                cut = k + 1
            else:
                break
        if cut and len(ln.pts) - cut >= 2:
            ln.pts = ln.pts[cut:] if end == 0 else ln.pts[:-cut]
            ln.hooks.append(end)


def _has_step(ln: Line) -> bool:
    return any(abs(b[0] - a[0]) < 0.35 * abs(b[1] - a[1]) and math.hypot(b[0] - a[0], b[1] - a[1]) >= 5.0
               for a, b in zip(ln.pts, ln.pts[1:]))


def find_lines(page: Page, P: Params):
    """All line objects long enough to be rail, plus what was left over (symbol strokes, closed outlines)."""
    work = []
    seen: set[tuple[int, int, int, int]] = set()
    for s in page.segs:
        if (s.thick and s.length < 40) or s.length <= 0.05:
            continue
        a, b = (round(s.x0 * 2), round(s.y0 * 2)), (round(s.x1 * 2), round(s.y1 * 2))
        k = (*min(a, b), *max(a, b))
        if k in seen:            # the same stroke plotted twice
            continue
        seen.add(k)
        work.append(s)
    ticks = [s for s in page.segs if s.thick and s.length < 40]
    lines: list[Line] = []
    small: list[Seg] = []
    loops: list[list[Pt]] = []
    outlines: list[list[Pt]] = []
    for pts, idx, closed in chains(work, P):
        if not closed and P.merge_min_len < 15 and len(idx) and sum(work[i].length for i in idx) < P.min_len:
            # scans: a short level piece of a broken rail is still line, not a symbol stroke
            (ax, ay), (bx, by) = pts[0], pts[-1]
            if abs(by - ay) < 0.6 and abs(bx - ax) >= P.merge_min_len:
                lines.append(Line([pts[0], pts[-1]], thick=any(work[i].thick for i in idx)))
                continue
        L = sum(work[i].length for i in idx)
        if closed:
            loops.append(pts)
            continue
        if L < P.min_len:
            small.extend(work[i] for i in idx)
            continue
        ln = Line(_simplify(pts), thick=any(work[i].thick for i in idx), curved=any(work[i].curve for i in idx))
        _strip_hooks(ln)
        _trim_end_arcs(ln)
        if _has_step(ln):
            outlines.append(ln.pts)        # an outline with square steps (platform edge, bracket), never a rail
            continue
        lines.append(ln)
    return lines, small, ticks, loops, outlines


def _merge_collinear(lines: list[Line], P: Params) -> list[Line]:
    """Rail drawn in pieces (break marks, heavy line plotted as several quads) becomes one line; copies are dropped."""
    for l in lines:                        # a polyline that is really straight is a two-point line
        if len(l.pts) > 2 and all(point_seg_distance(p[0], p[1], l.pts[0][0], l.pts[0][1], l.pts[-1][0], l.pts[-1][1])[0] <= 0.35 for p in l.pts[1:-1]):
            l.pts = [l.pts[0], l.pts[-1]]
    cand = [i for i, l in enumerate(lines) if len(l.pts) == 2 and l.length >= P.merge_min_len]
    cs = set(cand)
    info = {}
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i in cand:
        (x0, y0), (x1, y1) = lines[i].pts
        ang = math.atan2(y1 - y0, x1 - x0) % math.pi
        nx, ny = -math.sin(ang), math.cos(ang)
        off = x0 * nx + y0 * ny
        info[i] = (ang, off)
        buckets[(int(round(math.degrees(ang) * 2)) % 360, int(round(off)))].append(i)
    uf = UnionFind(len(lines))
    for (ka, ko), lst in list(buckets.items()):
        for da in (-1, 0, 1):
            for do in (-1, 0, 1):
                other = buckets.get(((ka + da) % 360, ko + do), [])
                for i in lst:
                    for j in other:
                        if j <= i:
                            continue
                        ai, oi = info[i]
                        aj, oj = info[j]
                        dang = min(abs(ai - aj), math.pi - abs(ai - aj))
                        if dang > math.radians(0.5) or abs(oi - oj) > 0.9:
                            continue
                        ux, uy = math.cos(ai), math.sin(ai)
                        ti = sorted(p[0] * ux + p[1] * uy for p in lines[i].pts)
                        tj = sorted(p[0] * ux + p[1] * uy for p in lines[j].pts)
                        if max(ti[0], tj[0]) - min(ti[1], tj[1]) <= P.gap_merge:
                            uf.union(i, j)
    groups: dict[int, list[int]] = defaultdict(list)
    for i in cand:
        groups[uf.find(i)].append(i)
    out = [l for i, l in enumerate(lines) if i not in cs]
    for g in groups.values():
        if len(g) == 1:
            out.append(lines[g[0]])
            continue
        ai = info[g[0]][0]
        ux, uy = math.cos(ai), math.sin(ai)
        pts = [p for i in g for p in lines[i].pts]
        lo = min(pts, key=lambda p: p[0] * ux + p[1] * uy)
        hi = max(pts, key=lambda p: p[0] * ux + p[1] * uy)
        m = Line([lo, hi], thick=any(lines[i].thick for i in g))
        # remember real gaps (break marks) between the pieces
        iv = sorted(sorted(p[0] * ux + p[1] * uy for p in lines[i].pts) for i in g)
        t0 = lo[0] * ux + lo[1] * uy
        reach = iv[0][1]
        for a_, b_ in iv[1:]:
            if a_ - reach > 1.0:
                t = (a_ + reach) / 2 - t0
                m.breaks.append((lo[0] + t * ux, lo[1] + t * uy))
            reach = max(reach, b_)
        out.append(m)
    # drop a line that lies on top of another (same rail plotted again, e.g. heavy + thin)
    out.sort(key=lambda l: -l.length)
    keep: list[Line] = []
    for ln in out:
        covered = False
        for big in keep:
            if big.length < ln.length:
                continue
            n = max(3, int(ln.length // 12))
            ok = True
            for k in range(n + 1):
                t = k / n
                # sample along ln
                target = t * ln.length
                acc = 0.0
                q = ln.pts[-1]
                for a_, b_ in zip(ln.pts, ln.pts[1:]):
                    L = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
                    if acc + L >= target and L > 0:
                        u = (target - acc) / L
                        q = (a_[0] + u * (b_[0] - a_[0]), a_[1] + u * (b_[1] - a_[1]))
                        break
                    acc += L
                if _nearest_on(big, q)[0] > 1.0:
                    ok = False
                    break
            if ok:
                covered = True
                big.thick = big.thick or ln.thick
                break
        if not covered:
            keep.append(ln)
    return keep


def _nearest_on(ln: Line, p: Pt):
    best = (1e9, 0, p)
    for k, (a, b) in enumerate(zip(ln.pts, ln.pts[1:])):
        d, t = point_seg_distance(p[0], p[1], a[0], a[1], b[0], b[1])
        if d < best[0]:
            best = (d, k + t, (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
    return best      # distance, position along the polyline (segment index + t), point


def faces(a: "Line", a_end: Pt, b: "Line", b_end: Pt, dx=30.0, dy=12.0) -> bool:
    """Two flat lines continue each other across a gap: ends close, and neither runs back alongside the other."""
    if abs(a_end[0] - b_end[0]) > dx or abs(a_end[1] - b_end[1]) > dy:
        return False
    a_far = a.pts[-1] if a_end == a.pts[0] else a.pts[0]
    b_far = b.pts[-1] if b_end == b.pts[0] else b.pts[0]
    # a runs away from the gap on one side, b on the other
    return (a_far[0] - a_end[0]) * (b_far[0] - b_end[0]) < 0 and (a_far[0] - a_end[0]) * (b_end[0] - a_end[0]) <= 0


def select_rails(page: Page, lines: list[Line], small: list[Seg], P: Params) -> list[Line]:
    """Keep the lines that are rail: seeded by captions / heavy pen, grown through what joins them."""
    tips = [t for t in page.tris if t.size >= 3.0]
    # upright strokes, to recognise table rows (a line boxed in by verticals touching it all along)
    uprights = [(sg.x0, min(sg.y0, sg.y1), max(sg.y0, sg.y1)) for sg in page.segs if abs(sg.x1 - sg.x0) < 0.4 and sg.length >= 5 and not sg.thick]
    up_grid: dict[int, list[tuple[float, float, float]]] = defaultdict(list)
    for u in uprights:
        up_grid[int(u[0] // 40)].append(u)

    def table_row(ln: "Line") -> bool:
        if len(ln.pts) != 2 or abs(ln.pts[0][1] - ln.pts[1][1]) > 0.4:
            return False
        y = ln.pts[0][1]
        x0, x1 = sorted((ln.pts[0][0], ln.pts[1][0]))
        hits = []
        for b in range(int(x0 // 40) - 1, int(x1 // 40) + 2):
            for ux, ua, ub in up_grid.get(b, ()):
                if x0 - 1.0 <= ux <= x1 + 1.0 and ua - 0.8 <= y <= ub + 0.8:
                    hits.append(ux)
        ends = sum(1 for e in (x0, x1) if any(abs(h - e) <= 1.0 for h in hits))
        if ends < 2 or len({round(h) for h in hits}) < 3:
            return False
        # and a table has another rule of exactly the same extent a row above or below
        return any(o is not ln and len(o.pts) == 2 and abs(o.pts[0][1] - o.pts[1][1]) < 0.4 and 0 < abs(o.pts[0][1] - y) <= 40
                   and abs(min(o.pts[0][0], o.pts[1][0]) - x0) <= 1.5 and abs(max(o.pts[0][0], o.pts[1][0]) - x1) <= 1.5 for o in lines)

    big_circles = [c for c in page.circles if c.r >= 3.4]

    def through_symbol(ln: "Line") -> bool:
        # rails never run through a lamp; strike-through and leader lines do
        for c in big_circles:
            for a, b in zip(ln.pts, ln.pts[1:]):
                if min(a[0], b[0]) - c.r <= c.cx <= max(a[0], b[0]) + c.r and point_seg_distance(c.cx, c.cy, a[0], a[1], b[0], b[1])[0] < c.r * 0.9:
                    return True
        return False
    steep_ends = [p for ln in lines if ln.chord_deg > 60 for p in (ln.pts[0], ln.pts[-1])]
    steep_ends += [p for sg in small if sg.length >= 4 and abs(sg.x1 - sg.x0) < 0.35 * abs(sg.y1 - sg.y0) for p in ((sg.x0, sg.y0), (sg.x1, sg.y1))]
    ok: list[Line] = []
    for ln in lines:
        if table_row(ln) or through_symbol(ln):
            continue
        # an edge of a box (platform, building): it turns a square corner into an upright line
        if any(math.hypot(e[0] - q[0], e[1] - q[1]) < 1.6 for e in (ln.pts[0], ln.pts[-1]) for q in steep_ends):
            continue
        if ln.max_seg_deg() > P.max_slope_deg and ln.chord_deg > P.max_slope_deg * 0.6:
            continue
        # dimension / leader lines end in an arrow head that points along them
        arrow = False
        for end, nb in ((ln.pts[0], ln.pts[1]), (ln.pts[-1], ln.pts[-2])):
            la = math.atan2(nb[1] - end[1], nb[0] - end[0]) % math.pi
            for t in tips:
                if math.hypot(t.tip[0] - end[0], t.tip[1] - end[1]) < 2.0 or math.hypot(t.base[0] - end[0], t.base[1] - end[1]) < 2.0:
                    # only an arrow that points along the line makes it a dimension line (a signal arrow stands square to it)
                    d = abs((t.direction % math.pi) - la)
                    if min(d, math.pi - d) < math.radians(25):
                        arrow = True
        if arrow:
            continue
        ok.append(ln)

    captions = [w for w in page.words if w.horizontal and TC_RE.match(w.text.replace(" ", ""))]
    for w in captions:
        best = None
        for i, ln in enumerate(ok):
            d, _, q = _nearest_on(ln, (w.cx, w.cy))
            if d <= P.caption_reach and abs(q[0] - w.cx) < 3.0 and (best is None or d < best[0]):
                best = (d, i)
        if best:
            ok[best[1]].evidence += 1
    rail = [ln.evidence > 0 and ln.length >= P.seed_min_len for ln in ok]
    changed = True
    while changed:
        changed = False
        for i, ln in enumerate(ok):
            if rail[i]:
                continue
            for j, other in enumerate(ok):
                if not rail[j] or i == j:
                    continue
                touch = False
                for e, (end, nb) in enumerate(((ln.pts[0], ln.pts[1]), (ln.pts[-1], ln.pts[-2]))):
                    d, pos, _ = _nearest_on(other, end)
                    if d > P.link_reach:
                        continue
                    # a branch comes in at an angle or with a heel hook; a line running parallel beside a rail is not one
                    k = min(int(pos), len(other.pts) - 2)
                    ra = math.atan2(other.pts[k + 1][1] - other.pts[k][1], other.pts[k + 1][0] - other.pts[k][0]) % math.pi
                    ea = math.atan2(nb[1] - end[1], nb[0] - end[0]) % math.pi
                    dev = min(abs(ra - ea), math.pi - abs(ra - ea))
                    if d <= 1.5 or dev > math.radians(1.2) or (0 if e == 0 else -1) in ln.hooks:
                        touch = True
                for end in (other.pts[0], other.pts[-1]):
                    d, _, _ = _nearest_on(ln, end)
                    if d <= P.end_join:
                        touch = True
                    # two flat rails facing each other across a break mark, with a small sideways step
                    if ln.is_flat(P) and other.is_flat(P):
                        for mine in (ln.pts[0], ln.pts[-1]):
                            if faces(ln, mine, other, end) and ln.length >= 100:
                                touch = True
                if touch:
                    rail[i] = True
                    changed = True
                    break
    keep = [ln for i, ln in enumerate(ok) if rail[i] and ln.length >= P.min_rail_len]
    return _main_network(keep, P)


def _main_network(rails: list[Line], P: Params) -> list[Line]:
    """A station is one connected network. A line that joins nothing and is much shorter than the yard
    (a table rule that happened to hold a circuit name) is dropped."""
    n = len(rails)
    if n <= 1:
        return rails
    uf = UnionFind(n)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = rails[i], rails[j]
            near = any(_nearest_on(b, e)[0] <= P.link_reach for e in (a.pts[0], a.pts[-1])) or \
                any(_nearest_on(a, e)[0] <= P.link_reach for e in (b.pts[0], b.pts[-1])) or \
                any(faces(a, ea, b, eb) for ea in (a.pts[0], a.pts[-1]) for eb in (b.pts[0], b.pts[-1]) if a.is_flat(P) and b.is_flat(P))
            if near:
                uf.union(i, j)
    tot: dict[int, float] = defaultdict(float)
    for i, r in enumerate(rails):
        tot[uf.find(i)] += r.length
    big = max(tot.values())
    return [r for i, r in enumerate(rails) if tot[uf.find(i)] >= 0.3 * big]
