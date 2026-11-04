"""Small geometry helpers shared by the extractor stages."""
from __future__ import annotations

import math
from collections import defaultdict


class UnionFind:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, a: int) -> int:
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


class PointGrid:
    """Spatial hash for 'is there already a vertex within eps of here?'."""

    def __init__(self, eps: float):
        self.eps = eps
        self.cells: dict[tuple[int, int], list[int]] = defaultdict(list)
        self.pts: list[tuple[float, float]] = []

    def add(self, x: float, y: float) -> int:
        cx, cy = int(x // self.eps), int(y // self.eps)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in self.cells.get((cx + dx, cy + dy), ()):
                    px, py = self.pts[i]
                    if math.hypot(px - x, py - y) <= self.eps:
                        return i
        self.pts.append((x, y))
        self.cells[(cx, cy)].append(len(self.pts) - 1)
        return len(self.pts) - 1


def angle(dx: float, dy: float) -> float:
    return math.atan2(dy, dx)


def angle_diff(a: float, b: float) -> float:
    d = abs(a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d)


def point_seg_distance(px, py, x0, y0, x1, y1):
    """Return (distance, t) where t in [0,1] is the projection parameter on the segment."""
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return math.hypot(px - x0, py - y0), 0.0
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / L2))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)), t
