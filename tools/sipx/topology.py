"""Turn stroked line work into a planar track graph.

Pipeline:  strokes -> chains (join by touching ends) -> merge collinear pieces across small gaps
           -> node every T-touch / crossing -> edges between nodes -> drop tables/frame -> prune spurs.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

from graphutil import PointGrid, UnionFind, angle_diff, point_seg_distance
from pdfio import Page, Seg

Pt = tuple[float, float]


@dataclass
class Params:
    min_width: float = 0.4          # ignore hairlines (glyph outlines, hatching)
    join_eps: float = 0.7           # ends closer than this are the same vertex
    min_line_len: float = 14.0      # shorter chains are symbols (IJ ticks, arrow heads...), not track
    collinear_deg: float = 1.0
    collinear_offset: float = 0.9
    collinear_gap: float = 3.5
    touch_eps: float = 5.0          # end this close to another line's body is a T junction
    vertex_eps: float = 3.2         # vertices closer than this are one junction (drawn gaps at points)
    spur_len: float = 10.0          # dead-end stubs shorter than this are symbols (ticks / buffer bars)
    keep_table_like: bool = False


@dataclass
class Edge:
    a: int
    b: int
    pts: list[Pt]
    length: float = 0.0


@dataclass
class Graph:
    verts: list[Pt] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    symbol_segs: list[Seg] = field(default_factory=list)   # short strokes left over (ticks, arrows, glyph bits)


def plen(pts: list[Pt]) -> float:
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))


def _chains(segs: list[Seg], P: Params):
    """Join strokes that touch end-to-end into polylines (only through degree-2 vertices)."""
    grid = PointGrid(P.join_eps)
    ends = []
    inc: dict[int, list[int]] = defaultdict(list)
    for i, s in enumerate(segs):
        a, b = grid.add(s.x0, s.y0), grid.add(s.x1, s.y1)
        ends.append((a, b))
        inc[a].append(i)
        inc[b].append(i)
    used = [False] * len(segs)
    out: list[tuple[list[Pt], list[int]]] = []

    def walk(start_seg: int, start_v: int):
        pts = [grid.pts[start_v]]
        idxs = []
        v, i = start_v, start_seg
        while True:
            used[i] = True
            idxs.append(i)
            a, b = ends[i]
            nv = b if a == v else a
            pts.append(grid.pts[nv])
            nxt = [j for j in inc[nv] if j != i and not used[j]]
            if len(inc[nv]) != 2 or not nxt:
                return pts, idxs
            v, i = nv, nxt[0]

    for v, lst in inc.items():                 # open chains start at non-degree-2 vertices
        if len(lst) != 2:
            for i in lst:
                if not used[i]:
                    out.append(walk(i, v))
    for i in range(len(segs)):                 # remaining are closed loops
        if not used[i]:
            out.append(walk(i, ends[i][0]))
    return out


def _merge_collinear(lines: list[list[Pt]], P: Params) -> list[list[Pt]]:
    """Join straight 2-point lines that lie on one straight line with small gaps (track drawn in pieces)."""
    straight = [(i, l) for i, l in enumerate(lines) if len(l) == 2]
    rest = [l for l in lines if len(l) != 2]
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    info = {}
    for i, l in straight:
        (x0, y0), (x1, y1) = l
        ang = math.atan2(y1 - y0, x1 - x0) % math.pi
        nx, ny = -math.sin(ang), math.cos(ang)
        off = x0 * nx + y0 * ny
        info[i] = (ang, off)
        buckets[(int(round(math.degrees(ang) / P.collinear_deg)), int(round(off / 1.0)))].append(i)
    uf = UnionFind(len(lines))
    keys = list(buckets)
    keyset = set(keys)
    for (ka, ko) in keys:
        for da in (-1, 0, 1):
            for do in (-1, 0, 1):
                k2 = (ka + da, ko + do)
                if k2 not in keyset or k2 < (ka, ko):
                    continue
                for i in buckets[(ka, ko)]:
                    for j in buckets[k2]:
                        if j <= i and k2 == (ka, ko):
                            continue
                        ai, oi = info[i]
                        aj, oj = info[j]
                        if angle_diff(ai, aj) > math.radians(P.collinear_deg) and angle_diff(ai, aj + math.pi) > math.radians(P.collinear_deg):
                            continue
                        if abs(oi - oj) > P.collinear_offset and abs(oi + oj) > 1e9:
                            continue
                        # along-line interval gap
                        ux, uy = math.cos(ai), math.sin(ai)
                        ti = sorted((lines[i][0][0] * ux + lines[i][0][1] * uy, lines[i][1][0] * ux + lines[i][1][1] * uy))
                        tj = sorted((lines[j][0][0] * ux + lines[j][0][1] * uy, lines[j][1][0] * ux + lines[j][1][1] * uy))
                        if max(ti[0], tj[0]) - min(ti[1], tj[1]) <= P.collinear_gap:
                            uf.union(i, j)
    groups: dict[int, list[int]] = defaultdict(list)
    for i, _ in straight:
        groups[uf.find(i)].append(i)
    merged = list(rest)
    for g in groups.values():
        pts = [p for i in g for p in lines[i]]
        ai = info[g[0]][0]
        ux, uy = math.cos(ai), math.sin(ai)
        lo = min(pts, key=lambda p: p[0] * ux + p[1] * uy)
        hi = max(pts, key=lambda p: p[0] * ux + p[1] * uy)
        merged.append([lo, hi])
    return merged


def _split_points(lines: list[list[Pt]], P: Params):
    """For each polyline, the (segment index, t, point) positions where another line touches or crosses it."""
    cell = 40.0
    grid: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for li, l in enumerate(lines):
        for si, (a, b) in enumerate(zip(l, l[1:])):
            for cx in range(int(min(a[0], b[0]) // cell) - 0, int(max(a[0], b[0]) // cell) + 1):
                for cy in range(int(min(a[1], b[1]) // cell) - 0, int(max(a[1], b[1]) // cell) + 1):
                    grid[(cx, cy)].append((li, si))
    splits: list[list[tuple[int, float, Pt]]] = [[] for _ in lines]
    snaps: dict[tuple[int, int], Pt] = {}

    def near(p: Pt):
        cx, cy = int(p[0] // cell), int(p[1] // cell)
        seen = set()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for item in grid.get((cx + dx, cy + dy), ()):
                    if item not in seen:
                        seen.add(item)
                        yield item

    # 1. an end of line A touching the body of line B
    for li, l in enumerate(lines):
        for which, end in ((0, l[0]), (1, l[-1])):
            best = None
            for lj, sj in near(end):
                if lj == li:
                    continue
                a, b = lines[lj][sj], lines[lj][sj + 1]
                d, t = point_seg_distance(end[0], end[1], a[0], a[1], b[0], b[1])
                if d <= P.touch_eps and 0.0 < t < 1.0 and (best is None or d < best[0]):
                    q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
                    # prefer sliding along the line's own direction so a horizontal track stays horizontal
                    prev = l[1] if which == 0 else l[-2]
                    ux, uy = end[0] - prev[0], end[1] - prev[1]
                    den = ux * (b[1] - a[1]) - uy * (b[0] - a[0])
                    if abs(den) > 1e-6:
                        tt = ((a[0] - end[0]) * (b[1] - a[1]) - (a[1] - end[1]) * (b[0] - a[0])) / den
                        uu = ((a[0] - end[0]) * uy - (a[1] - end[1]) * ux) / den
                        if abs(tt) * math.hypot(ux, uy) <= P.touch_eps * 1.6 and -0.02 <= uu <= 1.02:
                            q = (end[0] + tt * ux, end[1] + tt * uy)
                            t = max(0.001, min(0.999, uu))
                    best = (d, lj, sj, t, q)
            if best:
                _, lj, sj, t, q = best
                splits[lj].append((sj, t, q))
                snaps[(li, which)] = q
    # 2. proper crossings between different lines
    done = set()
    for (li, si) in [it for lst in grid.values() for it in lst]:
        a, b = lines[li][si], lines[li][si + 1]
        for lj, sj in near(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)):
            if lj <= li or (li, si, lj, sj) in done:
                continue
            done.add((li, si, lj, sj))
            c, d = lines[lj][sj], lines[lj][sj + 1]
            den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
            if abs(den) < 1e-9:
                continue
            t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
            u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
            if 0.02 < t < 0.98 and 0.02 < u < 0.98:
                q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
                splits[li].append((si, t, q))
                splits[lj].append((sj, u, q))
    return splits, snaps


def build_graph(page: Page, P: Params | None = None) -> Graph:
    P = P or Params()
    segs = [s for s in page.segs if s.width >= P.min_width and s.length > 0.05 and not s.dashed]
    g = Graph()
    chains = _chains(segs, P)
    lines: list[list[Pt]] = []
    for pts, idxs in chains:
        if plen(pts) >= P.min_line_len:
            lines.append(pts)
        else:
            g.symbol_segs.extend(segs[i] for i in idxs)
    lines = _merge_collinear(lines, P)
    splits, snaps = _split_points(lines, P)
    for (li, which), q in snaps.items():
        lines[li][0 if which == 0 else -1] = q

    grid = PointGrid(P.vertex_eps)
    for li, l in enumerate(lines):
        # build the vertex sequence for this line: original points + split points, in order
        seq: list[tuple[float, Pt, bool]] = []   # (position, point, is_node)
        for si, p in enumerate(l):
            seq.append((float(si), p, si in (0, len(l) - 1)))
        for si, t, q in splits[li]:
            seq.append((si + t, q, True))
        seq.sort(key=lambda s: s[0])
        cur: list[Pt] = []
        last_node = None
        for pos, p, is_node in seq:
            cur.append(p)
            if is_node:
                v = grid.add(*p)
                if last_node is not None and v != last_node and len(cur) >= 2:
                    pts = [grid.pts[last_node]] + cur[1:-1] + [grid.pts[v]]
                    g.edges.append(Edge(last_node, v, pts, plen(pts)))
                last_node = v
                cur = [p]
    g.verts = grid.pts
    return g


def components(g: Graph) -> list[list[int]]:
    uf = UnionFind(len(g.verts))
    for e in g.edges:
        uf.union(e.a, e.b)
    comp: dict[int, list[int]] = defaultdict(list)
    for i, e in enumerate(g.edges):
        comp[uf.find(e.a)].append(i)
    return list(comp.values())


def _edge_axis(e: Edge, tol=0.02) -> bool:
    (x0, y0), (x1, y1) = e.pts[0], e.pts[-1]
    return len(e.pts) == 2 and (abs(x1 - x0) < tol * max(1, e.length) or abs(y1 - y0) < tol * max(1, e.length))


def drop_non_track(g: Graph, page: Page, P: Params) -> tuple[Graph, dict]:
    """Remove the sheet frame and rectilinear tables (they are line work but not track)."""
    report = {"frameOrTable": 0, "tables": []}
    keep: list[Edge] = []
    for comp in components(g):
        es = [g.edges[i] for i in comp]
        axis = sum(_edge_axis(e) for e in es) / len(es)
        xs = [p[0] for e in es for p in e.pts]
        ys = [p[1] for e in es for p in e.pts]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        covers_page = w > page.width * 0.8 and h > page.height * 0.5
        hs = sum(1 for e in es if _edge_axis(e) and abs(e.pts[-1][1] - e.pts[0][1]) < 1)
        vs = sum(1 for e in es if _edge_axis(e) and abs(e.pts[-1][0] - e.pts[0][0]) < 1)
        # a table is a grid: many horizontal AND vertical edges, no oblique ones
        grid_like = axis > 0.95 and hs >= 3 and vs >= 3
        if (covers_page and axis > 0.6 and len(es) < 12) or grid_like:
            report["frameOrTable"] += len(es)
            if grid_like and not covers_page:
                report["tables"].append(es)
            continue
        keep.extend(es)
    out = Graph(g.verts, keep, g.symbol_segs)
    return out, report


def prune_spurs(g: Graph, P: Params) -> tuple[Graph, list[tuple[Pt, Pt]]]:
    """Drop short dead-end stubs (IJ ticks, buffer-stop bars). Returns the stubs for later classification."""
    stubs = []
    changed = True
    edges = list(g.edges)
    while changed:
        changed = False
        deg = defaultdict(int)
        for e in edges:
            deg[e.a] += 1
            deg[e.b] += 1
        nxt = []
        for e in edges:
            if e.length < P.spur_len and (deg[e.a] == 1 or deg[e.b] == 1) and not (deg[e.a] == 1 and deg[e.b] == 1 and e.length >= 3):
                stubs.append((e.pts[0], e.pts[-1]))
                changed = True
            else:
                nxt.append(e)
        edges = nxt
    return Graph(g.verts, edges, g.symbol_segs), stubs
