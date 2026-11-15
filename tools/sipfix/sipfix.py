"""Helpers for checking and hand-fixing an extracted station JSON against its SIP PDF.

    python3 tools/sipfix/sipfix.py summary  STATION.json
    python3 tools/sipfix/sipfix.py check    STATION.json
    python3 tools/sipfix/sipfix.py view     STATION.json PDF --x0 2000 --x1 2600 [--y0 -40 --y1 140] [--out f.png]
    python3 tools/sipfix/sipfix.py tiles    STATION.json PDF --out DIR [--width 500]
    python3 tools/sipfix/sipfix.py prims    STATION.json PDF --x0 .. --x1 .. --y0 .. --y1 .. [--what ticks,arrows,circles,lines,text]
    python3 tools/sipfix/sipfix.py text     STATION.json PDF --find "REGEX" [--ocr]
    python3 tools/sipfix/sipfix.py near     STATION.json X Y [--r 40]

Every coordinate going in or out is a JSON coordinate (drawing points, y down), never a sheet coordinate.
The conversion is sheet = json + meta.sheet.offset; pass --offset OX OY if the JSON has no meta.sheet.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sipx"))


# ---------------------------------------------------------------- loading

def load(path):
    st = json.load(open(path))
    st.setdefault("assets", {})
    st.setdefault("info", {})
    return st


def offset_of(st, a):
    if getattr(a, "offset", None):
        return tuple(a.offset)
    sh = st.get("meta", {}).get("sheet")
    if sh and "offset" in sh:
        return tuple(sh["offset"])
    raise SystemExit("This JSON has no meta.sheet.offset (made before it was recorded). Re-run the extractor, "
                     "or pass --offset OX OY (sheet coordinate of JSON 0,0).")


def page_of(st, a):
    import pymupdf
    doc = pymupdf.open(a.pdf)
    return doc[int(st.get("meta", {}).get("sheet", {}).get("page", 0))]


class Geo:
    def __init__(self, st):
        self.node = {n["id"]: n for n in st["nodes"]}
        self.tracks = {t["id"]: [(self.node[i]["x"], self.node[i]["y"]) for i in t["nodeIds"] if i in self.node] for t in st["tracks"]}
        self.conns = {}
        for c in st["connections"]:
            if c["from"] in self.node and c["to"] in self.node:
                a, b = self.node[c["from"]], self.node[c["to"]]
                self.conns[c["id"]] = [(a["x"], a["y"])] + [(v["x"], v["y"]) for v in c.get("via", [])] + [(b["x"], b["y"])]

    def track_y(self, tid, x):
        pts = self.tracks.get(tid, [])
        for a, b in zip(pts, pts[1:]):
            lo, hi = sorted((a[0], b[0]))
            if lo - 1e-6 <= x <= hi + 1e-6 and hi > lo:
                return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
        return None

    def extent(self, tid):
        xs = [p[0] for p in self.tracks.get(tid, [])]
        return (min(xs), max(xs)) if xs else (None, None)

    def nearest(self, x, y):
        best = []
        for kind, d in (("track", self.tracks), ("connection", self.conns)):
            for rid, pts in d.items():
                dm = min((_seg_dist(x, y, *a, *b) for a, b in zip(pts, pts[1:])), default=1e9)
                best.append((dm, kind, rid))
        return sorted(best)[:4]


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


# ---------------------------------------------------------------- summary

def cmd_summary(a):
    st = load(a.json)
    g = Geo(st)
    m = st["meta"]
    print(f"{m.get('code')} {m.get('name')}  sheet={m.get('sheet')}  chainage={m.get('chainage')}")
    print(f"ends: {m.get('ends')}")
    print("\nTRACKS (id, name, kind, dir, x-range, y at ends)")
    for t in st["tracks"]:
        x0, x1 = g.extent(t["id"])
        pts = g.tracks[t["id"]]
        print(f"  {t['id']:6} {t.get('name',''):28} {t.get('kind',''):8} {t.get('direction',''):4} x {x0:.0f}..{x1:.0f}  y {pts[0][1]:.1f}->{pts[-1][1]:.1f}  nodes {len(t['nodeIds'])}")
    print("\nCONNECTIONS (id, kind, from->to)")
    for c in st["connections"]:
        f, t = g.node.get(c["from"]), g.node.get(c["to"])
        print(f"  {c['id']:6} {c['kind']:9} {c['from']}({f['x']:.0f},{f['y']:.0f}) -> {c['to']}({t['x']:.0f},{t['y']:.0f})")
    A = st["assets"]
    print("\nSIGNALS (code, kind, dir, track, footX, side, headDir, elements)")
    for s in sorted(A.get("signals", []), key=lambda s: s["footX"]):
        el = " ".join(e.get("style") or e.get("text") or e["kind"] for e in s["elements"])
        print(f"  {s['code']:8} {s['kind']:15} {s['direction']} {s['trackId']:5} x={s['footX']:.1f} {s['side']:5} {s['headDir']:4} [{el}]")
    print("\nPOINTS (code, node, connection, ratio, switch, crank handle)")
    for p in sorted(A.get("points", []), key=lambda p: g.node.get(p["nodeId"], {}).get("x", 0)):
        n = g.node.get(p["nodeId"], {})
        print(f"  {p['code']:6} {p['nodeId']}({n.get('x',0):.0f},{n.get('y',0):.0f}) {p.get('connectionId','-'):6} {p.get('ratio','')!r} {p.get('switch','')!r} {p.get('crankHandle','')}")
    print("\nTRACK CIRCUITS (code, spans)")
    for tc in A.get("trackCircuits", []):
        sp = ", ".join(f"{s['trackId']} {s['x0']:.0f}..{s['x1']:.0f}" if "trackId" in s else s["connectionId"] for s in tc["spans"])
        print(f"  {tc['code']:10} {'~' if tc.get('approx') else ' '} {sp}")
    j = defaultdict(list)
    for x in A.get("joints", []):
        j[x["trackId"]].append(round(x["x"]))
    print("\nJOINTS by track")
    for tid, xs in j.items():
        print(f"  {tid}: {sorted(xs)}")
    print("\nOTHER counts: " + ", ".join(f"{k}={len(v)}" for k, v in A.items() if k not in ("signals", "points", "trackCircuits", "joints")))
    I = st["info"]
    print("INFO: " + ", ".join(f"{k}={len(v)}" for k, v in I.items()))


# ---------------------------------------------------------------- check

def cmd_check(a):
    st = load(a.json)
    issues = check(st)
    for lvl, code, msg in issues:
        print(f"{lvl.upper():7} {code:28} {msg}")
    n_err = sum(1 for i in issues if i[0] == "error")
    print(f"\n{n_err} errors, {sum(1 for i in issues if i[0] == 'warning')} warnings, {sum(1 for i in issues if i[0] == 'todo')} to-dos")
    sys.exit(1 if n_err else 0)


def check(st):
    out = []
    E = lambda c, m: out.append(("error", c, m))      # noqa: E731
    W = lambda c, m: out.append(("warning", c, m))    # noqa: E731
    T = lambda c, m: out.append(("todo", c, m))       # noqa: E731
    g = Geo(st)
    A = st["assets"]
    # same rules as src/sip/model/validate.ts
    for kind, items in (("node", st["nodes"]), ("track", st["tracks"]), ("connection", st["connections"])):
        for k, v in Counter(i["id"] for i in items).items():
            if v > 1:
                E(f"{kind}.duplicate", f"duplicate {kind} id {k}")
    used = set()
    for t in st["tracks"]:
        if len(t["nodeIds"]) < 2:
            E("track.short", f"{t['id']} needs at least 2 nodes")
        xs = []
        for i, nid in enumerate(t["nodeIds"]):
            n = g.node.get(nid)
            if not n:
                E("track.node-missing", f"{t['id']} references unknown node {nid}")
                continue
            used.add(nid)
            xs.append(n["x"])
            if 0 < i < len(t["nodeIds"]) - 1 and n["kind"] in ("bufferStop", "sandHump", "boundary"):
                W("track.end-inside", f"{t['id']}: {n['kind']} {nid} sits inside the track")
            if i + 1 < len(t["nodeIds"]):
                m = g.node.get(t["nodeIds"][i + 1])
                if m and (m["x"], m["y"]) == (n["x"], n["y"]):
                    E("track.zero-length", f"{t['id']}: {nid} and {m['id']} share a position")
        if not (all(b >= a_ for a_, b in zip(xs, xs[1:])) or all(b <= a_ for a_, b in zip(xs, xs[1:]))):
            W("track.not-monotonic", f"{t['id']} doubles back along x")
        for f in ("name", "kind", "direction"):
            if f not in t:
                E("track.field", f"{t['id']} has no {f}")
        if re.match(r"^(Track|Line) ", t.get("name", "")) or not t.get("name"):
            T("track.unnamed", f"{t['id']} has a placeholder name {t.get('name')!r}")
    on_track = defaultdict(set)
    for t in st["tracks"]:
        for nid in t["nodeIds"]:
            on_track[nid].add(t["id"])
    for c in st["connections"]:
        for end in (c["from"], c["to"]):
            if end not in g.node:
                E("connection.node-missing", f"{c['id']} references unknown node {end}")
            elif not on_track[end]:
                E("connection.off-track", f"{c['id']}: node {end} is on no track")
        if c["from"] == c["to"]:
            E("connection.loop", f"{c['id']} starts and ends at {c['from']}")
        if on_track[c["from"]] & on_track[c["to"]]:
            W("connection.same-track", f"{c['id']} joins a track to itself")
    for n in st["nodes"]:
        if n["id"] not in used:
            W("node.unused", f"node {n['id']} is on no track")
    parent = {n["id"]: n["id"] for n in st["nodes"]}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for t in st["tracks"]:
        for p, q in zip(t["nodeIds"], t["nodeIds"][1:]):
            if p in parent and q in parent:
                parent[find(p)] = find(q)
    for c in st["connections"]:
        if c["from"] in parent and c["to"] in parent:
            parent[find(c["from"])] = find(c["to"])
    groups = {find(n) for n in parent}
    if len(groups) > 1:
        W("graph.disconnected", f"yard splits into {len(groups)} parts")

    tids, cids = set(g.tracks), set(g.conns)
    for kind in ("points", "signals", "joints", "trackCircuits", "platforms", "structures", "bridges", "chainageMarks", "gradients", "dimensions"):
        for k, v in Counter(i.get("id") for i in A.get(kind, [])).items():
            if v > 1:
                E(f"{kind}.duplicate", f"duplicate id {k}")
    for kind, key in (("signals", "code"), ("points", "code"), ("trackCircuits", "code")):
        for k, v in Counter(i.get(key) for i in A.get(kind, [])).items():
            if v > 1:
                W(f"{kind}.code-twice", f"code {k} used {v} times")

    for p in A.get("points", []):
        if p["nodeId"] not in g.node:
            E("point.node-missing", f"point {p['code']} -> unknown node {p['nodeId']}")
        if p.get("connectionId") and p["connectionId"] not in cids:
            E("point.connection-missing", f"point {p['code']} -> unknown connection {p['connectionId']}")
        if not p.get("ratio"):
            T("point.no-ratio", f"point {p['code']} has no ratio (look for '1 IN ..' on the leg, or the notes)")
        if not re.match(r"^\d+[A-Z]?$", p["code"]):
            T("point.code", f"point code {p['code']!r} does not look like a point number")
    for s in A.get("signals", []):
        if s["trackId"] not in tids:
            E("signal.track-missing", f"signal {s['code']} -> unknown track {s['trackId']}")
        elif g.track_y(s["trackId"], s["footX"]) is None:
            W("signal.off-track", f"signal {s['code']} footX {s['footX']} is outside track {s['trackId']}")
        if not s["elements"]:
            W("signal.empty", f"signal {s['code']} has no head elements")
        if s["code"].startswith("?") or not s.get("code"):
            T("signal.unnamed", f"signal at {s['trackId']} x={s['footX']:.0f} has no name ({s['code']})")
        for f in ("kind", "direction", "side", "headDir", "anchorX"):
            if f not in s:
                E("signal.field", f"signal {s['code']} has no {f}")
    for j in A.get("joints", []):
        if j["trackId"] not in tids:
            E("joint.track-missing", f"joint {j['id']} -> unknown track {j['trackId']}")
        elif g.track_y(j["trackId"], j["x"]) is None:
            W("joint.off-track", f"joint {j['id']} x={j['x']} is outside its track")
    covered = defaultdict(list)
    for tc in A.get("trackCircuits", []):
        if not tc["spans"]:
            W("trackCircuit.empty", f"{tc['code']} has no spans")
        for sp in tc["spans"]:
            if "trackId" in sp:
                if sp["trackId"] not in tids:
                    E("trackCircuit.track-missing", f"{tc['code']} -> unknown track {sp['trackId']}")
                    continue
                if sp["x1"] <= sp["x0"]:
                    E("trackCircuit.span", f"{tc['code']} has an empty span")
                covered[sp["trackId"]].append((sp["x0"], sp["x1"], tc["code"]))
            elif sp.get("connectionId") not in cids:
                E("trackCircuit.connection-missing", f"{tc['code']} -> unknown connection {sp.get('connectionId')}")
    for tid, spans in covered.items():
        spans.sort()
        for (a0, a1, ca), (b0, b1, cb) in zip(spans, spans[1:]):
            if b0 < a1 - 1.0:
                W("trackCircuit.overlap", f"{ca} and {cb} overlap on {tid} ({b0:.0f}..{min(a1, b1):.0f})")
    for tid in tids:
        x0, x1 = g.extent(tid)
        spans = sorted(covered.get(tid, []))
        cur = x0
        for s0, s1, _ in spans:
            if s0 - cur > 20:
                T("trackCircuit.gap", f"{tid} {cur:.0f}..{s0:.0f} is in no track circuit (fine if the SIP leaves it out)")
            cur = max(cur, s1)
        if x1 - cur > 20:
            T("trackCircuit.gap", f"{tid} {cur:.0f}..{x1:.0f} is in no track circuit (fine if the SIP leaves it out)")
    for s in A.get("structures", []):
        for k in ("foot", "at"):
            if s.get(k) and s[k]["trackId"] not in tids:
                E("structure.track-missing", f"structure {s['id']} -> unknown track {s[k]['trackId']}")
    for b in A.get("breaks", []):
        if b["trackId"] not in tids:
            E("break.track-missing", f"break -> unknown track {b['trackId']}")
    m = st["meta"]
    if not m.get("chainage") and (A.get("chainageMarks") or A.get("bridges")):
        W("meta.chainage-missing", "chainage marks exist but meta.chainage is not set")
    for side in ("west", "east"):
        e = m.get("ends", {}).get(side, "")
        if not e or e.endswith("-hand end") or not re.search(r"[A-Za-z]{3}", e) or re.search(r"[#@$%]", e):
            T("meta.ends", f"meta.ends.{side} = {e!r} looks like a placeholder or an OCR misread")
    if not m.get("zone"):
        T("meta.zone", "meta.zone is empty (title block)")
    return out


# ---------------------------------------------------------------- drawing

def render(st, a, x0, x1, y0, y1, out, overlay=True, grid=None, zoom=None):
    import pymupdf
    from PIL import Image, ImageDraw, ImageFont
    ox, oy = offset_of(st, a)
    pg = page_of(st, a)
    zoom = zoom or max(1.0, min(8.0, 2000.0 / max(1.0, x1 - x0), 1400.0 / max(1.0, y1 - y0)))
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=pymupdf.Rect(x0 + ox, y0 + oy, x1 + ox, y1 + oy))
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("RGBA")
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    try:
        font = ImageFont.load_default(size=max(11, int(3.2 * zoom)))
        small = ImageFont.load_default(size=max(10, int(2.4 * zoom)))
    except TypeError:
        font = small = ImageFont.load_default()
    S = lambda x, y: ((x - x0) * zoom, (y - y0) * zoom)   # noqa: E731

    def label(xy, text, fill, f=None):
        f = f or small
        bb = d.textbbox(xy, text, font=f)
        d.rectangle([bb[0] - 2, bb[1] - 1, bb[2] + 2, bb[3] + 1], fill=(255, 255, 255, 215))
        d.text(xy, text, fill=fill, font=f)

    if grid is None:
        span = x1 - x0
        grid = 5 if span <= 150 else 10 if span <= 400 else 25 if span <= 1000 else 50 if span <= 2500 else 100
    gx = math.ceil(x0 / grid) * grid
    while gx <= x1:
        major = (gx / grid) % 5 == 0
        px, _ = S(gx, y0)
        d.line([px, 0, px, im.size[1]], fill=(120, 120, 120, 90 if major else 40), width=1)
        if major or grid >= 25:
            d.text((px + 2, 2), f"{gx:g}", fill=(90, 90, 90, 255), font=small)
            d.text((px + 2, im.size[1] - 14 - 2.4 * zoom), f"{gx:g}", fill=(90, 90, 90, 255), font=small)
        gx += grid
    gy = math.ceil(y0 / grid) * grid
    while gy <= y1:
        _, py = S(x0, gy)
        d.line([0, py, im.size[0], py], fill=(120, 120, 120, 40), width=1)
        d.text((2, py + 1), f"y{gy:g}", fill=(90, 90, 90, 255), font=small)
        gy += grid

    if overlay:
        g = Geo(st)
        w = max(2, int(zoom * 0.9))
        for tid, pts in g.tracks.items():
            d.line([S(*p) for p in pts], fill=(30, 90, 255, 110), width=w)
            for p, q in zip(pts, pts[1:]):
                mx = min(max((p[0] + q[0]) / 2, x0 + 20), x1 - 40)
                if min(p[0], q[0]) <= mx <= max(p[0], q[0]):
                    y = g.track_y(tid, mx)
                    if y is not None and y0 <= y <= y1:
                        px, py = S(mx, y)
                        label((px, py - 5 * zoom), tid, (30, 60, 220, 255), small)
                        break
        for cid, pts in g.conns.items():
            d.line([S(*p) for p in pts], fill=(0, 170, 60, 140), width=w)
            px, py = S(*pts[len(pts) // 2] if len(pts) > 2 else ((pts[0][0] + pts[-1][0]) / 2, (pts[0][1] + pts[-1][1]) / 2))
            label((px + 3, py), cid, (0, 130, 40, 255), small)
        for n in st["nodes"]:
            if x0 <= n["x"] <= x1 and y0 <= n["y"] <= y1:
                px, py = S(n["x"], n["y"])
                col = {"junction": (255, 0, 255, 255), "boundary": (0, 0, 0, 255), "bufferStop": (200, 0, 0, 255), "sandHump": (200, 140, 0, 255)}.get(n["kind"], (120, 120, 255, 200))
                r = 2.2 * zoom if n["kind"] != "plain" else 1.2 * zoom
                d.ellipse([px - r, py - r, px + r, py + r], outline=col, width=2)
                if n["kind"] != "plain":
                    d.text((px + r, py + r), n["id"], fill=col, font=small)
        A = st["assets"]
        for j in A.get("joints", []):
            y = g.track_y(j["trackId"], j["x"])
            if y is not None:
                px, py = S(j["x"], y)
                d.line([px, py - 4 * zoom, px, py + 4 * zoom], fill=(255, 140, 0, 230), width=w)
        for j in A.get("connectionJoints", []):
            px, py = S(j["x"], j["y"])
            d.line([px, py - 4 * zoom, px, py + 4 * zoom], fill=(255, 140, 0, 230), width=w)
        for i, tc in enumerate(A.get("trackCircuits", [])):
            for sp in tc["spans"]:
                if "trackId" not in sp:
                    pts = g.conns.get(sp["connectionId"])
                    if pts:
                        px, py = S(*pts[0])
                        qx, qy = S(*pts[-1])
                        label(((px + qx) / 2, (py + qy) / 2 + 4 * zoom), tc["code"], (0, 140, 160, 255), small)
                    continue
                ya = g.track_y(sp["trackId"], sp["x0"] + 0.01)
                yb = g.track_y(sp["trackId"], sp["x1"] - 0.01)
                if ya is None or yb is None:
                    continue
                off = (2.5 + 1.5 * (i % 2)) * zoom
                pa, pb = S(sp["x0"] + 0.8, ya), S(sp["x1"] - 0.8, yb)
                d.line([pa[0], pa[1] + off, pb[0], pb[1] + off], fill=(0, 190, 210, 230), width=max(2, w - 1))
                lx = min(max((pa[0] + pb[0]) / 2, 10), im.size[0] - 80)
                label((lx, (pa[1] + pb[1]) / 2 + off + 2), tc["code"] + ("~" if tc.get("approx") else ""), (0, 120, 140, 255), small)
        for s in A.get("signals", []):
            y = g.track_y(s["trackId"], s["footX"])
            if y is None:
                continue
            px, py = S(s["footX"], y)
            r = 1.8 * zoom
            d.ellipse([px - r, py - r, px + r, py + r], fill=(0, 0, 0, 220))
            el = " ".join((e.get("style") or e.get("text") or e["kind"])[:5] for e in s["elements"])
            ty = py - 12 * zoom if s["side"] == "above" else py + 5 * zoom
            label((px + 3, ty), f"{s['code']} {s['kind'][:5]} {s['direction']} {'>' if s['headDir'] == 'east' else '<'} {el}", (0, 0, 0, 255), font)
        for p in A.get("points", []):
            n = g.node.get(p["nodeId"])
            if n:
                px, py = S(n["x"], n["y"])
                label((px - 4 * zoom, py + 3 * zoom), f"{p['code']} {p.get('ratio', '')} {p.get('switch', '')} {p.get('crankHandle', '')}", (190, 0, 190, 255), font)
    Image.alpha_composite(im, ov).convert("RGB").save(out)
    return out, zoom


def default_y(st, x0, x1):
    ys = [n["y"] for n in st["nodes"] if x0 - 50 <= n["x"] <= x1 + 50] or [n["y"] for n in st["nodes"]]
    return min(ys) - 70, max(ys) + 70


def cmd_view(a):
    st = load(a.json)
    y0, y1 = (a.y0, a.y1) if a.y0 is not None and a.y1 is not None else default_y(st, a.x0, a.x1)
    out = a.out or f"view_{int(a.x0)}_{int(a.x1)}.png"
    out, z = render(st, a, a.x0, a.x1, y0, y1, out, overlay=not a.plain, grid=a.grid, zoom=a.zoom)
    print(f"{out}  (x {a.x0:g}..{a.x1:g}, y {y0:.0f}..{y1:.0f}, zoom {z:.2f}; grid labels are JSON coordinates)")


def cmd_tiles(a):
    st = load(a.json)
    xs = [n["x"] for n in st["nodes"]]
    lo, hi = min(xs) - 30, max(xs) + 30
    os.makedirs(a.out, exist_ok=True)
    k, x = 1, lo
    while x < hi:
        x1 = min(hi, x + a.width)
        y0, y1 = default_y(st, x, x1)
        out, _ = render(st, a, x - 10, x1 + 10, y0, y1, os.path.join(a.out, f"tile_{k:02d}_{int(x)}_{int(x1)}.png"), overlay=not a.plain)
        print(out)
        k += 1
        x = x1


# ---------------------------------------------------------------- primitives / text

def read_prims(st, a):
    import pdfio
    pg = pdfio.read_page(a.pdf, int(st.get("meta", {}).get("sheet", {}).get("page", 0)))
    return pg


def cmd_prims(a):
    st = load(a.json)
    ox, oy = offset_of(st, a)
    pg = read_prims(st, a)
    X0, X1, Y0, Y1 = a.x0 + ox, a.x1 + ox, a.y0 + oy, a.y1 + oy
    inside = lambda x, y: X0 <= x <= X1 and Y0 <= y <= Y1   # noqa: E731
    J = lambda x, y: f"({x - ox:.1f},{y - oy:.1f})"           # noqa: E731
    what = set(a.what.split(","))
    if "lines" in what or "ticks" in what:
        for s in pg.segs:
            if not (inside(s.x0, s.y0) or inside(s.x1, s.y1)):
                continue
            L = math.hypot(s.x1 - s.x0, s.y1 - s.y0)
            if L < 3:                       # letter strokes and hatching
                continue
            ang = math.degrees(math.atan2(s.y1 - s.y0, s.x1 - s.x0)) % 180
            tick = L <= 16 and 70 <= ang <= 110
            if ("ticks" in what and tick) or "lines" in what:
                tag = "TICK" if tick else "line"
                print(f"{tag:5} {J(s.x0, s.y0)} -> {J(s.x1, s.y1)} len {L:.1f} angle {ang:.0f} width {s.width:.2f}{' thick' if s.thick else ''}")
    if "arrows" in what:
        for t in pg.tris:
            if inside(*t.tip):
                ang = math.degrees(math.atan2(t.tip[1] - t.base[1], t.tip[0] - t.base[0]))
                print(f"ARROW tip {J(*t.tip)} pointing {ang:.0f} deg (90 = down, -90 = up, 0 = right) size {t.size:.1f}")
    if "circles" in what:
        for c in pg.circles + pg.dots:
            if inside(c.cx, c.cy):
                print(f"CIRCLE {J(c.cx, c.cy)} r {c.r:.1f}{' filled' if c.filled else ''}")
        for ar in pg.arcs:
            bx = ar.bbox
            if inside((bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2):
                print(f"ARC bbox {J(bx[0], bx[1])}..{J(bx[2], bx[3])}")
    if "text" in what:
        for w in pg.words:
            if inside((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2):
                print(f"TEXT {w.text!r} at {J((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2)} rot {w.rotation:.0f}")
    if pg.small_paths and "text" in what and not pg.words:
        print("(this sheet draws its text as strokes: use `text --ocr` or look at a `view` image)")


def cmd_text(a):
    st = load(a.json)
    ox, oy = offset_of(st, a)
    import pdfio
    pg = pdfio.read_page(a.pdf, int(st.get("meta", {}).get("sheet", {}).get("page", 0)))
    if a.ocr:
        import stroketext
        print("reading stroke text with OCR (about half a minute)...", file=sys.stderr)
        stroketext.apply(pg)
    rx = re.compile(a.find, re.I)
    n = 0
    for w in pg.words:
        if rx.search(w.text):
            print(f"{w.text!r:40} at ({(w.x0 + w.x1) / 2 - ox:.1f},{(w.y0 + w.y1) / 2 - oy:.1f}) rot {w.rotation:.0f}")
            n += 1
    if not n:
        print("no match" + ("" if a.ocr or pg.words else " (no real text on this sheet: add --ocr)"))


def cmd_near(a):
    st = load(a.json)
    g = Geo(st)
    print("nearest rails:")
    for dist, kind, rid in g.nearest(a.x, a.y):
        y = g.track_y(rid, a.x) if kind == "track" else None
        print(f"  {kind} {rid} at distance {dist:.1f}" + (f"; track y at x={a.x:g} is {y:.2f}" if y is not None else ""))
    print(f"within {a.r} pt:")
    for n in st["nodes"]:
        if math.hypot(n["x"] - a.x, n["y"] - a.y) <= a.r:
            print(f"  node {n['id']} {n['kind']} ({n['x']},{n['y']})")
    A = st["assets"]
    for s in A.get("signals", []):
        y = g.track_y(s["trackId"], s["footX"]) or 0
        if math.hypot(s["footX"] - a.x, y - a.y) <= a.r:
            print(f"  signal {s['code']} ({s['id']}) foot ({s['footX']},{y:.1f})")
    for p in A.get("points", []):
        n = g.node.get(p["nodeId"])
        if n and math.hypot(n["x"] - a.x, n["y"] - a.y) <= a.r:
            print(f"  point {p['code']} ({p['id']}) at node {p['nodeId']}")
    for j in A.get("joints", []):
        y = g.track_y(j["trackId"], j["x"]) or 0
        if math.hypot(j["x"] - a.x, y - a.y) <= a.r:
            print(f"  joint {j['id']} x={j['x']}")
    for tc in A.get("trackCircuits", []):
        for sp in tc["spans"]:
            if "trackId" in sp and sp["x0"] <= a.x <= sp["x1"]:
                y = g.track_y(sp["trackId"], a.x)
                if y is not None and abs(y - a.y) <= a.r:
                    print(f"  track circuit {tc['code']} spans {sp['trackId']} {sp['x0']}..{sp['x1']}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, pdf=True):
        p.add_argument("json")
        if pdf:
            p.add_argument("pdf")
            p.add_argument("--offset", type=float, nargs=2, metavar=("OX", "OY"))
        return p
    common(sub.add_parser("summary"), pdf=False).set_defaults(f=cmd_summary)
    common(sub.add_parser("check"), pdf=False).set_defaults(f=cmd_check)
    p = common(sub.add_parser("view"))
    p.add_argument("--x0", type=float, required=True)
    p.add_argument("--x1", type=float, required=True)
    p.add_argument("--y0", type=float)
    p.add_argument("--y1", type=float)
    p.add_argument("--zoom", type=float)
    p.add_argument("--grid", type=float)
    p.add_argument("--plain", action="store_true", help="the sheet only, nothing drawn on it")
    p.add_argument("--out")
    p.set_defaults(f=cmd_view)
    p = common(sub.add_parser("tiles"))
    p.add_argument("--out", required=True)
    p.add_argument("--width", type=float, default=500)
    p.add_argument("--plain", action="store_true")
    p.set_defaults(f=cmd_tiles)
    p = common(sub.add_parser("prims"))
    for k in ("x0", "x1", "y0", "y1"):
        p.add_argument(f"--{k}", type=float, required=True)
    p.add_argument("--what", default="ticks,arrows,circles,text")
    p.set_defaults(f=cmd_prims)
    p = common(sub.add_parser("text"))
    p.add_argument("--find", required=True)
    p.add_argument("--ocr", action="store_true", help="also read text drawn as strokes")
    p.set_defaults(f=cmd_text)
    p = common(sub.add_parser("near"), pdf=False)
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)
    p.add_argument("--r", type=float, default=40)
    p.set_defaults(f=cmd_near)
    a = ap.parse_args(argv)
    a.f(a)


if __name__ == "__main__":
    main()
