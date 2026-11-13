"""Read assets (signals, points, axle sections, ticks, names, free text) from the page text and symbols.

All matching is done in page coordinates and then shifted by `origin` so it lines up with the station JSON.
Every rule is a heuristic with a short comment saying what in the drawing it relies on, and anything that
could not be placed is returned in the report so a person can fix it in an overrides file.
"""
from __future__ import annotations

import math
import re
from collections import defaultdict

from graphutil import point_seg_distance
from pdfio import Page, Word

AXLE_RE = re.compile(r"^[A-Z]*\d+[A-Z]?(?:XT|AT|BT)\d?$")
POINT_RE = re.compile(r"^\d{2,3}[A-Z]?(?:/[A-Z])*$")
SIGNAL_BLACK_RE = re.compile(r"^(?:SH|C)\d")
NAME_RE = re.compile(r"\b(LINE|YARD|SIDING|LOOP|GOODS|SHED)\b")
RED = 0xFF0000


class Net:
    """Nearest-track queries over the station JSON polylines (shifted coordinates)."""

    def __init__(self, st: dict):
        nid = {n["id"]: (n["x"], n["y"]) for n in st["nodes"]}
        self.lines: dict[str, list[tuple[float, float]]] = {}
        for t in st["tracks"]:
            self.lines[t["id"]] = [nid[i] for i in t["nodeIds"]]
        self.conns: dict[str, list[tuple[float, float]]] = {}
        for c in st["connections"]:
            self.conns[c["id"]] = [nid[c["from"]]] + [(v["x"], v["y"]) for v in c.get("via", [])] + [nid[c["to"]]]
        self.nodes = st["nodes"]

    def nearest(self, x: float, y: float, include_conns=False):
        best = None
        pools = [self.lines] + ([self.conns] if include_conns else [])
        for pool in pools:
            for tid, pts in pool.items():
                for a, b in zip(pts, pts[1:]):
                    d, t = point_seg_distance(x, y, a[0], a[1], b[0], b[1])
                    if best is None or d < best[0]:
                        best = (d, tid, a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        return best  # (dist, id, px, py)

    def nearest_node(self, x, y, kinds=("junction",)):
        best = None
        for n in self.nodes:
            if n["kind"] not in kinds:
                continue
            d = math.hypot(n["x"] - x, n["y"] - y)
            if best is None or d < best[0]:
                best = (d, n["id"])
        return best

    def y_at(self, tid: str, x: float):
        pts = self.lines[tid]
        for a, b in zip(pts, pts[1:]):
            lo, hi = sorted((a[0], b[0]))
            if lo - 1e-6 <= x <= hi + 1e-6 and hi > lo:
                return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
        return None


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")


def _uniq(base: str, seen: set[str]) -> str:
    i, out = 2, base
    while out in seen:
        out = f"{base}_{i}"
        i += 1
    seen.add(out)
    return out


def extract_assets(page: Page, st: dict, origin: tuple[float, float], symbol_segs, cfg: dict, claimed: set[int]):
    ox, oy = origin
    net = Net(st)
    words = [w for w in page.words if abs(w.rotation) < 1.0 and id(w) not in claimed]
    report: dict[str, list] = defaultdict(list)
    ids: set[str] = set()
    X = lambda v: round(v - ox, 2)   # noqa: E731
    Y = lambda v: round(v - oy, 2)   # noqa: E731

    # coarse yard box (to tell yard text from notes/tables): bounds of all nodes
    xs = [n["x"] for n in st["nodes"]]
    ys = [n["y"] for n in st["nodes"]]
    yard = (min(xs) - 25, min(ys) - 40, max(xs) + 25, max(ys) + 40)
    in_yard = lambda w: yard[0] <= w.cx - ox <= yard[2] and yard[1] <= w.cy - oy <= yard[3]   # noqa: E731

    signal_red = sum(1 for w in words if w.color == RED) >= 5

    # ---- detection ticks (thick cross bars on the rail) -> joints
    joints = []
    ticks_by_track: dict[str, list[float]] = defaultdict(list)
    # detection points are drawn as thick (1.0-1.7 pt) short bars crossing the rail at a right angle
    for s in symbol_segs:
        if not (1.0 <= s.width <= 1.8) or s.length < 1.5 or s.length > 20:
            continue
        mx, my = (s.x0 + s.x1) / 2 - ox, (s.y0 + s.y1) / 2 - oy
        d, tid, px, py = net.nearest(mx, my) or (1e9, None, 0, 0)
        if d > 4.5:
            continue
        # must be roughly perpendicular to the rail there
        pts = net.lines[tid]
        best = min(zip(pts, pts[1:]), key=lambda ab: point_seg_distance(mx, my, ab[0][0], ab[0][1], ab[1][0], ab[1][1])[0])
        ta = math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0])
        sa = math.atan2(s.y1 - s.y0, s.x1 - s.x0)
        dif = abs(((ta - sa) % math.pi) - math.pi / 2)
        if dif > 0.5:
            continue
        if any(abs(px - x) < 2.5 for x in ticks_by_track[tid]):
            continue
        ticks_by_track[tid].append(round(px, 2))
    for tid, lst in ticks_by_track.items():
        for x in sorted(lst):
            joints.append({"id": f"IJ_{tid}_{int(x)}", "trackId": tid, "x": x})

    # ---- axle-counter sections: label sits between two ticks
    tcs = []
    for w in words:
        if not AXLE_RE.match(w.text):
            continue
        d, tid, px, py = net.nearest(w.cx - ox, w.cy - oy) or (1e9, None, 0, 0)
        if d > 22:
            report["axleLabelsUnplaced"].append(w.text)
            continue
        claimed.add(id(w))
        ts = sorted(ticks_by_track.get(tid, []))
        left = max([t for t in ts if t <= px], default=None)
        right = min([t for t in ts if t > px], default=None)
        x0 = left if left is not None else px - 18
        x1 = right if right is not None else px + 18
        tcs.append({"id": _uniq("TC_" + _slug(w.text), ids), "code": w.text, "kind": "axleCounter",
                    "spans": [{"trackId": tid, "x0": round(x0, 2), "x1": round(x1, 2)}],
                    "label": {"x": X(w.cx), "y": Y(w.cy)}, "approx": left is None or right is None, "text": w.text})

    # ---- points: black numbers close to a junction
    points = []
    taken_nodes: dict[str, int] = defaultdict(int)
    for w in words:
        if id(w) in claimed or not POINT_RE.match(w.text):
            continue
        if signal_red and w.color == RED:
            continue
        nn = net.nearest_node(w.cx - ox, w.cy - oy, kinds=("junction",))
        if not nn or nn[0] > cfg.get("pointLabelRadius", 28):
            continue
        claimed.add(id(w))
        digits = int(re.match(r"\d+", w.text).group())
        conn = next((c["id"] for c in st["connections"] if nn[1] in (c["from"], c["to"])), None)
        p = {"id": _uniq("P" + _slug(w.text), ids), "code": w.text, "nodeId": nn[1], "ratio": "", "switch": "",
             "ratioInferred": True, "control": digits, "label": {"x": X(w.cx), "y": Y(w.cy)}}
        if conn:
            p["connectionId"] = conn
        points.append(p)
        taken_nodes[nn[1]] += 1

    # ---- signals: red labels (or SH/C names) with a stem to the rail and a head beside it
    stems = [s for s in page.segs if abs(s.x1 - s.x0) < 0.3 and 4.0 <= s.length <= 45 and s.width >= 0.4 and not s.dashed]
    fills = [f for f in page.fills if 3.0 <= f[2] - f[0] <= 14 and 3.0 <= f[3] - f[1] <= 14]
    signals = []
    for w in words:
        if id(w) in claimed:
            continue
        is_sig = (signal_red and w.color == RED and re.search(r"\d", w.text) and len(w.text) <= 16) or SIGNAL_BLACK_RE.match(w.text)
        if not is_sig or AXLE_RE.match(w.text):
            continue
        claimed.add(id(w))
        lx, ly = w.cx, w.cy
        best = None
        for s in stems:
            d, _ = point_seg_distance(lx, ly, s.x0, s.y0, s.x1, s.y1)
            if d > 40:
                continue
            for foot, tip in (((s.x0, s.y0), (s.x1, s.y1)), ((s.x1, s.y1), (s.x0, s.y0))):
                nr = net.nearest(foot[0] - ox, foot[1] - oy)
                if nr and nr[0] <= 2.8 and (best is None or d < best[0]):
                    best = (d, foot, tip, nr)
        code = w.text
        kind = "shunt" if code.startswith("SH") else "signal"
        if best:
            _, foot, tip, nr = best
            tid = nr[1]
            fx = foot[0] - ox
            side = "above" if tip[1] < foot[1] else "below"
            near = [f for f in fills if math.hypot((f[0] + f[2]) / 2 - tip[0], (f[1] + f[3]) / 2 - tip[1]) < 26]
            cxm = sum((f[0] + f[2]) / 2 for f in near) / len(near) if near else tip[0] + 5
            head = "east" if cxm >= foot[0] else "west"
            lamps = [f for f in near if abs((f[2] - f[0]) - (f[3] - f[1])) < 2.0 and f[2] - f[0] >= 4.5]
            n = max(1, min(6, len(lamps)))
        else:
            d, tid, px, py = net.nearest(lx - ox, ly - oy) or (1e9, None, 0, 0)
            if tid is None or d > 45:
                report["signalsUnplaced"].append(code)
                continue
            fx, side, head, n = px, ("above" if ly - oy < py else "below"), "east", 1
            report["signalsWithoutStem"].append(code)
        elements = [{"kind": "shunt", "text": code}] if kind == "shunt" else [{"kind": "lamp", "style": "solid"}] * n
        signals.append({
            "id": _uniq("SIG_" + _slug(code), ids), "code": code, "name": f"Signal {code}", "kind": kind,
            "direction": "UP" if head == "east" else "DN", "trackId": tid, "footX": round(fx, 2),
            "anchorX": round(fx + (2.0 if head == "east" else -2.0), 2), "side": side, "headDir": head,
            "elements": elements, "label": {"x": X(lx), "y": Y(ly)},
        })
        m = re.match(r"(?:SH|C)?(\d+)", code)
        if m:
            signals[-1]["control"] = int(m.group(1))

    # ---- track names: line/yard captions near a track end
    names = {}
    for w in words:
        if id(w) in claimed or not NAME_RE.search(w.text) or not in_yard(w):
            continue
        best = None
        for tid, pts in net.lines.items():
            for end in (pts[0], pts[-1]):
                d = math.hypot(end[0] - (w.cx - ox), end[1] - (w.cy - oy))
                if best is None or d < best[0]:
                    best = (d, tid)
        if best and best[0] < 90 and best[1] not in names:
            names[best[1]] = w.text.title()
            claimed.add(id(w))

    # ---- everything else inside the yard becomes a text annotation (kept, never silently dropped)
    annotations = []
    far: list[Word] = []
    for w in words:
        if id(w) in claimed:
            continue
        nr = net.nearest(w.cx - ox, w.cy - oy, include_conns=True)
        if not in_yard(w) or nr is None or nr[0] > cfg.get("annotationRadius", 30):
            far.append(w)           # not beside any track: title, legend text, free notes
            continue
        annotations.append({"id": _uniq("A_" + _slug(w.text)[:18], ids), "text": w.text, "x": X(w.cx), "y": Y(w.cy),
                            "tone": "end" if (w.y1 - w.y0) > 7 else "line"})
        claimed.add(id(w))
    rotated = [w.text for w in page.words if abs(w.rotation) >= 1.0 and in_yard(w)]
    if rotated:
        report["rotatedTextSkipped"] = rotated

    assets = {"points": points, "signals": signals, "joints": joints, "trackCircuits": tcs, "annotations": annotations}
    return assets, names, claimed, dict(report), far
