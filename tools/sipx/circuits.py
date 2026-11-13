"""Track-circuit limits.

A caption (3T, 31/33T ...) names the stretch of rail it sits on.  The stretch runs along the rails, through
points, until an insulated joint or the end of a line.  Where the draughtsman left a joint out, two captions
would claim the same rail; the rail is then split half-way between them and the circuit is flagged approximate.
"""
from __future__ import annotations

import heapq
import math
from collections import defaultdict

from net import Net
from patterns import TC_RE

Pt = tuple[float, float]
STEP = 5.0


def find_circuits(page, st: dict, net: Net, origin: Pt, joints_t: dict, joints_c: dict, claimed: set[int], reach=24.0):
    ox, oy = origin
    # ---- sample every rail
    verts: list[Pt] = []
    vrail: list[tuple[str, str]] = []
    adj: dict[int, list[tuple[int, float]]] = defaultdict(list)
    node_v: dict[str, int] = {}
    rail_v: dict[tuple[str, str], list[int]] = {}
    cut_edges: set[tuple[int, int]] = set()

    def add_rail(kind: str, rid: str, pts: list[Pt], node_ids: list[str | None]):
        seq: list[int] = []
        for k, p in enumerate(pts):
            nid = node_ids[k]
            if nid is not None and nid in node_v:
                v = node_v[nid]
            else:
                v = len(verts)
                verts.append(p)
                vrail.append((kind, rid))
                if nid is not None:
                    node_v[nid] = v
            if seq:
                a = verts[seq[-1]]
                L = math.hypot(p[0] - a[0], p[1] - a[1])
                n = max(1, int(L // STEP))
                prev = seq[-1]
                for i in range(1, n):
                    t = i / n
                    m = len(verts)
                    verts.append((a[0] + t * (p[0] - a[0]), a[1] + t * (p[1] - a[1])))
                    vrail.append((kind, rid))
                    adj[prev].append((m, L / n))
                    adj[m].append((prev, L / n))
                    seq.append(m)
                    prev = m
                adj[prev].append((v, L / n))
                adj[v].append((prev, L / n))
            seq.append(v)
        rail_v[(kind, rid)] = seq

    for t in st["tracks"]:
        add_rail("track", t["id"], net.tracks[t["id"]], list(t["nodeIds"]))
    for c in st["connections"]:
        pts = net.conns[c["id"]]
        add_rail("conn", c["id"], pts, [c["from"]] + [None] * (len(pts) - 2) + [c["to"]])

    # ---- joints cut the rail
    def cut(kind: str, rid: str, q: Pt):
        seq = rail_v[(kind, rid)]
        best = None
        for a, b in zip(seq, seq[1:]):
            pa, pb = verts[a], verts[b]
            mx, my = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2
            d = math.hypot(mx - q[0], my - q[1])
            if best is None or d < best[0]:
                best = (d, a, b)
        if best:
            cut_edges.add((best[1], best[2]))
            cut_edges.add((best[2], best[1]))

    for tid, xs in joints_t.items():
        for x in xs:
            y = net.track_y(tid, x)
            if y is not None:
                cut("track", tid, (x, y))
    for cid, ps in joints_c.items():
        for p in ps:
            cut("conn", cid, p)

    # ---- captions
    caps = []
    for w in page.words:
        txt = w.text.replace(" ", "")
        if id(w) in claimed or not w.horizontal or not TC_RE.match(txt):
            continue
        p = (w.cx - ox, w.cy - oy)
        best = None
        for v, q in enumerate(verts):
            d = math.hypot(q[0] - p[0], q[1] - p[1])
            # prefer the rail straight above / below the caption
            d_eff = d + 0.6 * abs(q[0] - p[0])
            if d <= reach and (best is None or d_eff < best[0]):
                best = (d_eff, v)
        if best:
            caps.append((w, best[1]))
            claimed.add(id(w))

    # ---- grow all captions at once
    owner: dict[int, int] = {}
    dist: dict[int, float] = {}
    heap = [(0.0, ci, v) for ci, (_, v) in enumerate(caps)]
    heapq.heapify(heap)
    while heap:
        d, ci, v = heapq.heappop(heap)
        if v in owner:
            continue
        owner[v] = ci
        dist[v] = d
        for u, L in adj[v]:
            if u not in owner and (v, u) not in cut_edges:
                heapq.heappush(heap, (d + L, ci, u))

    # ---- spans
    seen_codes: set[str] = set()
    out = []
    approx = [False] * len(caps)
    spans: list[list[dict]] = [[] for _ in caps]
    unlabelled = []
    for t in st["tracks"]:
        seq = rail_v[("track", t["id"])]
        run_start = 0
        for k in range(1, len(seq) + 1):
            if k == len(seq) or owner.get(seq[k]) != owner.get(seq[run_start]) or (seq[k - 1], seq[k]) in cut_edges:
                ci = owner.get(seq[run_start])
                xa, xb = verts[seq[run_start]][0], verts[seq[k - 1]][0]
                # extend to the joint / midpoint on each side
                if run_start > 0:
                    xa = (verts[seq[run_start - 1]][0] + xa) / 2
                    if (seq[run_start - 1], seq[run_start]) not in cut_edges and ci is not None:
                        approx[ci] = True
                if k < len(seq):
                    xb = (verts[seq[k]][0] + xb) / 2
                    if (seq[k - 1], seq[k]) not in cut_edges and ci is not None:
                        approx[ci] = True
                x0, x1 = sorted((xa, xb))
                if ci is None:
                    if x1 - x0 > 12:
                        unlabelled.append({"track": t["id"], "x0": round(x0, 1), "x1": round(x1, 1)})
                elif x1 - x0 > 0.5:
                    if spans[ci] and spans[ci][-1].get("trackId") == t["id"] and abs(spans[ci][-1]["x1"] - x0) < 1.0:
                        spans[ci][-1]["x1"] = round(x1, 2)
                    else:
                        spans[ci].append({"trackId": t["id"], "x0": round(x0, 2), "x1": round(x1, 2)})
                run_start = k
    for c in st["connections"]:
        seq = rail_v[("conn", c["id"])]
        votes: dict[int, int] = defaultdict(int)
        for v in seq[1:-1]:
            if v in owner:
                votes[owner[v]] += 1
        if votes:
            ci = max(votes, key=lambda k: votes[k])
            spans[ci].append({"connectionId": c["id"]})
            if len(votes) > 1:
                pass          # an insulated joint on the leg: the larger share is listed
    for ci, (w, v) in enumerate(caps):
        code = w.text.strip()
        m = code.find("(")
        short = code[:m].strip() if m > 0 else code
        cid = "TC_" + "".join(ch if ch.isalnum() else "_" for ch in short)
        k = 2
        base = cid
        while cid in seen_codes:
            cid = f"{base}_{k}"
            k += 1
        seen_codes.add(cid)
        out.append({"id": cid, "code": short, "kind": "axleCounter" if short.endswith("XT") else "trackCircuit",
                    "spans": spans[ci], "label": {"x": round(w.cx - ox, 2), "y": round(w.cy - oy, 2)}, "approx": approx[ci],
                    **({"text": code} if code != short else {})})
    return out, unlabelled
