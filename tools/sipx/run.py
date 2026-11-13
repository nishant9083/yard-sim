"""sipx: turn a CAD-plotted Signal Interlocking Plan (vector PDF) into the viewer's station JSON.

    python3 tools/sipx/run.py plan.pdf --code GNPR --out src/sip/data/gnpr.json [--config tools/stations/gnpr.json]

Nothing depends on colours or layers; see tools/METHODOLOGY.md for what is recognised and how.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import circuits as C          # noqa: E402
import extract                # noqa: E402
import furniture as F         # noqa: E402
import info as INFO           # noqa: E402
import network as N           # noqa: E402
import symbols as S           # noqa: E402
from net import Net           # noqa: E402
from overrides import apply_overrides   # noqa: E402


def build(pdf: str, cfg: dict):
    st, ctx = extract.skeleton(pdf, cfg)
    page, origin = ctx["page"], ctx["origin"]
    ox, oy = origin
    report: dict = {}
    claimed: set[int] = set()

    lines_summary, idmap = F.name_tracks(page, st, origin, claimed)
    net = Net(st)

    # tables first, so that numbers inside them are never mistaken for point or signal labels
    rails = ctx["rails"]
    xs = [q[0] for l in rails for q in l.pts]
    ys = [q[1] for l in rails for q in l.pts]
    yard = (min(xs), min(ys), max(xs), max(ys))
    charts = INFO.extract_aspect_charts(page, ctx, claimed)
    tables = INFO.extract_tables(page, ctx, yard, claimed)
    ch = INFO.crank_handles(tables)

    thick_ticks = sum(1 for s in ctx["ticks"] if 4 <= s.length <= 18)
    jt, jc, fouling = S.find_joints(ctx["ticks"], net, origin, thin=ctx["small"] if thick_ticks < 6 else None)
    N.soften_junctions(st, jt)
    net = Net(st)
    signals, posts, rep = S.find_signals(page, ctx["small"], net, origin, claimed)
    report.update(rep)
    points, rep = S.find_points(page, st, net, origin, claimed)
    report.update(rep)
    legless = S.add_legless_points(page, st, net, origin, claimed, points, set(ch))
    if legless:
        report["pointsDrawnWithoutLeg"] = legless
    # the aspect charts name the signals (HOME, MAIN STR., ADV. STR): use that for the kind
    for c in charts:
        for sg in c["signals"]:
            nm, code = sg["name"].upper(), re.sub(r"[^A-Z0-9]", "", sg["code"].upper())
            kind = "distant" if "DIST" in nm else "home" if "HOME" in nm else "advancedStarter" if "ADV" in nm else "starter" if "STR" in nm or "START" in nm else None
            if not kind or not code:
                continue
            for s_ in signals:
                if re.sub(r"[^A-Z0-9]", "", s_["code"].upper()) == code and s_["kind"] != "shunt":
                    s_["kind"] = kind
    tcs, unlabelled = C.find_circuits(page, st, net, origin, jt, jc, claimed)
    if unlabelled:
        report["railWithoutCircuitName"] = unlabelled

    cal = F.chainage_scale(page, yard)
    ends = F.yard_ends(page, yard, claimed)
    ctx["posts"] = posts
    furn, rep, _ = F.find_furniture(page, st, net, ctx, claimed, cal)
    report.update(rep)
    furn["structures"] = posts + furn["structures"]

    notes = INFO.extract_notes(page, yard, claimed)
    title, facts = INFO.extract_title(page, tables, claimed)
    for p in points:
        h = ch.get(str(p["control"]))
        if h:
            p["crankHandle"] = h
    # a leg without its own caption takes its switch angle from the notes, when they give one
    note_text = " ".join(n["text"] for n in notes)
    listed: dict[str, tuple[str, str]] = {}
    for m in re.finditer(r"1\s*IN\s*(\d+(?:\.\d+)?)\s*(?:\S{0,3})\s*\(?\s*([A-Z]{2,3})\s*\)?\s*=\s*((?:\d+[A-Z]?(?:/[A-Z])*[,.\s]*)+)", note_text):
        for tok in re.findall(r"\d+[A-Z]?(?:/[A-Z])*", m.group(3)):
            mm = re.match(r"(\d+)([A-Z](?:/[A-Z])*)?$", tok)
            for suf in (mm.group(2) or "").split("/") if mm.group(2) else [""]:
                listed[mm.group(1) + suf] = (f"1 IN {m.group(1)}", m.group(2))
    default = re.search(r"ALL\s+POINTS\s+ARE\s+1\s*IN\s*(\d+(?:\.\d+)?)\s*\(?\s*([A-Z]{2,3})?", note_text)
    for p in points:
        if not p["ratioInferred"]:
            continue
        hit = listed.get(p["code"]) or listed.get(str(p["control"]))
        if hit:
            p["ratio"], p["switch"] = hit
        elif default:
            p["ratio"], p["switch"] = f"1 IN {default.group(1)}", default.group(2) or ""
    missing = [p["code"] for p in points if not p["ratio"]]
    if missing:
        report["pointsWithoutAngle"] = missing

    joints = [{"id": f"IJ_{tid}_{int(round(x))}", "trackId": tid, "x": x} for tid, lst in jt.items() for x in sorted(lst)]
    assets = {"points": points, "signals": signals, "joints": joints, "trackCircuits": tcs, **furn}
    assets["connectionJoints"] = [{"connectionId": cid, "x": p[0], "y": p[1]} for cid, lst in jc.items() for p in lst]
    for t in tables:
        t.pop("_box", None)
    for c in st["connections"]:
        c.pop("_hooks", None)
        a = next((p["code"] for p in points if p["nodeId"] == c["from"] and p.get("connectionId") == c["id"]), "")
        b = next((p["code"] for p in points if p["nodeId"] == c["to"] and p.get("connectionId") == c["id"]), "")
        if a or b:
            c["label"] = "/".join(x for x in (a, b) if x and x != "?")
            base = re.match(r"\d+", a or b)
            if base and not any(o["id"] == f"C{base.group()}" for o in st["connections"]):
                old = c["id"]
                c["id"] = f"C{base.group()}"
                for p in points:
                    if p.get("connectionId") == old:
                        p["connectionId"] = c["id"]
                for tc in tcs:
                    for sp in tc["spans"]:
                        if sp.get("connectionId") == old:
                            sp["connectionId"] = c["id"]
                for j in assets["connectionJoints"]:
                    if j["connectionId"] == old:
                        j["connectionId"] = c["id"]

    code = cfg.get("code") or re.sub(r"[^A-Z0-9]", "", os.path.splitext(os.path.basename(pdf))[0].upper())[:5] or "STN"
    name = cfg.get("name") or facts.get("Station", "").title() or code
    meta = {"code": code, "name": name, "zone": cfg.get("zone") or facts.get("Zone", ""), "sipRef": cfg.get("sipRef") or facts.get("Plan no.", ""),
            "coordinateSpace": "drawing-pt: sheet points shifted so the yard starts near the origin; x grows to the right-hand end, y grows downward",
            "ends": {"west": cfg.get("ends", {}).get("west") or ends.get("west", "left-hand end"),
                     "east": cfg.get("ends", {}).get("east") or ends.get("east", "right-hand end")},
            "viewHints": {"yExaggeration": cfg.get("yExaggeration", 4)},
            "sheet": {"pdf": os.path.basename(pdf), "page": int(cfg.get("page", 0)), "offset": [round(ox, 3), round(oy, 3)]}}
    if cal:
        meta["chainage"] = {"originX": round(cal[0] - ox, 2), "metresPerUnit": round(cal[1], 5), "label": "CH",
                            "origin": "Zero of the printed chainages (station centre line)"}
        report["chainageFit"] = {"captionsUsed": cal[3], "rmsMetres": round(cal[2], 2)}
    else:
        report["chainageFit"] = "not enough CH captions to fit a scale"
    if facts.get("Longitudinal scale") or facts.get("Scale"):
        meta["scale"] = {"horizontal": facts.get("Longitudinal scale") or facts.get("Scale", ""), "vertical": facts.get("Transverse scale", "")}

    st["meta"] = meta
    st["assets"] = assets
    st["info"] = {"titleBlock": title, "lines": lines_summary, "legend": [], "notes": notes, "tables": tables, "procedures": [],
                  "aspectCharts": charts, "revisions": []}
    apply_overrides(st, cfg, origin)
    out = {"meta": st["meta"], "nodes": st["nodes"], "tracks": st["tracks"], "connections": st["connections"], "assets": st["assets"], "info": st["info"]}
    report["counts"] = {"tracks": len(out["tracks"]), "connections": len(out["connections"]), **{k: len(v) for k, v in assets.items()},
                        "tables": len(tables), "notes": len(notes), "aspectCharts": len(charts)}
    return out, report, ctx


def score(st: dict) -> float:
    """How much usable station the result holds (to choose between engines)."""
    a = st.get("assets", {})
    pts = a.get("points", [])
    legged = sum(1 for p in pts if p.get("connectionId"))
    tcs = sum(1 for t in a.get("trackCircuits", []) if t.get("spans"))
    named = sum(1 for s in a.get("signals", []) if not str(s.get("code", "?")).startswith("?"))
    return 2.0 * len(st.get("connections", [])) + named + legged + 0.5 * tcs - 2.0 * (len(pts) - legged)


def run_schematic(pdf: str, cfg: dict):
    """The schematic extractor (45-degree ladders, all lines drawn alike, e.g. Waltair RYD/CYD) in its own process."""
    import subprocess
    import tempfile
    here = os.path.dirname(os.path.abspath(__file__))
    script = os.path.join(here, "..", "sipx_schematic", "run.py")
    if not os.path.exists(script):
        return None
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "s.json")
        args = [sys.executable, script, pdf, "--out", out, "--code", cfg.get("code") or "STN"]
        if cfg.get("name"):
            args += ["--name", cfg["name"]]
        if cfg.get("schematicConfig"):
            args += ["--config", cfg["schematicConfig"]]
        p = subprocess.run(args, capture_output=True, text=True)
        if p.returncode != 0 or not os.path.exists(out):
            return None
        return json.load(open(out))


def build_auto(pdf: str, cfg: dict):
    """Pick the reader and the engine for this sheet.

    reader:  vector with real text | vector with text drawn as strokes (OCR) | scan / picture (raster + OCR)
    engine:  'cad'  - yard drawn along the sheet, symbols to the Indian Railways SIP standard (Jarati, Gonpura, Armori)
             'schematic' - plain schematic with 45-degree ladders (Waltair RYD/CYD)
    With engine 'auto' both are tried when the first result looks thin, and the richer one is kept."""
    engine = cfg.get("engine", "auto")
    st = report = ctx = None
    if engine in ("auto", "cad"):
        try:
            st, report, ctx = build(pdf, cfg)
        except SystemExit as e:
            if engine == "cad":
                raise
            report = {"cadEngine": str(e)}
    used = "cad" if st else None
    cad_score = score(st) if st else 0.0
    if engine == "schematic" or (engine == "auto" and (st is None or len(st["connections"]) == 0 or not st["assets"]["signals"])):
        source = ctx["page"].source if ctx else "vector"
        if source == "vector":
            alt = run_schematic(pdf, cfg)
            if alt is not None and (st is None or score(alt) > score(st)):
                prev = report or {}
                st, used = alt, "schematic"
                report = {"engine": "schematic", "cadEngineScore": round(cad_score, 1), "note": "schematic engine chosen: richer result than the CAD engine"}
                rp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "reports", f"{(cfg.get('code') or 'stn').lower()}.report.json")
                if os.path.exists(rp):
                    try:
                        report["schematicReport"] = json.load(open(rp))
                    except Exception:
                        pass
    if st is None:
        raise SystemExit("Neither engine could read a track layout from this sheet.")
    report = report or {}
    report["engine"] = used
    if ctx:
        report["reader"] = ctx["page"].source
        if ctx.get("strokeText"):
            report["strokeText"] = ctx["strokeText"]
    report.setdefault("counts", {"tracks": len(st["tracks"]), "connections": len(st["connections"]),
                                 **{k: len(v) for k, v in st.get("assets", {}).items() if isinstance(v, list)}})
    return st, report, ctx


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--out", required=True)
    ap.add_argument("--config", help="optional JSON: code, name, ends, tuning and hand corrections")
    ap.add_argument("--code")
    ap.add_argument("--name")
    ap.add_argument("--engine", choices=["auto", "cad", "schematic"], help="default auto")
    ap.add_argument("--raster", action="store_true", help="treat the sheet as a scan even if it has line work")
    ap.add_argument("--dpi", type=float, help="resolution for reading a scan (default 220)")
    a = ap.parse_args(argv)
    cfg = json.load(open(a.config)) if a.config else {}
    if a.code:
        cfg["code"] = a.code
    if a.name:
        cfg["name"] = a.name
    if a.engine:
        cfg["engine"] = a.engine
    if a.raster:
        cfg["raster"] = True
    if a.dpi:
        cfg["dpi"] = a.dpi
    st, report, _ = build_auto(a.pdf, cfg)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    json.dump(st, open(a.out, "w"), indent=1)
    rdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "reports")
    os.makedirs(rdir, exist_ok=True)
    rpath = os.path.join(rdir, f"{st['meta']['code'].lower()}.report.json")
    json.dump(report, open(rpath, "w"), indent=1)
    c = report["counts"]
    print(f"{st['meta']['code']} ({st['meta']['name']}) [{report.get('reader', 'vector')} sheet, {report['engine']} engine]: "
          f"{c['tracks']} lines, {c['connections']} links, {c.get('signals', 0)} signals, {c.get('points', 0)} points, "
          f"{c.get('trackCircuits', 0)} track circuits, {c.get('joints', 0)} joints -> {a.out}")
    todo = {k: v for k, v in report.items() if isinstance(v, list)}
    print(f"report: {os.path.normpath(rpath)}" + (f"  ({', '.join(f'{k}: {len(v)}' for k, v in todo.items())})" if todo else "  (nothing flagged)"))


if __name__ == "__main__":
    main()
