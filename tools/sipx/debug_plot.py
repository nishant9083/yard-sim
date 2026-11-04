"""Draw the extracted graph over a white page so the result can be eyeballed."""
import sys, colorsys
from PIL import Image, ImageDraw


def plot(g, page, out, scale=3.0, crop=None, extra=None):
    W, H = int(page.width * scale), int(page.height * scale)
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    for i, e in enumerate(g.edges):
        r, gg, b = colorsys.hsv_to_rgb((i * 0.618) % 1, 0.8, 0.8)
        col = (int(r * 255), int(gg * 255), int(b * 255))
        d.line([(x * scale, y * scale) for x, y in e.pts], fill=col, width=2)
    deg = {}
    for e in g.edges:
        deg[e.a] = deg.get(e.a, 0) + 1
        deg[e.b] = deg.get(e.b, 0) + 1
    for v, n in deg.items():
        x, y = g.verts[v]
        c = {1: "blue", 2: "gray", 3: "red", 4: "green"}.get(n, "black")
        d.ellipse([x * scale - 2.5, y * scale - 2.5, x * scale + 2.5, y * scale + 2.5], outline=c)
    if extra:
        extra(d, scale)
    if crop:
        im = im.crop(tuple(int(c * scale) for c in crop))
    im.save(out)
