"""Chainage scale of the sheet: chainage (m) = |x - originX| * metresPerUnit, from the printed CH captions."""
from __future__ import annotations

import re


def calibrate(pairs: list[tuple[float, float]], scale_hint: float | None = None):
    """pairs = (x on the sheet, printed chainage). Returns (originX, metresPerUnit, rms error in metres) or None."""
    pairs = [(x, c) for x, c in pairs if c >= 0]
    if len(pairs) < 4:
        return None
    # the origin is somewhere between the smallest chainages on either side; start from the smallest one
    x0 = min(pairs, key=lambda p: p[1])[0]
    k = scale_hint or 0.35278
    best = None
    n0 = len(pairs)
    for _ in range(40):
        # ch = s*k*(x - x0)  ->  s*ch = k*x - k*x0   (linear least squares in k and b = k*x0)
        rows = [(x, (1.0 if x >= x0 else -1.0) * c) for x, c in pairs]
        n = len(rows)
        sx = sum(r[0] for r in rows)
        sy = sum(r[1] for r in rows)
        sxx = sum(r[0] * r[0] for r in rows)
        sxy = sum(r[0] * r[1] for r in rows)
        den = n * sxx - sx * sx
        if abs(den) < 1e-9:
            return None
        k = (n * sxy - sx * sy) / den
        b = (k * sx - sy) / n
        if k <= 0:
            return None
        x0 = b / k
        res = [abs(abs(x - x0) * k - c) for x, c in pairs]
        rms = (sum(r * r for r in res) / n) ** 0.5
        best = (x0, k, rms)
        # misread captions (OCR) or a caption on the wrong leader: drop the worst one and refit
        if rms <= 4.0 or len(pairs) <= max(4, int(0.6 * n0)):
            break
        worst = max(range(len(pairs)), key=lambda i: res[i])
        pairs = pairs[:worst] + pairs[worst + 1:]
    return best


def scale_from_text(words) -> float | None:
    """1:1000 plotted at 1 pt = 1/72 inch gives 0.35278 m per point."""
    for w in words:
        m = re.search(r"1\s*:\s*(\d{3,5})", w.text)
        if m and ("SCALE" in w.text.upper() or any("SCALE" in o.text.upper() and abs(o.cy - w.cy) < 30 and abs(o.cx - w.cx) < 300 for o in words)):
            return int(m.group(1)) * 0.0254 / 72
    return None
