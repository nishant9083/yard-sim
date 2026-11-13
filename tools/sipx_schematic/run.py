"""sipx - turn a Signal Interlocking Plan PDF into a station JSON for the viewer.

    python3 tools/sipx/run.py  plan.pdf  --config tools/stations/ryd.json  --out src/sip/data/ryd.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

import assemble as A          # noqa: E402
import assets as AS           # noqa: E402
import info as INFO           # noqa: E402
import build_station as B     # noqa: E402
import pdfio                  # noqa: E402
import topology as T          # noqa: E402


def infer_config(page, pdf_path: str) -> dict:
    """Best guess for code / name / sheet reference when no config is given."""
    import re
    stem = os.path.splitext(os.path.basename(pdf_path))[0]
    code = re.sub(r"[^A-Z0-9]", "", stem.upper())[:4] or "STN"
    big = sorted((w for w in page.words if abs(w.rotation) < 1 and (w.y1 - w.y0) >= 11), key=lambda w: (round(w.cy / 3), w.x0))
    name = " ".join(w.text for w in big).title() if big else stem
    ref = next((w.text for w in page.words if re.fullmatch(r"SI[P]?[-./A-Z0-9]*\d+", w.text)), "")
    return {"code": code, "name": name[:60] or code, "sipRef": ref, "ends": {"west": "west end", "east": "east end"}}


def apply_overrides(st: dict, cfg: dict, origin) -> None:
    """Hand corrections from the config, so a fix survives re-running the extractor."""
    ov = cfg.get("overrides", {})
    ox, oy = origin
    net = AS.Net(st)
    for item in ov.get("tracksAt", []):            # {"at": [pageX, pageY], "set": {"name": ..., "kind": ..., "direction": ...}}
        _, tid, _, _ = net.nearest(item["at"][0] - ox, item["at"][1] - oy)
        next(t for t in st["tracks"] if t["id"] == tid).update(item["set"])
    for kind, key in (("signals", "code"), ("points", "code"), ("trackCircuits", "code")):
        for code, patch in ov.get(kind, {}).items():
            for it in st["assets"][kind]:
                if it[key] == code:
                    it.update(patch)
        drop = set(ov.get("drop" + kind.capitalize(), []))
        if drop:
            st["assets"][kind] = [it for it in st["assets"][kind] if it[key] not in drop]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--config", help="small JSON with code/name/zone/ends (and optional overrides)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--debug", help="write a PNG of the extracted graph here")
    ap.add_argument("--code", help="station code (used when there is no --config)")
    ap.add_argument("--name", help="station name (used when there is no --config)")
    a = ap.parse_args(argv)
    cfg = json.load(open(a.config)) if a.config else {}
    page = pdfio.read_page(a.pdf)
    for k, v in infer_config(page, a.pdf).items():
        cfg.setdefault(k, v)
    if a.code:
        cfg["code"] = a.code
    if a.name:
        cfg["name"] = a.name
    P = T.Params(**cfg.get("topology", {}))
    full_segs = page.segs
    box = cfg.get("yardBox")          # [x0, y0, x1, y1] in sheet points: where the track layout is, if the sheet is crowded
    if box:
        inside = lambda s: box[0] <= (s.x0 + s.x1) / 2 <= box[2] and box[1] <= (s.y0 + s.y1) / 2 <= box[3]  # noqa: E731
        page.segs = [s for s in page.segs if inside(s)]
    for ex in cfg.get("excludeBoxes", []):
        page.segs = [s for s in page.segs if not (ex[0] <= (s.x0 + s.x1) / 2 <= ex[2] and ex[1] <= (s.y0 + s.y1) / 2 <= ex[3])]
    g = T.build_graph(page, P)
    g, rep = T.drop_non_track(g, page, P)
    g, stubs = T.prune_spurs(g, P)
    paths, deg = A.assemble(g)
    st = B.build_skeleton(g, paths, deg, cfg)
    origin = tuple(st.pop("_origin"))
    st["meta"]["sheet"] = {"pdf": os.path.basename(a.pdf), "page": int(cfg.get("page", 0)), "offset": [round(origin[0], 3), round(origin[1], 3)]}
    claimed: set[int] = set()
    tables = INFO.extract_tables(page, rep["tables"], claimed)
    notes = INFO.extract_notes(page, claimed)
    assets, names, claimed, report, far = AS.extract_assets(page, st, origin, g.symbol_segs, cfg, claimed)
    for t in st["tracks"]:
        if t["id"] in names:
            t["name"] = names[t["id"]]
    title = INFO.extract_title_from(far, claimed)
    notes += INFO.free_blocks(far, claimed)
    ch = INFO.crank_handles(tables)
    for p in assets["points"]:
        h = ch.get(p["code"]) or ch.get(str(p["control"]))
        if h:
            p["crankHandle"] = h
    st["assets"] = assets
    for t in st["tracks"]:                         # kind from how the ends finish: boundary-to-boundary = main, buffer stop = siding
        kinds = {n["id"]: n["kind"] for n in st["nodes"]}
        ek = (kinds[t["nodeIds"][0]], kinds[t["nodeIds"][-1]])
        t["kind"] = "main" if ek == ("boundary", "boundary") else ("siding" if "bufferStop" in ek else "loop")
    for tc in st["assets"]["trackCircuits"]:       # a line caption such as L3AXT names the line it sits on
        m = re.match(r"^L(\d+)[A-Z]?XT$", tc["code"])
        if m and tc["spans"]:
            t = next((x for x in st["tracks"] if x["id"] == tc["spans"][0]["trackId"]), None)
            if t and t["name"].startswith("Track "):
                t["name"] = f"Line {m.group(1)}"
                t["lineNo"] = int(m.group(1))
    st["info"] = {"titleBlock": title, "lines": [], "legend": [], "notes": notes, "tables": tables,
                  "procedures": [], "aspectCharts": [], "revisions": []}
    apply_overrides(st, cfg, origin)
    leftover = [w.text for w in page.words if id(w) not in claimed and abs(w.rotation) < 1.0]
    report["unclaimedText"] = leftover
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items()}))
    if a.debug:
        import debug_plot
        debug_plot.plot(g, page, a.debug)
    json.dump(st, open(a.out, "w"), indent=1)
    rpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "reports", f"{cfg['code'].lower()}.report.json")
    os.makedirs(os.path.dirname(rpath), exist_ok=True)
    json.dump(report, open(rpath, "w"), indent=1)
    print(f"{cfg['code']}: {len(st['nodes'])} nodes, {len(st['tracks'])} tracks, {len(st['connections'])} connections -> {a.out}")


if __name__ == "__main__":
    main()
