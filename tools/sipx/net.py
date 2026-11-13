"""Geometry queries over the station skeleton (shifted coordinates)."""
from __future__ import annotations

import math

from graphutil import point_seg_distance

Pt = tuple[float, float]


class Net:
    def __init__(self, st: dict):
        self.node = {n["id"]: (n["x"], n["y"]) for n in st["nodes"]}
        self.kind = {n["id"]: n["kind"] for n in st["nodes"]}
        self.tracks: dict[str, list[Pt]] = {t["id"]: [self.node[i] for i in t["nodeIds"]] for t in st["tracks"]}
        self.track_nodes: dict[str, list[str]] = {t["id"]: list(t["nodeIds"]) for t in st["tracks"]}
        self.conns: dict[str, list[Pt]] = {}
        self.conn_ends: dict[str, tuple[str, str]] = {}
        for c in st["connections"]:
            self.conns[c["id"]] = [self.node[c["from"]]] + [(v["x"], v["y"]) for v in c.get("via", [])] + [self.node[c["to"]]]
            self.conn_ends[c["id"]] = (c["from"], c["to"])

    def rails(self):
        for tid, pts in self.tracks.items():
            yield "track", tid, pts
        for cid, pts in self.conns.items():
            yield "conn", cid, pts

    def nearest(self, p: Pt, tracks_only=False):
        """(distance, kind, id, point, position along the polyline, direction angle there)."""
        best = None
        for kind, rid, pts in self.rails():
            if tracks_only and kind != "track":
                continue
            for k, (a, b) in enumerate(zip(pts, pts[1:])):
                d, t = point_seg_distance(p[0], p[1], a[0], a[1], b[0], b[1])
                if best is None or d < best[0]:
                    best = (d, kind, rid, (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])), k + t,
                            math.atan2(b[1] - a[1], b[0] - a[0]))
        return best

    def track_y(self, tid: str, x: float):
        pts = self.tracks[tid]
        for a, b in zip(pts, pts[1:]):
            lo, hi = sorted((a[0], b[0]))
            if lo - 1e-6 <= x <= hi + 1e-6 and hi > lo:
                return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
        return None

    def tracks_at_x(self, x: float):
        out = []
        for tid in self.tracks:
            y = self.track_y(tid, x)
            if y is not None:
                out.append((y, tid))
        return sorted(out)
