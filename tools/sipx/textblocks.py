"""Group text spans into blocks (lines of one caption) and small helpers for reading captions."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from graphutil import UnionFind
from pdfio import Word


@dataclass
class Block:
    words: list[Word] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    @property
    def lines(self) -> list[str]:
        return [w.text for w in self.words]

    @property
    def cx(self) -> float:
        return sum(w.cx for w in self.words) / len(self.words)

    @property
    def cy(self) -> float:
        return sum(w.cy for w in self.words) / len(self.words)

    @property
    def bbox(self):
        return (min(w.x0 for w in self.words), min(w.y0 for w in self.words), max(w.x1 for w in self.words), max(w.y1 for w in self.words))

    @property
    def rotation(self) -> float:
        return self.words[0].rotation


def _frame(w: Word):
    """(along, across, height) of a span in its own reading frame."""
    a = math.radians(w.rotation)
    ux, uy = math.cos(a), -math.sin(a)          # reading direction on the sheet (y down)
    vx, vy = -uy, ux                            # line-feed direction
    along = w.cx * ux + w.cy * uy
    across = w.cx * vx + w.cy * vy
    upright = abs(abs(w.rotation) - 90) < 45
    h = (w.x1 - w.x0) if upright else (w.y1 - w.y0)
    ln = (w.y1 - w.y0) if upright else (w.x1 - w.x0)
    return along, across, max(h, 1.0), ln


def blocks(words: list[Word], line_gap=1.7, rot_tol=12.0) -> list[Block]:
    """Spans with the same rotation that sit on neighbouring lines and overlap along the reading direction."""
    n = len(words)
    uf = UnionFind(n)
    fr = [_frame(w) for w in words]
    order = sorted(range(n), key=lambda i: (round(words[i].rotation / rot_tol), fr[i][1]))
    for ii, i in enumerate(order):
        for j in order[ii + 1: ii + 40]:
            if abs(words[i].rotation - words[j].rotation) > rot_tol:
                break
            d_across = abs(fr[i][1] - fr[j][1])
            if d_across > line_gap * max(fr[i][2], fr[j][2]):
                continue
            # overlap along the reading direction (or nearly touching on the same line)
            a0, a1 = fr[i][0] - fr[i][3] / 2, fr[i][0] + fr[i][3] / 2
            b0, b1 = fr[j][0] - fr[j][3] / 2, fr[j][0] + fr[j][3] / 2
            if min(a1, b1) - max(a0, b0) >= -6.0:
                uf.union(i, j)
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(uf.find(i), []).append(i)
    out = []
    for g in groups.values():
        g.sort(key=lambda i: (round(fr[i][1] / 3), fr[i][0]))
        out.append(Block([words[i] for i in g]))
    return out


NUM = r"(-?\d+(?:\.\d+)?)"
CH_RE = re.compile(r"CH\s*[:.\-]\s*" + NUM + r"(?:\s*[mM]\b)?", re.I)   # the separator is required: CH51 is a crank handle
KM_RE = re.compile(r"\bkm\.?\s*[:.\-]?\s*" + NUM, re.I)


def chainage_of(text: str):
    m = CH_RE.search(text)
    return float(m.group(1)) if m else None
