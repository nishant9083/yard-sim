"""Draw what was extracted on top of the sheet itself, for checking by eye.

    python3 tools/sipx/overlay.py plan.pdf out_dir [--config cfg.json] [--tiles 4]

Writes out_dir/overlay_1.png ... (the yard cut into tiles).  Rails: tracks blue, connections green.
Orange ticks: insulated joints.  Red: signal foot + code.  Magenta: point number at its junction.
Cyan bar under a caption: the extent of that track circuit.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pymupdf                      # noqa: E402
from PIL import Image, ImageDraw    # noqa: E402

from net import Net                 # noqa: E402
from run import build               # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out_dir")
    ap.add_argument("--config")
    ap.add_argument("--tiles", type=int, default=4)
    ap.add_argument("--scale", type=float, default=2.0)
    a = ap.parse_args(argv)
    cfg = json.load(open(a.config)) if a.config else {}
    st, report, ctx = build(a.pdf, cfg)
    ox, oy = ctx["origin"]
    net = Net(st)
    xs = [n["x"] + ox for n in st["nodes"]]
    ys = [n["y"] + oy for n in st["nodes"]]
    x0, x1, y0, y1 = min(xs) - 30, max(xs) + 30, min(ys) - 90, max(ys) + 90
    pg = pymupdf.open(a.pdf)[0]
    os.makedirs(a.out_dir, exist_ok=True)
    w = (x1 - x0) / a.tiles
    z = a.scale
    for k in range(a.tiles):
        cx0, cx1 = x0 + k * w - 15, x0 + (k + 1) * w + 15
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(z, z) * pg.derotation_matrix if False else pymupdf.Matrix(z, z), clip=pymupdf.Rect(cx0, y0, cx1, y1))
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("RGBA")
        ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        S = lambda p: ((p[0] + ox - cx0) * z, (p[1] + oy - y0) * z)   # noqa: E731
        for tid, pts in net.tracks.items():
            d.line([S(p) for p in pts], fill=(30, 90, 255, 150), width=5)
        for cid, pts in net.conns.items():
            d.line([S(p) for p in pts], fill=(0, 170, 60, 170), width=5)
        for n in st["nodes"]:
            if n["kind"] != "plain":
                px, py = S((n["x"], n["y"]))
                col = {"junction": (255, 0, 255, 255), "boundary": (0, 0, 0, 255), "bufferStop": (200, 0, 0, 255), "sandHump": (200, 140, 0, 255)}.get(n["kind"], (120, 120, 255, 200))
                d.ellipse([px - 5, py - 5, px + 5, py + 5], outline=col, width=2)
        for j in st["assets"]["joints"]:
            y = net.track_y(j["trackId"], j["x"])
            if y is not None:
                px, py = S((j["x"], y))
                d.line([px, py - 14, px, py + 14], fill=(255, 140, 0, 255), width=3)
        for j in st["assets"].get("connectionJoints", []):
            px, py = S((j["x"], j["y"]))
            d.line([px, py - 14, px, py + 14], fill=(255, 140, 0, 255), width=3)
        for i, tc in enumerate(st["assets"]["trackCircuits"]):
            for sp in tc["spans"]:
                if "trackId" in sp:
                    ya = net.track_y(sp["trackId"], sp["x0"] + 0.01) or net.track_y(sp["trackId"], sp["x1"] - 0.01)
                    yb = net.track_y(sp["trackId"], sp["x1"] - 0.01) or ya
                    if ya is None:
                        continue
                    off = 5 + 4 * (i % 2)
                    a_, b_ = S((sp["x0"] + 1.5, ya)), S((sp["x1"] - 1.5, yb))
                    d.line([a_[0], a_[1] + off, b_[0], b_[1] + off], fill=(0, 190, 210, 230), width=3)
                    d.text(((a_[0] + b_[0]) / 2 - 12, (a_[1] + b_[1]) / 2 + off + 2), tc["code"] + ("~" if tc["approx"] else ""), fill=(0, 120, 140, 255))
        for s in st["assets"]["signals"]:
            y = net.track_y(s["trackId"], s["footX"])
            if y is None:
                continue
            px, py = S((s["footX"], y))
            d.ellipse([px - 6, py - 6, px + 6, py + 6], fill=(255, 0, 0, 200))
            head = " ".join((e.get("style") or e.get("text") or e["kind"])[:5] for e in s["elements"])
            d.text((px + 8, py + (-30 if s["side"] == "above" else 18)), f"{s['code']} [{s['kind']} {s['direction']} {s['headDir'][0]}] {head}", fill=(200, 0, 0, 255))
        nd = {n["id"]: n for n in st["nodes"]}
        for p in st["assets"]["points"]:
            n = nd[p["nodeId"]]
            px, py = S((n["x"], n["y"]))
            d.text((px - 10, py + 8), f"{p['code']} {p['ratio']} {p['switch']}{'*' if p['ratioInferred'] else ''} {p.get('crankHandle', '')}", fill=(190, 0, 190, 255))
        out = Image.alpha_composite(im, ov).convert("RGB")
        out.save(os.path.join(a.out_dir, f"overlay_{k + 1}.png"))
    print(f"wrote {a.tiles} tiles to {a.out_dir}")


if __name__ == "__main__":
    main()
