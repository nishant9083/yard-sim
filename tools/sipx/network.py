"""Turn the rail lines into the station skeleton: nodes, tracks and connections.

  track       a running line: the flat lines, plus any slanted line that has a free end (a siding running off)
  connection  a curve or slanted line whose two ends both land on tracks (turnout leg, crossover)
  junction    where a connection lands on a track; this is where a point sits
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from graphutil import point_seg_distance
from tracks import Line, Params, _nearest_on, faces

Pt = tuple[float, float]


@dataclass
class End:
    kind: str = "free"            # free | body | end
    other: int = -1               # line index it lands on
    point: Pt = (0.0, 0.0)        # where on that line
    other_end: int = 0            # for kind == end: which end of the other line (0 / -1)


@dataclass
class Rail:
    """A line with what each of its two ends does."""
    line: Line
    ends: list[End] = field(default_factory=lambda: [End(), End()])
    role: str = ""               # track | link


def classify(rails: list[Line], P: Params) -> list[Rail]:
    out = [Rail(l) for l in rails]
    for i, r in enumerate(out):
        for e, (end, nb) in enumerate(((r.line.pts[0], r.line.pts[1]), (r.line.pts[-1], r.line.pts[-2]))):
            best_end = None
            best_body = None
            for j, o in enumerate(out):
                if i == j:
                    continue
                for oe, op in ((0, o.line.pts[0]), (-1, o.line.pts[-1])):
                    d = math.hypot(op[0] - end[0], op[1] - end[1])
                    # two flat rails facing each other across a break mark with a small sideways step also meet
                    facing = r.line.is_flat(P) and o.line.is_flat(P) and faces(r.line, end, o.line, op)
                    if d <= P.end_join or facing:
                        if best_end is None or d < best_end[0]:
                            best_end = (d, j, op, oe)
                d, pos, q = _nearest_on(o.line, end)
                clear = min(math.hypot(q[0] - o.line.pts[0][0], q[1] - o.line.pts[0][1]), math.hypot(q[0] - o.line.pts[-1][0], q[1] - o.line.pts[-1][1]))
                if d <= P.link_reach and clear > 3.0:
                    if best_body is None or d < best_body[0]:
                        best_body = (d, j, q)
            if best_end and (best_body is None or best_end[0] <= best_body[0] + 2.0):
                r.ends[e] = End("end", best_end[1], best_end[2], best_end[3])
            elif best_body:
                r.ends[e] = End("body", best_body[1], best_body[2])
    for r in out:
        flat = r.line.is_flat(P)
        free = any(e.kind == "free" for e in r.ends)
        r.role = "track" if flat or free else "link"
    # a slanted piece joined end to end between two track ends (approach jog) is part of that track
    for r in out:
        if r.role == "link" and all(e.kind == "end" for e in r.ends) and all(out[e.other].role == "track" for e in r.ends):
            r.role = "track"
    return out


def build(rails: list[Line], P: Params, origin: Pt) -> dict:
    """Station skeleton in shifted coordinates."""
    ox, oy = origin
    R = classify(rails, P)

    # ---- merge track pieces that meet end to end into one polyline
    n = len(R)
    used = [False] * n
    chains: list[list[tuple[int, bool]]] = []     # (rail index, reversed?)
    partner: dict[tuple[int, int], tuple[int, int]] = {}
    for i, r in enumerate(R):
        if r.role != "track":
            continue
        for e in (0, 1):
            en = r.ends[e]
            if en.kind == "end" and R[en.other].role == "track":
                oe = 0 if en.other_end == 0 else 1
                # only pair up mutual, exclusive joins
                back = R[en.other].ends[oe]
                if back.kind == "end" and back.other == i:
                    partner[(i, e)] = (en.other, oe)
    for i, r in enumerate(R):
        if r.role != "track" or used[i]:
            continue
        # walk to the start of the chain
        cur, rev = i, False
        seen = {i}
        while True:
            e = 1 if rev else 0
            p = partner.get((cur, e))
            if not p or p[0] in seen:
                break
            cur, rev = p[0], (p[1] == 0)
            seen.add(cur)
        chain = []
        seen = set()
        while True:
            chain.append((cur, rev))
            used[cur] = True
            seen.add(cur)
            e = 0 if rev else 1
            p = partner.get((cur, e))
            if not p or p[0] in seen:
                break
            cur, rev = p[0], (p[1] == 1)
        chains.append(chain)

    nodes: list[dict] = []
    tracks: list[dict] = []
    conns: list[dict] = []
    rail_track: dict[int, int] = {}                # rail index -> track index
    track_pts: list[list[Pt]] = []
    track_meta: list[dict] = []
    for chain in chains:
        pts: list[Pt] = []
        thick = False
        breaks: list[Pt] = []
        for k, (ri, rev) in enumerate(chain):
            p = R[ri].line.pts[::-1] if rev else list(R[ri].line.pts)
            if pts and math.hypot(pts[-1][0] - p[0][0], pts[-1][1] - p[0][1]) > 0.5 and abs(p[0][0] - pts[-1][0]) > 1.0:
                breaks.append(((pts[-1][0] + p[0][0]) / 2, (pts[-1][1] + p[0][1]) / 2))
            pts.extend(p if not pts else (p if math.hypot(pts[-1][0] - p[0][0], pts[-1][1] - p[0][1]) > 0.5 else p[1:]))
            thick = thick or R[ri].line.thick
            breaks.extend(R[ri].line.breaks)
            rail_track[ri] = len(track_pts)
        first, last = chain[0], chain[-1]
        e0 = R[first[0]].ends[1 if first[1] else 0]
        e1 = R[last[0]].ends[0 if last[1] else 1]
        if pts[0][0] > pts[-1][0]:
            pts.reverse()
            e0, e1 = e1, e0
        track_pts.append(pts)
        track_meta.append({"thick": thick, "breaks": breaks, "ends": (e0, e1), "hooks": [R[ri].line.hooks for ri, _ in chain]})

    # ---- junction positions on each track
    def on_track(ti: int, p: Pt):
        best = (1e9, 0.0, p)
        pts = track_pts[ti]
        for k, (a, b) in enumerate(zip(pts, pts[1:])):
            d, t = point_seg_distance(p[0], p[1], a[0], a[1], b[0], b[1])
            if d < best[0]:
                best = (d, k + t, (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
        return best

    inserts: dict[int, list[tuple[float, Pt, str]]] = {i: [] for i in range(len(track_pts))}
    link_ends: dict[tuple[int, int], tuple[int, Pt]] = {}       # (rail, end) -> (track, point on track)
    for i, r in enumerate(R):
        for e in (0, 1):
            en = r.ends[e]
            if en.kind == "free" or en.other not in rail_track:
                continue
            if r.role == "track" and en.kind == "end":
                continue                                           # merged above
            ti = rail_track[en.other]
            _, pos, q = on_track(ti, en.point if en.kind == "end" else r.line.pts[0 if e == 0 else -1])
            inserts[ti].append((pos, q, "junction"))
            link_ends[(i, e)] = (ti, q)

    def add_node(p: Pt, kind: str) -> str:
        for nd in nodes:
            tol = 4.0 if kind == "junction" and nd["kind"] != "plain" else 0.6
            if abs(nd["_x"] - p[0]) < tol and abs(nd["_y"] - p[1]) < tol:
                if kind == "junction":
                    nd["kind"] = "junction"
                return nd["id"]
        nid = f"N{len(nodes) + 1:03d}"
        nodes.append({"id": nid, "x": round(p[0] - ox, 2), "y": round(p[1] - oy, 2), "kind": kind, "_x": p[0], "_y": p[1]})
        return nid

    allx = [p[0] for pts in track_pts for p in pts]
    minx, maxx = min(allx), max(allx)
    for ti, pts in enumerate(track_pts):
        seq: list[tuple[float, Pt, str]] = []
        for k, p in enumerate(pts):
            kind = "plain"
            if k in (0, len(pts) - 1):
                en = track_meta[ti]["ends"][0 if k == 0 else 1]
                if en.kind == "free":
                    edge = (p[0] - minx) < 0.02 * (maxx - minx) or (maxx - p[0]) < 0.02 * (maxx - minx)
                    kind = "boundary" if edge else "bufferStop"
                else:
                    kind = "junction"
            seq.append((float(k), p, kind))
        seq.extend(inserts[ti])
        seq.sort(key=lambda s: s[0])
        ids: list[str] = []
        for _, p, kind in seq:
            i = add_node(p, kind)
            if not ids or ids[-1] != i:
                ids.append(i)
        tracks.append({"id": f"T{ti + 1:02d}", "name": f"Track {ti + 1}", "kind": "main" if track_meta[ti]["thick"] else "loop",
                       "direction": "BOTH", "nodeIds": ids, "_breaks": track_meta[ti]["breaks"]})

    # a track whose end lands on another track (siding leaving a line): make sure that end is a junction there
    for ti, pts in enumerate(track_pts):
        for k, en in ((0, track_meta[ti]["ends"][0]), (-1, track_meta[ti]["ends"][1])):
            if en.kind == "body" and en.other in rail_track:
                oti = rail_track[en.other]
                if oti == ti:
                    continue
                _, pos, q = on_track(oti, pts[k])
                jid = add_node(q, "junction")
                t = tracks[oti]
                if jid not in t["nodeIds"]:
                    # insert in x order
                    xs = {nd["id"]: nd["_x"] for nd in nodes}
                    t["nodeIds"].append(jid)
                    t["nodeIds"].sort(key=lambda i: xs[i])
                me = tracks[ti]["nodeIds"]
                if k == 0 and me[0] != jid:
                    me.insert(0, jid)
                elif k == -1 and me[-1] != jid:
                    me.append(jid)

    for i, r in enumerate(R):
        if r.role != "link":
            continue
        a = link_ends.get((i, 0))
        b = link_ends.get((i, 1))
        if not a or not b:
            continue
        pts = list(r.line.pts)
        fa, fb = add_node(a[1], "junction"), add_node(b[1], "junction")
        for (ti, q), jid in ((a, fa), (b, fb)):
            t = tracks[ti]
            if jid not in t["nodeIds"]:
                xs = {nd["id"]: nd["_x"] for nd in nodes}
                t["nodeIds"].append(jid)
                t["nodeIds"].sort(key=lambda i_: xs[i_])
        via = _resample(pts, 14)
        if a[1][0] > b[1][0]:
            fa, fb, via = fb, fa, via[::-1]
        kinds = (r.ends[0].kind, r.ends[1].kind)
        conns.append({"id": f"C{len(conns) + 1:02d}", "kind": "crossover" if kinds == ("body", "body") else "turnout",
                      "from": fa, "to": fb, "via": [{"x": round(p[0] - ox, 2), "y": round(p[1] - oy, 2)} for p in via],
                      "_hooks": r.line.hooks})

    for nd in nodes:
        nd.pop("_x")
        nd.pop("_y")
    return {"nodes": nodes, "tracks": tracks, "connections": conns}


def _resample(pts: list[Pt], n: int) -> list[Pt]:
    """Keep the shape with at most n interior points."""
    if len(pts) <= n:
        return pts
    step = (len(pts) - 1) / (n - 1)
    return [pts[int(round(k * step))] for k in range(n)]


def soften_junctions(st: dict, joints_t: dict[str, list[float]], lead: float = 2.6, margin: float = 3.0) -> int:
    """A turnout leg is drawn starting beside the line (with a gap or heel hook), so the junction found by dropping
    a perpendicular makes a square step.  Slide the junction back along the line, away from the leg, so the leg
    leaves at a slant - but never past an insulated joint or another node, which would change the circuit it is in."""
    node = {n["id"]: n for n in st["nodes"]}
    moved = 0
    for c in st["connections"]:
        via = c.get("via", [])
        if len(via) < 2:
            continue
        for end, first, nxt in ((c["from"], via[0], via[1]), (c["to"], via[-1], via[-2])):
            j = node[end]
            dy = first["y"] - j["y"]
            if abs(first["x"] - j["x"]) > 2.5 or abs(dy) < 2.0:
                continue
            heading = 1.0 if nxt["x"] > first["x"] else -1.0          # the way the leg runs along the yard
            want = lead * abs(dy)
            # the line this junction lies on (as an interior node)
            limit = want
            for t in st["tracks"]:
                if end not in t["nodeIds"]:
                    continue
                xs = [node[i]["x"] for i in t["nodeIds"] if i != end] + list(joints_t.get(t["id"], []))
                behind = [abs(x - j["x"]) for x in xs if (x - j["x"]) * heading < 0]
                if behind:
                    limit = min(limit, min(behind) - margin)
                # stay on a straight stretch: keep y from the neighbours
                k = t["nodeIds"].index(end)
                prev = node[t["nodeIds"][k - 1]] if k > 0 else None
                nxt_n = node[t["nodeIds"][k + 1]] if k + 1 < len(t["nodeIds"]) else None
                if limit > 0.5:
                    nx = j["x"] - heading * limit
                    a, b = (prev, j) if heading > 0 and prev else (j, nxt_n) if nxt_n else (None, None)
                    if a and b and abs(b["x"] - a["x"]) > 1e-6:
                        j["y"] = round(a["y"] + (b["y"] - a["y"]) * (nx - a["x"]) / (b["x"] - a["x"]), 2)
                    j["x"] = round(nx, 2)
                    moved += 1
                break
    return moved
