"""Pictures of intermediate results, for eyeballing against the PDF."""
import colorsys

from PIL import Image, ImageDraw


def plot_lines(lines, page, out, crop, scale=2.0, marks=None):
    x0, y0, x1, y1 = crop
    im = Image.new("RGB", (int((x1 - x0) * scale), int((y1 - y0) * scale)), "white")
    d = ImageDraw.Draw(im)
    for i, ln in enumerate(lines):
        r, g, b = colorsys.hsv_to_rgb((i * 0.618) % 1, 0.85, 0.75)
        d.line([((x - x0) * scale, (y - y0) * scale) for x, y in ln.pts], fill=(int(r * 255), int(g * 255), int(b * 255)), width=3 if ln.thick else 2)
        for p in (ln.pts[0], ln.pts[-1]):
            d.ellipse([(p[0] - x0) * scale - 3, (p[1] - y0) * scale - 3, (p[0] - x0) * scale + 3, (p[1] - y0) * scale + 3], outline="black")
    for (x, y, c) in marks or []:
        d.rectangle([(x - x0) * scale - 3, (y - y0) * scale - 3, (x - x0) * scale + 3, (y - y0) * scale + 3], outline=c)
    im.save(out)
