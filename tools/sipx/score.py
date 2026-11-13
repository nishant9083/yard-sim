"""Compare an extracted station with a hand-checked one (same sheet) and print where they differ.

    python3 tools/sipx/score.py extracted.json reference.json
"""
from __future__ import annotations

import json
import re
import statistics
import sys


def norm(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", code.upper())


def main(a_path: str, g_path: str) -> int:
    a, g = json.load(open(a_path)), json.load(open(g_path))
    aa, ga = a["assets"], g["assets"]
    lineno = lambda st: {t["id"]: t.get("lineNo") for t in st["tracks"]}   # noqa: E731
    al, gl = lineno(a), lineno(g)

    # the two files use different origins: estimate the x shift from signals with the same code
    gs = {norm(s["code"]): s for s in ga["signals"]}
    as_ = {norm(s["code"]): s for s in aa["signals"]}
    common = sorted(set(gs) & set(as_))
    dx = statistics.median(as_[c]["footX"] - gs[c]["footX"] for c in common) if common else 0.0
    print(f"signals: reference {len(gs)}, extracted {len(as_)}, same code {len(common)}; x shift {dx:.1f}")
    bad = 0
    for c in sorted(set(gs) | set(as_)):
        if c not in as_:
            print(f"  MISSING  {gs[c]['code']}")
            bad += 1
            continue
        if c not in gs:
            print(f"  EXTRA    {as_[c]['code']}")
            bad += 1
            continue
        s, r = as_[c], gs[c]
        diffs = []
        if abs(s["footX"] - dx - r["footX"]) > 4:
            diffs.append(f"foot {s['footX'] - dx:.0f} vs {r['footX']:.0f}")
        for k in ("side", "headDir", "direction", "kind"):
            if s[k] != r[k]:
                diffs.append(f"{k} {s[k]} vs {r[k]}")
        if al.get(s["trackId"]) != gl.get(r["trackId"]) and gl.get(r["trackId"]) is not None:
            diffs.append(f"line {al.get(s['trackId'])} vs {gl.get(r['trackId'])}")
        e1 = [e.get("style") or e.get("text") or e["kind"] for e in s["elements"]]
        e2 = [e.get("style") or e.get("text") or e["kind"] for e in r["elements"]]
        if [norm(x) for x in e1] != [norm(x) for x in e2]:
            diffs.append(f"head {e1} vs {e2}")
        if diffs:
            bad += 1
            print(f"  DIFF     {r['code']}: " + "; ".join(diffs))
    print(f"  -> {len(common) - sum(1 for _ in [])} compared, {bad} with differences")

    gp = {norm(p["code"]): p for p in ga["points"]}
    ap = {norm(p["code"]): p for p in aa["points"]}
    print(f"points: reference {len(gp)}, extracted {len(ap)}, same code {len(set(gp) & set(ap))}")
    for c in sorted(set(gp) | set(ap)):
        if c not in ap:
            print(f"  MISSING  {gp[c]['code']}")
        elif c not in gp:
            print(f"  EXTRA    {ap[c]['code']}")
        else:
            p, r = ap[c], gp[c]
            d = []
            if not r["ratioInferred"] and (p["ratio"] != r["ratio"] or norm(p["switch"]) != norm(r["switch"])):
                d.append(f"angle '{p['ratio']} {p['switch']}' vs '{r['ratio']} {r['switch']}'")
            if p.get("crankHandle") != r.get("crankHandle"):
                d.append(f"crank {p.get('crankHandle')} vs {r.get('crankHandle')}")
            if d:
                print(f"  DIFF     {r['code']}: " + "; ".join(d))

    gt = {norm(t["code"]): t for t in ga["trackCircuits"]}
    at = {norm(t["code"]): t for t in aa["trackCircuits"]}
    print(f"track circuits: reference {len(gt)}, extracted {len(at)}, same code {len(set(gt) & set(at))}")

    def extent(tc, lines, shift):
        out = {}
        for s in tc["spans"]:
            if "trackId" in s:
                out[lines.get(s["trackId"], s["trackId"])] = (s["x0"] - shift, s["x1"] - shift)
        return out
    for c in sorted(set(gt) | set(at)):
        if c not in at:
            print(f"  MISSING  {gt[c]['code']}")
        elif c not in gt:
            print(f"  EXTRA    {at[c]['code']}")
        else:
            e1, e2 = extent(at[c], al, dx), extent(gt[c], gl, 0)
            d = []
            for ln in set(e1) | set(e2):
                if ln not in e1 or ln not in e2:
                    if ln is not None and isinstance(ln, int):
                        d.append(f"line {ln} only in {'extracted' if ln in e1 else 'reference'}")
                    continue
                if abs(e1[ln][0] - e2[ln][0]) > 12 or abs(e1[ln][1] - e2[ln][1]) > 12:
                    d.append(f"line {ln}: {e1[ln][0]:.0f}..{e1[ln][1]:.0f} vs {e2[ln][0]:.0f}..{e2[ln][1]:.0f}")
            if d:
                print(f"  DIFF     {gt[c]['code']}{' (reference marked approximate)' if gt[c].get('approx') else ''}: " + "; ".join(d))

    gj = sorted((gl.get(j["trackId"]), j["x"]) for j in ga["joints"] if gl.get(j["trackId"]) is not None)
    aj = sorted((al.get(j["trackId"]), j["x"] - dx) for j in aa["joints"] if al.get(j["trackId"]) is not None)
    hit = sum(1 for ln, x in gj if any(l2 == ln and abs(x2 - x) <= 4 for l2, x2 in aj))
    print(f"joints on numbered lines: reference {len(gj)}, extracted {len(aj)}, matched {hit}")
    for k in ("platforms", "bridges", "chainageMarks", "gradients", "dimensions", "routeLabels", "structures"):
        print(f"{k}: reference {len(ga.get(k, []))}, extracted {len(aa.get(k, []))}")
    gb = {b["number"]: b for b in ga["bridges"]}
    for b in aa["bridges"]:
        r = gb.get(b["number"])
        if r and (abs(b["chainage"] - r["chainage"]) > 0.5 or abs(b["x"] - dx - r["x"]) > 6):
            print(f"  DIFF     bridge {b['number']}: ch {b['chainage']} vs {r['chainage']}, x {b['x'] - dx:.0f} vs {r['x']:.0f}")
    if a["meta"].get("chainage") and g["meta"].get("chainage"):
        ca, cg = a["meta"]["chainage"], g["meta"]["chainage"]
        print(f"chainage scale: origin {ca['originX'] - dx:.1f} vs {cg['originX']:.1f}; m/pt {ca['metresPerUnit']} vs {cg['metresPerUnit']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
