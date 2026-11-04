"""Assemble the station JSON (nodes, tracks, connections) from the extracted paths."""
from __future__ import annotations

from topology import Graph, Pt
from assemble import Path


def build_skeleton(g: Graph, paths: list[Path], deg: dict[int, int], cfg: dict) -> dict:
    allpts = [p for pa in paths for p in pa.pts]
    print(f"build_skeleton: {len(paths)} paths, {len(allpts)} points, {len(g.verts)} vertices, {len(deg)} degrees")
    minx = min(p[0] for p in allpts)
    maxx = max(p[0] for p in allpts)
    miny = min(p[1] for p in allpts)
    ox, oy = minx - 40.0, miny - 40.0
    edge_zone = 0.04 * (maxx - minx)

    nodes: dict[str, dict] = {}
    key_to_id: dict[tuple[int, int], str] = {}

    def nid(p: Pt, v: int | None) -> str:
        key = (round(p[0] * 2), round(p[1] * 2))
        if key in key_to_id:
            return key_to_id[key]
        i = f"N{len(nodes) + 1:03d}"
        key_to_id[key] = i
        d = deg.get(v, 2) if v is not None else 2
        if v is not None and d == 1:
            kind = "boundary" if (p[0] - minx < edge_zone or maxx - p[0] < edge_zone) else "bufferStop"
        elif v is not None and d >= 3:
            kind = "junction"
        else:
            kind = "plain"
        nodes[i] = {"id": i, "x": round(p[0] - ox, 2), "y": round(p[1] - oy, 2), "kind": kind}
        return i

    tracks, conns = [], []
    ti = ci = 0
    for pa in sorted(paths, key=lambda q: (min(p[1] for p in q.pts), min(p[0] for p in q.pts))):
        vset = {}
        for v in pa.verts:
            x, y = g.verts[v]
            vset[(round(x * 2), round(y * 2))] = v
        if pa.kind == "connection":
            ci += 1
            ends = [nid(pa.pts[0], vset.get((round(pa.pts[0][0] * 2), round(pa.pts[0][1] * 2)))),
                    nid(pa.pts[-1], vset.get((round(pa.pts[-1][0] * 2), round(pa.pts[-1][1] * 2))))]
            conns.append({"id": f"C{ci:02d}", "kind": "crossover", "from": ends[0], "to": ends[1],
                          "via": [{"x": round(p[0] - ox, 2), "y": round(p[1] - oy, 2)} for p in pa.pts[1:-1]]})
        else:
            ids = []
            for p in pa.pts:
                i = nid(p, vset.get((round(p[0] * 2), round(p[1] * 2))))
                if not ids or ids[-1] != i:
                    ids.append(i)
            ti += 1
            tracks.append({"id": f"T{ti:02d}", "name": f"Track {ti}", "kind": "loop", "direction": "BOTH", "nodeIds": ids})
    meta = {
        "code": cfg["code"], "name": cfg["name"], "zone": cfg.get("zone", ""), "sipRef": cfg.get("sipRef", ""),
        "coordinateSpace": "drawing-pt: sheet coordinates shifted so the yard starts near the origin; y grows downward",
        "ends": cfg.get("ends", {"west": "west end", "east": "east end"}),
        "viewHints": {"yExaggeration": cfg.get("yExaggeration", 1)},
    }
    if cfg.get("scale"):
        meta["scale"] = cfg["scale"]
    return {"meta": meta, "nodes": list(nodes.values()), "tracks": tracks, "connections": conns,
            "_origin": [ox, oy]}
