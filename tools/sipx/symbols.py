"""Recognise the symbols drawn on and beside the rails, by shape only.

  insulated joint   a short heavy tick square across a rail
  fouling mark      a short heavier bar beside a rail (with FM text)
  signal            an arrow whose tip stands on a rail, a wire, and a row of lamp circles / markers / shunt disc
  point             the place where a turnout leg lands on a line; its number is the nearest label
"""
from __future__ import annotations

import math
import re
from collections import defaultdict

from graphutil import point_seg_distance
from net import Net
from patterns import POINT_RE, RATIO_RE, SIGNAL_RE, TC_RE
from pdfio import Page, Seg, Word

Pt = tuple[float, float]


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")


def uniq(base: str, seen: set[str]) -> str:
    out, i = base, 2
    while out in seen:
        out = f"{base}_{i}"
        i += 1
    seen.add(out)
    return out


# --------------------------------------------------------------------------- joints

def find_joints(ticks: list[Seg], net: Net, origin: Pt, thin: list[Seg] | None = None):
    """Heavy ticks square across a rail. Returns joints on tracks, joints on connections, and fouling bars."""
    ox, oy = origin
    on_track: dict[str, list[float]] = defaultdict(list)
    on_conn: dict[str, list[Pt]] = defaultdict(list)
    fouling: list[Pt] = []
    # sheets drawn in one pen weight: a short stroke that crosses the rail square, centred on it, is a joint too
    extra = []
    for s in thin or []:
        if not (4.0 <= s.length <= 14.0) or s.curve:
            continue
        nr = net.nearest((s.mid[0] - ox, s.mid[1] - oy))
        if not nr or nr[0] > 0.8:
            continue
        if abs(((s.angle - nr[5]) % math.pi) - math.pi / 2) < math.radians(12):
            s2 = Seg(s.x0, s.y0, s.x1, s.y1, 1.0, True, s.did)
            extra.append(s2)
    # scans: a tick is cut in two by the rail it crosses; two short square stubs facing each other across it make one
    stubs: dict[str, list[tuple[float, int]]] = defaultdict(list)
    for s in thin or []:
        if not (1.5 <= s.length <= 8.0):
            continue
        for end, far in (((s.x0, s.y0), (s.x1, s.y1)), ((s.x1, s.y1), (s.x0, s.y0))):
            nr = net.nearest((end[0] - ox, end[1] - oy), tracks_only=True)
            if not nr or nr[0] > 1.6:
                continue
            if abs(((s.angle - nr[5]) % math.pi) - math.pi / 2) > math.radians(15):
                continue
            side = 1 if (far[1] - oy) > nr[3][1] else -1
            stubs[nr[2]].append((nr[3][0], side))
            break
    for tid, lst in stubs.items():
        lst.sort()
        for (xa, sa), (xb, sb) in zip(lst, lst[1:]):
            if sa != sb and abs(xa - xb) <= 1.2:
                y = net.track_y(tid, (xa + xb) / 2)
                if y is not None:
                    xm = (xa + xb) / 2 + ox
                    extra.append(Seg(xm, y + oy - 3, xm, y + oy + 3, 1.0, True))
    for s in list(ticks) + extra:
        mx, my = s.mid[0] - ox, s.mid[1] - oy
        nr = net.nearest((mx, my))
        if not nr:
            continue
        d, kind, rid, q, _, ang = nr
        square = abs(((s.angle - ang) % math.pi) - math.pi / 2) < math.radians(28)
        if s.width >= 1.6 and s.length <= 12:
            if d <= 30:
                fouling.append((mx, my))
            continue
        if not (4.0 <= s.length <= 18) or not square or d > 2.2:
            continue
        if kind == "track":
            if all(abs(q[0] - x) > 1.5 for x in on_track[rid]):
                on_track[rid].append(round(q[0], 2))
        else:
            if all(math.hypot(q[0] - p[0], q[1] - p[1]) > 1.5 for p in on_conn[rid]):
                on_conn[rid].append((round(q[0], 2), round(q[1], 2)))
    return on_track, on_conn, fouling


# --------------------------------------------------------------------------- signals

class Cluster:
    def __init__(self):
        self.segs: list[Seg] = []
        self.circles = []
        self.arcs = []
        self.rects = []

    def bbox(self):
        xs, ys = [], []
        for s in self.segs:
            xs += [s.x0, s.x1]
            ys += [s.y0, s.y1]
        for c in self.circles:
            xs += [c.cx - c.r, c.cx + c.r]
            ys += [c.cy - c.r, c.cy + c.r]
        for a in self.arcs:
            xs += [a.bbox[0], a.bbox[2]]
            ys += [a.bbox[1], a.bbox[3]]
        return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def _seg_touch(a: Seg, b: Seg, eps: float) -> bool:
    if (point_seg_distance(a.x0, a.y0, b.x0, b.y0, b.x1, b.y1)[0] <= eps or point_seg_distance(a.x1, a.y1, b.x0, b.y0, b.x1, b.y1)[0] <= eps
            or point_seg_distance(b.x0, b.y0, a.x0, a.y0, a.x1, a.y1)[0] <= eps or point_seg_distance(b.x1, b.y1, a.x0, a.y0, a.x1, a.y1)[0] <= eps):
        return True
    # a wire that turns a corner is often drawn with a small gap at the corner
    if a.length >= 3 and b.length >= 3 and abs(((a.angle - b.angle) % math.pi) - math.pi / 2) < 0.35:
        for p in ((a.x0, a.y0), (a.x1, a.y1)):
            if point_seg_distance(p[0], p[1], b.x0, b.y0, b.x1, b.y1)[0] <= 4.5:
                return True
        for p in ((b.x0, b.y0), (b.x1, b.y1)):
            if point_seg_distance(p[0], p[1], a.x0, a.y0, a.x1, a.y1)[0] <= 4.5:
                return True
    return False


def _seg_circle_touch(s: Seg, c, eps: float) -> bool:
    d, _ = point_seg_distance(c.cx, c.cy, s.x0, s.y0, s.x1, s.y1)
    far = max(math.hypot(s.x0 - c.cx, s.y0 - c.cy), math.hypot(s.x1 - c.cx, s.y1 - c.cy))
    return d <= c.r + eps + 0.8 and far >= c.r - eps


def _grow_cluster(page: Page, small: list[Seg], start: Pt, foot: Pt, reach=170.0) -> Cluster:
    """Everything hanging on the arrow shaft: wire, lamps, markers, disc. Rails are not in `small`, so it stops there."""
    cl = Cluster()
    cl.words = []
    eps = 1.3
    segs = [s for s in small if s.length >= 1.6 and abs(s.mid[0] - foot[0]) <= reach and abs(s.mid[1] - foot[1]) <= reach * 0.6]
    circ = [c for c in page.circles if abs(c.cx - foot[0]) <= reach and abs(c.cy - foot[1]) <= reach * 0.6]
    arcs = [a for a in page.arcs if abs(a.bbox[0] - foot[0]) <= reach and abs(a.bbox[1] - foot[1]) <= reach * 0.6]
    letters = [w for w in page.words if len(w.text) == 1 and w.text.upper() in "PCBAGR" and abs(w.cx - foot[0]) <= reach and abs(w.cy - foot[1]) <= reach * 0.6]
    arc_segs = [[Seg(p[0], p[1], q[0], q[1]) for p, q in zip(a.pts, a.pts[1:])] for a in arcs]
    in_s, in_c, in_a, in_w = set(), set(), set(), set()
    # probe from the arrow base a little way up the shaft (the shaft may start after a small gap)
    ux, uy = start[0] - foot[0], start[1] - foot[1]
    un = math.hypot(ux, uy) or 1.0
    front_s: list[Seg] = [Seg(start[0], start[1], start[0] + ux / un * 5.0, start[1] + uy / un * 5.0)]
    front_c: list = []

    def flood():
        nonlocal front_s, front_c
        while front_s or front_c:
            new_s: list[Seg] = []
            new_c: list = []
            for i, s in enumerate(segs):
                if i in in_s:
                    continue
                if any(_seg_touch(s, f, eps) for f in front_s) or any(_seg_circle_touch(s, c, eps) for c in front_c):
                    in_s.add(i)
                    new_s.append(s)
                    cl.segs.append(s)
            for i, c in enumerate(circ):
                if i in in_c:
                    continue
                if any(_seg_circle_touch(f, c, eps) for f in front_s) or any(math.hypot(c.cx - o.cx, c.cy - o.cy) <= c.r + o.r + (3.2 if abs(c.cy - o.cy) <= 2 and c.r >= 3.4 and o.r >= 3.4 else eps) for o in front_c):
                    in_c.add(i)
                    new_c.append(c)
                    cl.circles.append(c)
            for i, a in enumerate(arcs):
                if i in in_a:
                    continue
                if any(_seg_touch(x, f, eps) for x in arc_segs[i] for f in front_s) or any(_seg_circle_touch(x, c, eps) for x in arc_segs[i] for c in front_c):
                    in_a.add(i)
                    new_s.extend(arc_segs[i])
                    cl.arcs.append(a)
            front_s, front_c = new_s, new_c

    flood()
    # markers drawn as a letter sit in a gap of the row; step over such gaps and carry on
    for _ in range(6):
        bb = cl.bbox()
        if bb is None:
            break
        row = [c.cy for c in cl.circles if c.r >= 3.4]
        horiz = [s for s in cl.segs if abs(s.y1 - s.y0) < 0.6 and s.length >= 3]
        cy = (sorted(row)[len(row) // 2] if row else (horiz[-1].y0 if horiz else None))
        if cy is None:
            break
        grew = False

        def gap(x0, x1):
            return max(0.0, bb[0] - x1, x0 - bb[2])
        for i, w in enumerate(letters):
            if i not in in_w and abs(w.cy - cy) <= 8 and gap(w.x0, w.x1) <= 9:
                in_w.add(i)
                cl.words.append(w)
                front_s.append(Seg(w.x0, w.cy, w.x1, w.cy))
                cl.segs.append(Seg(w.x0, w.cy, w.x1, w.cy))
                grew = True
        for i, c in enumerate(circ):
            if i not in in_c and c.r >= 3.4 and abs(c.cy - cy) <= 6 and gap(c.cx - c.r, c.cx + c.r) <= 9:
                in_c.add(i)
                cl.circles.append(c)
                front_c.append(c)
                grew = True
        for i, s in enumerate(segs):
            if i not in in_s and abs(s.y1 - s.y0) < 0.6 and s.length >= 3 and abs(s.y0 - cy) <= 2.5 and gap(min(s.x0, s.x1), max(s.x0, s.x1)) <= 6:
                in_s.add(i)
                cl.segs.append(s)
                front_s.append(s)
                grew = True
        if not grew:
            break
        flood()
    uniq_c = []
    for c in cl.circles:
        if not any(abs(c.cx - u.cx) < 0.5 and abs(c.cy - u.cy) < 0.5 and abs(c.r - u.r) < 0.5 for u in uniq_c):
            uniq_c.append(c)
    cl.circles = uniq_c
    return cl


def _lamp_style(page: Page, c, segs: list[Seg]) -> str:
    """What is drawn inside the lamp circle: a slash, an upright bar, a level bar, or solid."""
    solid = sum(1 for st in page.strips if c.cx - c.r <= (st[0] + st[2]) / 2 <= c.cx + c.r and c.cy - c.r <= (st[1] + st[3]) / 2 <= c.cy + c.r)
    inside = [s for s in segs if math.hypot(s.mid[0] - c.cx, s.mid[1] - c.cy) <= c.r * 0.75 and s.length >= c.r * 0.8
              and math.hypot(s.x0 - c.cx, s.y0 - c.cy) <= c.r + 0.8 and math.hypot(s.x1 - c.cx, s.y1 - c.cy) <= c.r + 0.8]
    seen = set()
    ded = []
    for sg in inside:
        k = (round(sg.x0), round(sg.y0), round(sg.x1), round(sg.y1))
        k2 = (k[2], k[3], k[0], k[1])
        if k in seen or k2 in seen:
            continue
        seen.add(k)
        ded.append(sg)
    inside = ded
    if c.filled or solid >= 6 or len(inside) >= 5:
        return "solid"
    if not inside:
        return "open"
    s = max(inside, key=lambda s: s.length)
    deg = math.degrees(s.angle)
    if deg > 90:
        deg = 180 - deg
    if deg >= 68:
        return "vbar"
    if deg <= 22:
        return "hbar"
    return "slash"


def find_signals(page: Page, small: list[Seg], net: Net, origin: Pt, claimed: set[int]):
    ox, oy = origin
    words = [w for w in page.words]
    signals, structures, report = [], [], defaultdict(list)
    ids: set[str] = set()
    seen_feet: list[Pt] = []
    prefixed = sum(1 for w in words if re.match(r"^(S|SH)-?\d", w.text)) >= 4 and sum(1 for w in words if re.match(r"^S-?\d", w.text)) >= 2
    # every stroke that is not rail and not long line work can be part of a symbol
    all_small = []
    for sg in page.segs:
        if sg.length > 60 or (sg.thick and sg.length > 20):
            continue
        nr = net.nearest((sg.mid[0] - ox, sg.mid[1] - oy))
        if nr and nr[0] < 0.9 and abs(((sg.angle - nr[5]) % math.pi)) < 0.2:
            continue                       # lies along a rail
        all_small.append(sg)
    from pdfio import Tri
    used_lamps: set[int] = set()

    def lamp_seeded():
        """Signals whose foot arrow was not found (scans, or an arrow drawn as plain strokes): start from an unused
        lamp, follow the wire, and take the upright stroke whose end stands on a rail as the post."""
        for k, c in enumerate(page.circles):
            if c.r < 4.5 or k in used_lamps or any(abs(c.cx - (sg["footX"] + ox)) < 0.1 for sg in []):
                continue
            used_lamps.add(k)
            cl = _grow_cluster(page, all_small, (c.cx, c.cy - c.r), (c.cx, c.cy))
            for cc in cl.circles:
                for j, c2 in enumerate(page.circles):
                    if abs(c2.cx - cc.cx) < 0.5 and abs(c2.cy - cc.cy) < 0.5:
                        used_lamps.add(j)
            best = None
            for sg in cl.segs:
                if abs(sg.x1 - sg.x0) > 0.8 or sg.length < 4:
                    continue
                for end, far in (((sg.x0, sg.y0), (sg.x1, sg.y1)), ((sg.x1, sg.y1), (sg.x0, sg.y0))):
                    nr = net.nearest((end[0] - ox, end[1] - oy), tracks_only=True)
                    if nr and nr[0] <= 3.0 and (best is None or nr[0] < best[0]):
                        best = (nr[0], nr[3], far)
            if best:
                _, q, far = best
                foot = (q[0] + ox, q[1] + oy)
                up = -1.0 if far[1] < foot[1] else 1.0
                yield Tri(foot, (foot[0], foot[1] + 5.0 * up), 6.0)

    def candidates():
        for t in page.tris:
            yield t
        yield from lamp_seeded()

    for t in candidates():
        if not (4.0 <= t.size <= 14.0):
            continue
        tip = (t.tip[0] - ox, t.tip[1] - oy)
        nr = net.nearest(tip, tracks_only=True)
        if not nr or nr[0] > 2.6:
            continue
        d, _, tid, q, _, ang = nr
        # the arrow must point at the rail, square to it
        if abs(((t.direction - ang) % math.pi) - math.pi / 2) > math.radians(30):
            continue
        if any(math.hypot(q[0] - f[0], q[1] - f[1]) < 1.0 for f in seen_feet):
            continue
        seen_feet.append(q)
        cl = _grow_cluster(page, all_small, t.base, t.tip)
        for cc in cl.circles:
            for j, c2 in enumerate(page.circles):
                if abs(c2.cx - cc.cx) < 0.5 and abs(c2.cy - cc.cy) < 0.5:
                    used_lamps.add(j)
        bb = cl.bbox()
        if bb is None:
            continue
        side = "above" if t.base[1] < t.tip[1] else "below"
        foot_x = q[0]

        lamps = [c for c in cl.circles if c.r >= 4.9]
        mids = [c for c in cl.circles if 3.4 <= c.r < 4.9]
        tiny = [c for c in cl.circles if c.r < 3.4]
        # boxes hanging on the same wire (boards, detectors)
        rect = next((r for r in page.rects if r[0] - 2 <= bb[2] and r[2] + 2 >= bb[0] and r[1] - 2 <= bb[3] and r[3] + 2 >= bb[1]
                     and (r[2] - r[0]) < 80 and (r[3] - r[1]) < 60), None)

        elements: list[tuple[float, dict]] = []
        # far end of the vertical shaft = where the wire turns toward the head
        shaft_top = (t.base[0], min(bb[1], t.base[1]) if side == "above" else max(bb[3], t.base[1]))
        for c in lamps:
            style = _lamp_style(page, c, cl.segs + [s for s in all_small if abs(s.mid[0] - c.cx) < c.r and abs(s.mid[1] - c.cy) < c.r])
            elements.append((c.cx, {"kind": "lamp", "style": "slash" if style == "open" else style}))
        for c in mids:
            inside = [w for w in words if c.cx - c.r <= w.cx <= c.cx + c.r and c.cy - c.r <= w.cy <= c.cy + c.r and len(w.text) <= 2]
            txt = inside[0].text.upper() if inside else ""
            for w in inside:
                claimed.add(id(w))
            if txt in ("P", "C", "B", "A", "G", "R"):
                elements.append((c.cx, {"kind": "marker", "text": txt}))
        for w in cl.words:
            if not any(abs(w.cx - c.cx) <= c.r and abs(w.cy - c.cy) <= c.r for c in mids):
                elements.append((w.cx, {"kind": "marker", "text": w.text.upper()}))
                claimed.add(id(w))
        # calling-on: a small circle with a stroke through it, inside an oval
        tiny = [c for c in page.circles if 1.7 <= c.r < 3.4 and bb[0] - 1 <= c.cx <= bb[2] + 1 and bb[1] - 1 <= c.cy <= bb[3] + 1]
        for c in tiny:
            crossed = any(math.hypot(s.mid[0] - c.cx, s.mid[1] - c.cy) <= c.r * 0.6 and s.length >= c.r for s in all_small
                          if abs(s.mid[0] - c.cx) < 4 and abs(s.mid[1] - c.cy) < 4)
            if crossed and c.r >= 1.9:
                elements.append((c.cx, {"kind": "callingOn"}))
        # shunt disc: an open arc ~15pt with two tiny circles inside its box
        shunt_x = None
        for a in cl.arcs:
            w_, h_ = a.bbox[2] - a.bbox[0], a.bbox[3] - a.bbox[1]
            if 9 <= max(w_, h_) <= 22 and min(w_, h_) >= 6:
                dots = [c for c in page.circles if c.r < 2.4 and a.bbox[0] - 1 <= c.cx <= a.bbox[2] + 1 and a.bbox[1] - 1 <= c.cy <= a.bbox[3] + 1]
                if len(dots) >= 2:
                    shunt_x = (a.bbox[0] + a.bbox[2]) / 2
        if shunt_x is not None:
            elements.append((shunt_x, {"kind": "shunt"}))
        # route indicator: slanted arms fanning out past the last lamp
        if lamps:
            xs_l = [c.cx for c in lamps]
            cy = sum(c.cy for c in lamps) / len(lamps)
            r0 = lamps[0].r
            arms = [s for s in cl.segs if 3.5 <= s.length <= 26 and 18 <= min(math.degrees(s.angle), 180 - math.degrees(s.angle)) <= 72
                    and abs(s.mid[1] - cy) <= r0 * 1.6 and (s.mid[0] > max(xs_l) + r0 or s.mid[0] < min(xs_l) - r0)]
            def labelled(sg):
                # a single slanted stroke that leads to a caption is a leader line, not a route indicator
                far = max(((sg.x0, sg.y0), (sg.x1, sg.y1)), key=lambda p: abs(p[0] - sum(xs_l) / len(xs_l)))
                return any(w.x0 - 9 <= far[0] <= w.x1 + 9 and w.y0 - 9 <= far[1] <= w.y1 + 9 for w in words if w.horizontal)
            if len(arms) >= 2 or any(s.length >= 4.5 and not labelled(s) for s in arms):
                ax = sum(s.mid[0] for s in arms) / len(arms)
                elements.append((ax, {"kind": "routeIndicator", "routes": ["upperLeft", "upperRight"]}))

        # names: signal-like words around the head
        box = (bb[0] - 34, bb[1] - 18, bb[2] + 34, bb[3] + 18)
        names = []
        for w in words:
            if id(w) in claimed or not w.horizontal:
                continue
            txt = re.sub(r"^(?:SIG(?:NAL)?\.?\s*NO\.?\s*)", "", w.text.strip(), flags=re.I)    # 'SIG NO.D01' -> 'D01'
            if not SIGNAL_RE.match(txt) or TC_RE.match(txt):
                continue
            if prefixed and re.match(r"^\d", txt):
                continue                      # on a sheet that writes S-03 / SH-103, bare numbers are point numbers
            if box[0] <= w.cx <= box[2] and box[1] <= w.cy <= box[3]:
                dist = max(0.0, bb[0] - w.cx, w.cx - bb[2]) + max(0.0, bb[1] - w.cy, w.cy - bb[3])
                names.append((dist, w))
        names.sort(key=lambda n: n[0])

        if not elements:
            # not a signal: a board or a detector on a post
            if rect or cl.circles:
                near = [w for w in words if w.horizontal and box[0] - 30 <= w.cx <= box[2] + 30 and box[1] - 22 <= w.cy <= box[3] + 22
                        and id(w) not in claimed and not TC_RE.match(w.text) and re.search(r"[A-Z]{2}", w.text)]
                near.sort(key=lambda w: abs(w.cx - (bb[0] + bb[2]) / 2) + abs(w.cy - (bb[1] + bb[3]) / 2))
                name = " ".join(w.text for w in sorted(near[:3], key=lambda w: (w.cy, w.cx))) if near else "POST"
                for w in near[:3]:
                    claimed.add(id(w))
                st = {"id": uniq("ST_" + _slug(name)[:20], ids), "kind": "locoPilotBoard" if rect else "detector", "name": name,
                      "foot": {"trackId": tid, "x": round(foot_x, 2)}}
                if rect:
                    st["shape"] = {"type": "rect", "x0": round(rect[0] - ox, 2), "y0": round(rect[1] - oy, 2), "x1": round(rect[2] - ox, 2), "y1": round(rect[3] - oy, 2)}
                structures.append(st)
            continue

        # head direction and anchor: elements ordered outward from where the wire arrives
        half = {"lamp": 7.0, "marker": 4.5, "callingOn": 6.0, "shunt": 8.0, "routeIndicator": 5.0}
        lo = min(e[0] - half[e[1]["kind"]] for e in elements)
        hi = max(e[0] + half[e[1]["kind"]] for e in elements)
        ys_row = [c.cy for c in cl.circles if c.r >= 3.4] or [(bb[1] + bb[3]) / 2]
        cy = sum(ys_row) / len(ys_row)
        # which end of the row does the wire arrive at? (it may dog-leg: shaft, along, back)
        votes = {"lo": 0, "hi": 0}
        for sg in cl.segs:
            if sg.length < 3:
                continue
            for (px, py), (qx, qy) in (((sg.x0, sg.y0), (sg.x1, sg.y1)), ((sg.x1, sg.y1), (sg.x0, sg.y0))):
                if abs(py - cy) > 7:
                    continue
                if abs(px - lo) <= 3.5 and (qx < lo - 2 or abs(qy - cy) > 7):
                    votes["lo"] += 1
                if abs(px - hi) <= 3.5 and (qx > hi + 2 or abs(qy - cy) > 7):
                    votes["hi"] += 1
        if votes["lo"] != votes["hi"]:
            from_lo = votes["lo"] > votes["hi"]
        else:
            from_lo = abs(lo - t.tip[0]) <= abs(hi - t.tip[0])
        head = "east" if from_lo else "west"
        elements.sort(key=lambda e: e[0] if from_lo else -e[0])
        anchor = lo if from_lo else hi
        els = [e[1] for e in elements]

        main = [w for _, w in names if not w.text.upper().startswith(("SH", "DSH", "C-", "C"))] or \
               [w for _, w in names if not w.text.upper().startswith(("SH", "DSH"))]
        shn = [w for _, w in names if w.text.upper().startswith(("SH", "DSH"))]
        con = [w for _, w in names if re.match(r"^C-?\d", w.text.upper())]
        has_lamps = any(e["kind"] == "lamp" for e in els)
        for e in els:
            if e["kind"] == "shunt" and shn:
                e["text"] = shn[0].text
        if has_lamps and main:
            code_w = main[0]
        elif shn:
            code_w = shn[0]
        elif names:
            code_w = names[0][1]
        else:
            code_w = None
        for w in ([code_w] if code_w else []) + shn[:1] + con[:1]:
            claimed.add(id(w))
        code = re.sub(r"^(?:SIG(?:NAL)?\.?\s*NO\.?\s*)", "", code_w.text.strip(), flags=re.I) if code_w else f"?{len(signals) + 1}"
        if not code_w:
            report["signalsWithoutName"].append({"x": round(foot_x, 1), "track": tid})
        markers = {e.get("text") for e in els if e["kind"] == "marker"}
        if not has_lamps:
            kind = "shunt"
        elif "P" in markers or code.upper().startswith("D") or "DIST" in code.upper():
            kind = "distant"
        elif any(e["kind"] in ("callingOn", "routeIndicator") for e in els):
            kind = "home"
        elif "B" in markers:
            kind = "advancedStarter"
        else:
            kind = "starter"
        m = re.search(r"\d+", code)
        num = int(m.group()) if m else None
        if num is not None:
            direction = "UP" if num % 2 == 1 else "DN"
        elif code.upper().startswith(("UP", "DN")):
            direction = code.upper()[:2]
        else:
            direction = "UP" if side == "above" else "DN"
        sig = {"id": uniq("SIG_" + _slug(code), ids), "code": code, "name": f"Signal {code}", "kind": kind, "direction": direction,
               "trackId": tid, "footX": round(foot_x, 2), "anchorX": round(anchor - ox, 2), "side": side, "headDir": head,
               "elements": els}
        if code_w:
            sig["label"] = {"x": round(code_w.cx - ox, 2), "y": round(code_w.cy - oy, 2)}
        if num is not None:
            sig["control"] = num
        extra = [w.text for w in con[:1] if has_lamps] + [w.text for w in shn[:1] if has_lamps and code_w is not shn[0]]
        if extra:
            sig["fullCode"] = " / ".join([code] + extra)
        signals.append(sig)
    signals.sort(key=lambda s: s["footX"])
    return signals, structures, dict(report)


# --------------------------------------------------------------------------- points

def find_points(page: Page, st: dict, net: Net, origin: Pt, claimed: set[int]):
    """A point sits where a turnout leg lands on a line. Number = nearest free label; angle = caption along the leg."""
    ox, oy = origin
    labels = [w for w in page.words if w.horizontal and POINT_RE.match(w.text.strip()) and id(w) not in claimed]
    ratios = [(w, RATIO_RE.search(w.text)) for w in page.words if RATIO_RE.search(w.text)]
    points, report = [], defaultdict(list)
    ids: set[str] = set()

    # (junction node, the rail that branches off there, connection id or None)
    sites: list[tuple[str, list[Pt], str | None]] = []
    for c in st["connections"]:
        pts = net.conns[c["id"]]
        sites.append((c["from"], pts, c["id"]))
        sites.append((c["to"], pts[::-1], c["id"]))
    on_body = defaultdict(int)
    for t in st["tracks"]:
        for i in t["nodeIds"][1:-1]:
            on_body[i] += 1
    conn_nodes = {s[0] for s in sites}
    for t in st["tracks"]:
        pts = net.tracks[t["id"]]
        for end, seq in ((t["nodeIds"][0], pts), (t["nodeIds"][-1], pts[::-1])):
            if net.kind[end] == "junction" and on_body[end] and end not in conn_nodes:
                sites.append((end, seq, None))            # a siding running straight off a line

    # nearest label first, globally, so that neighbouring points do not steal each other's number
    cands = []
    for si, (nid, leg, cid) in enumerate(sites):
        p = leg[1] if cid and len(leg) > 2 else net.node[nid]     # the number is printed at the heel of the leg
        for w in labels:
            wx, wy = w.cx - ox, w.cy - oy
            d = math.hypot(wx - p[0], wy - p[1])
            if d <= 34:
                # the label sits on the branch side of the line
                side_ok = True
                if len(leg) >= 2:
                    k = min(len(leg) - 1, 3)
                    side_ok = (leg[k][1] - p[1]) * (wy - p[1]) >= -6
                cands.append((d + (0 if side_ok else 20), si, w))
    cands.sort(key=lambda c: c[0])
    got: dict[int, Word] = {}
    used: set[int] = set()
    for d, si, w in cands:
        if si in got or id(w) in used:
            continue
        got[si] = w
        used.add(id(w))
    for si, (nid, leg, cid) in enumerate(sites):
        p = net.node[nid]
        w = got.get(si)
        if w:
            claimed.add(id(w))
        code = w.text.strip() if w else "?"
        if not w:
            report["pointsWithoutNumber"].append({"node": nid, "x": round(p[0], 1)})
        # switch angle: caption lying along this leg, nearer this end than the other
        ratio, switch, inferred = "", "", True
        best = None
        total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(leg, leg[1:])) or 1.0
        for rw, m in ratios:
            q = (rw.cx - ox, rw.cy - oy)
            acc, dmin, along = 0.0, 1e9, 0.0
            for a, b in zip(leg, leg[1:]):
                dd, tt = point_seg_distance(q[0], q[1], a[0], a[1], b[0], b[1])
                L = math.hypot(b[0] - a[0], b[1] - a[1])
                if dd < dmin:
                    dmin, along = dd, acc + tt * L
                acc += L
            if dmin <= 16 and along <= 0.62 * total and (best is None or along < best[0]):
                best = (along, rw, m)
        if best:
            _, rw, m = best
            ratio = f"1 IN {m.group(1)}"
            switch = re.sub(r"\s+", "", (m.group(2) or "")).upper()
            inferred = False
            claimed.add(id(rw))
        num = re.match(r"\d+", code)
        pt = {"id": uniq("P" + (_slug(code) or "X"), ids), "code": code, "nodeId": nid, "ratio": ratio, "switch": switch,
              "ratioInferred": inferred, "control": int(num.group()) if num else 0,
              "label": {"x": round((w.cx - ox) if w else p[0], 2), "y": round((w.cy - oy) if w else p[1] - 10, 2)}}
        if cid:
            pt["connectionId"] = cid
        points.append(pt)
    points.sort(key=lambda p: (p["control"], p["code"]))
    return points, dict(report)


def add_legless_points(page, st: dict, net: Net, origin: Pt, claimed: set[int], points: list[dict], expected: set[str]):
    """Points listed in the crank-handle table but drawn without a second leg (traps, derailing switches):
    place them on the rail beside their number."""
    ox, oy = origin
    have = {re.match(r"\d+", p["code"]).group() for p in points if re.match(r"\d+", p["code"])}
    added = []
    for num in sorted(expected - have, key=lambda v: int(v)):
        cands = [w for w in page.words if w.horizontal and id(w) not in claimed and re.fullmatch(num + r"[A-Z]?", w.text.strip())]
        for w in cands:
            nr = net.nearest((w.cx - ox, w.cy - oy), tracks_only=True)
            if not nr or nr[0] > 34:
                continue
            _, _, tid, q, _, _ = nr
            t = next(t for t in st["tracks"] if t["id"] == tid)
            nid = None
            for i in t["nodeIds"]:
                if abs(net.node[i][0] - q[0]) < 6 and abs(net.node[i][1] - q[1]) < 3:
                    nid = i
            if nid is None:
                nid = f"N{len(st['nodes']) + 1:03d}"
                st["nodes"].append({"id": nid, "x": round(q[0], 2), "y": round(q[1], 2), "kind": "junction"})
                pos = sum(1 for i in t["nodeIds"] if net.node[i][0] < q[0])
                t["nodeIds"].insert(pos, nid)
                net.node[nid] = (round(q[0], 2), round(q[1], 2))
                net.kind[nid] = "junction"
                net.tracks[tid] = [net.node[i] for i in t["nodeIds"]]
                net.track_nodes[tid] = list(t["nodeIds"])
            code = w.text.strip()
            points.append({"id": "P" + _slug(code), "code": code, "nodeId": nid, "ratio": "", "switch": "", "ratioInferred": True,
                           "control": int(num), "label": {"x": round(w.cx - ox, 2), "y": round(w.cy - oy, 2)}})
            claimed.add(id(w))
            added.append(code)
    points.sort(key=lambda p: (p["control"], p["code"]))
    return added
