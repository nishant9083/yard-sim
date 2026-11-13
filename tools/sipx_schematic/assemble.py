"""Group graph edges into running lines (tracks) and links between them (connections)."""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

from graphutil import angle_diff
from topology import Edge, Graph, Pt, plen


@dataclass
class Path:
    verts: list[int]                  # graph vertex ids at the graph nodes (junctions / ends)
    pts: list[Pt]                     # full polyline, including bend points
    length: float = 0.0
    kind: str = "track"               # track | connection
    ends: tuple[int, int] = (0, 0)


def _dir_from(g: Graph, e: Edge, v: int) -> float:
    """Direction of edge e leaving vertex v."""
    if e.a == v:
        p, q = e.pts[0], e.pts[1]
    else:
        p, q = e.pts[-1], e.pts[-2]
    return math.atan2(q[1] - p[1], q[0] - p[0])


def assemble(g: Graph, max_bend_deg: float = 55.0) -> tuple[list[Path], dict[int, int]]:
    inc: dict[int, list[int]] = defaultdict(list)
    for i, e in enumerate(g.edges):
        inc[e.a].append(i)
        inc[e.b].append(i)
    deg = {v: len(l) for v, l in inc.items()}
    used = [False] * len(g.edges)
    max_bend = math.radians(max_bend_deg)
    paths: list[Path] = []

    def extend(v: int, e: Edge, pts: list[Pt], verts: list[int], at_end: bool):
        """Walk on from vertex v along the straightest unused edge, appending to the path."""
        while True:
            came = _dir_from(g, e, v) + math.pi                    # direction we were travelling
            best, best_d = None, 1e9
            for j in inc[v]:
                if used[j]:
                    continue
                d = angle_diff(_dir_from(g, g.edges[j], v), came)  # 0 = dead straight on
                if d < best_d:
                    best, best_d = j, d
            if best is None or best_d > max_bend:
                return
            used[best] = True
            ne = g.edges[best]
            nv = ne.b if ne.a == v else ne.a
            seg = ne.pts if ne.a == v else ne.pts[::-1]
            if at_end:
                pts.extend(seg[1:])
                verts.append(nv)
            else:
                pts[:0] = seg[::-1][:-1]
                verts.insert(0, nv)
            v, e = nv, ne

    order = sorted(range(len(g.edges)), key=lambda i: -g.edges[i].length)
    for i in order:
        if used[i]:
            continue
        used[i] = True
        e = g.edges[i]
        pts = list(e.pts)
        verts = [e.a, e.b]
        extend(e.b, e, pts, verts, True)
        extend(e.a, e, pts, verts, False)
        paths.append(Path(verts, pts, plen(pts), ends=(verts[0], verts[-1])))

    # a path that starts and ends on other paths (both ends are junctions) links two running lines
    for p in paths:
        a, b = p.ends
        if deg.get(a, 0) >= 3 and deg.get(b, 0) >= 3:
            p.kind = "connection"
    # a link must end on running lines: demote any 'connection' whose end touches no track
    changed = True
    while changed:
        changed = False
        on_track = {v for p in paths if p.kind == "track" for v in p.verts}
        for p in paths:
            if p.kind == "connection" and not (p.ends[0] in on_track and p.ends[1] in on_track):
                p.kind = "track"
                changed = True
    return paths, deg
