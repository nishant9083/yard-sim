"""Turn a scanned or image-only SIP into the same primitives the vector reader gives (pdfio.Page).

    image -> ink mask -> text by OCR (level and upright) -> text removed from the ink
          -> thin strokes: skeleton traced into polylines (width measured on the way)
          -> solid blobs: arrow heads (triangles), dots, small boxes
          -> round closed strokes: circles (lamps)

Coordinates are converted back to PDF points, so everything downstream is shared with vector sheets.
Accuracy depends on the scan: 200 dpi or better and a clean, straight scan give usable results.
"""
from __future__ import annotations

import math

import numpy as np
import pymupdf

from pdfio import Box, Circle, Page, Seg, Tri, Word

DEBUG: dict = {}

try:
    import cv2
except ImportError:          # pragma: no cover
    cv2 = None


def image_page(pg) -> bool:
    """True when the page is essentially one picture (a scan), not drawn line work."""
    try:
        imgs = pg.get_image_info()
    except Exception:
        imgs = []
    area = pg.rect.width * pg.rect.height
    covered = sum(abs((i["bbox"][2] - i["bbox"][0]) * (i["bbox"][3] - i["bbox"][1])) for i in imgs)
    return covered > 0.5 * area and len(pg.get_drawings()) < 400


def _zoom_for(pg, target_dpi: float, max_px: float = 7.0e7) -> float:
    z = target_dpi / 72.0
    try:
        for i in pg.get_image_info():
            bw = abs(i["bbox"][2] - i["bbox"][0])
            if bw > 0.5 * pg.rect.width and i.get("width"):
                z = min(z, i["width"] / bw)           # never invent more pixels than the scan has
    except Exception:
        pass
    area = pg.rect.width * pg.rect.height
    return max(1.2, min(z, math.sqrt(max_px / area)))


# --------------------------------------------------------------------------- OCR

def _ocr_tiles(gray: np.ndarray, zoom: float, rotate: bool, tile=3200, overlap=240, min_conf=55):
    """Words of one orientation. rotate=True reads text that runs up the sheet."""
    import pytesseract
    from PIL import Image
    H, W = gray.shape
    out = []
    for y0 in range(0, H, tile - overlap):
        for x0 in range(0, W, tile - overlap):
            sub = gray[y0:y0 + tile, x0:x0 + tile]
            if sub.size == 0 or sub.min() > 200:
                continue
            img = np.ascontiguousarray(np.rot90(sub, -1)) if rotate else sub     # rot90(-1): clockwise, so upward text reads level
            d = pytesseract.image_to_data(Image.fromarray(img), config="--psm 11", output_type=pytesseract.Output.DICT)
            lines: dict[tuple, list] = {}
            for i, t in enumerate(d["text"]):
                if not t.strip() or float(d["conf"][i]) < min_conf:
                    continue
                key = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
                lines.setdefault(key, []).append(i)
            for key, ids in lines.items():
                ids.sort(key=lambda i: d["left"][i])
                text = " ".join(d["text"][i] for i in ids)
                l = min(d["left"][i] for i in ids)
                t = min(d["top"][i] for i in ids)
                r = max(d["left"][i] + d["width"][i] for i in ids)
                b = max(d["top"][i] + d["height"][i] for i in ids)
                conf = sum(float(d["conf"][i]) for i in ids) / len(ids)
                if rotate:
                    # (l,t,r,b) in the rotated tile -> original tile: x = y', y = h - x'
                    h = sub.shape[0]
                    bx0, bx1 = t, b
                    by0, by1 = h - r, h - l
                else:
                    bx0, by0, bx1, by1 = l, t, r, b
                out.append((text, (x0 + bx0) / zoom, (y0 + by0) / zoom, (x0 + bx1) / zoom, (y0 + by1) / zoom, conf, (b - t) / zoom))
    # the same line read in two overlapping tiles: keep the better one
    out.sort(key=lambda o: -o[5])
    kept = []
    for o in out:
        if any(min(o[3], k[3]) - max(o[1], k[1]) > 0.5 * (o[3] - o[1]) and min(o[4], k[4]) - max(o[2], k[2]) > 0.5 * (o[4] - o[2]) for k in kept):
            continue
        kept.append(o)
    return kept


def _ocr_residual(gray: np.ndarray, work: np.ndarray, zoom: float, heights: list[float]):
    """Captions that the sheet-wide pass missed (usually because they touch a symbol or a line):
    take away long straight lines, find clusters of letter-sized ink, and read each cluster on its own."""
    import pytesseract
    from PIL import Image
    if not heights:
        return [], np.zeros_like(work)
    cap = sorted(heights)[len(heights) // 2] * zoom * 0.75          # letter height in pixels
    cap = max(cap, 8.0)
    long_ = int(cap * 3)
    lines = cv2.morphologyEx(work, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (long_, 1)))
    lines |= cv2.morphologyEx(work, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, long_)))
    rest = work & (1 - lines)
    n, lab, st, _ = cv2.connectedComponentsWithStats(rest, 8)
    keep = np.zeros_like(rest)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if 0.45 * cap <= max(w, h) <= 1.3 * cap and a >= 4:
            keep[y:y + h, x:x + w] |= (lab[y:y + h, x:x + w] == i).astype(np.uint8)
    from stroketext import _ocr_batch
    jobs = []
    for rot in (False, True):
        k = (int(cap * 0.7), 1) if not rot else (1, int(cap * 0.7))
        grp = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_RECT, (k[0] | 1, k[1] | 1)))
        m, lab2, st2, _ = cv2.connectedComponentsWithStats(grp, 8)
        for i in range(1, m):
            x, y, w, h, a = st2[i]
            along, across = (w, h) if not rot else (h, w)
            if along < 1.2 * cap or across > 2.2 * cap or across < 0.5 * cap:
                continue
            pad = int(cap * 0.4)
            mask = keep[max(0, y - pad): y + h + pad, max(0, x - pad): x + w + pad]
            clean = np.where(mask > 0, 0, 255).astype(np.uint8)             # only the letters, no lines
            if rot:
                clean = np.ascontiguousarray(np.rot90(clean, -1))
            sc = 40.0 / cap
            clean = cv2.resize(clean, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
            jobs.append((Image.fromarray(clean), (x, y, w, h, across, rot)))
    out = []
    for k0 in range(0, len(jobs), 40):
        chunk = jobs[k0:k0 + 40]
        res = _ocr_batch([j[0] for j in chunk], psm=6)
        for (img, (x, y, w, h, across, rot)), (text, conf) in zip(chunk, res):
            text = text.strip()
            if conf < 60 or len(text.replace(" ", "")) < 2 or not any(ch.isalnum() for ch in text):
                continue
            out.append((text, x / zoom, y / zoom, (x + w) / zoom, (y + h) / zoom, conf, across / zoom, 90.0 if rot else 0.0))
    return out, keep


# --------------------------------------------------------------------------- strokes

def _trace(skel: np.ndarray):
    """Polylines along a one-pixel skeleton (8-connected)."""
    H, W = skel.shape
    sk = skel.astype(np.uint8)
    k = np.ones((3, 3), np.float32)
    k[1, 1] = 0
    deg = cv2.filter2D(sk, cv2.CV_8U, k, borderType=cv2.BORDER_CONSTANT) * sk
    visited = np.zeros_like(sk, dtype=bool)
    nbrs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    paths = []
    node_ys, node_xs = np.nonzero((deg != 2) & (sk > 0))
    is_node = (deg != 2) & (sk > 0)

    def walk(y, x, py, px):
        pts = [(px, py), (x, y)]
        while True:
            if is_node[y, x]:
                return pts
            visited[y, x] = True
            nxt = None
            for dy, dx in nbrs:
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and sk[ny, nx] and not (ny == py and nx == px) and (is_node[ny, nx] or not visited[ny, nx]):
                    if (ny, nx) == (pts[-2][1], pts[-2][0]):
                        continue
                    nxt = (ny, nx)
                    if is_node[ny, nx]:
                        break
            if nxt is None:
                return pts
            py, px = y, x
            y, x = nxt
            pts.append((x, y))

    for y, x in zip(node_ys.tolist(), node_xs.tolist()):
        for dy, dx in nbrs:
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and sk[ny, nx] and (is_node[ny, nx] or not visited[ny, nx]):
                if is_node[ny, nx]:
                    if (ny, nx) > (y, x):
                        paths.append([(x, y), (nx, ny)])
                    continue
                paths.append(walk(ny, nx, y, x))
    # closed loops with no node on them
    rest_y, rest_x = np.nonzero(sk.astype(bool) & ~visited & ~is_node)
    for y, x in zip(rest_y.tolist(), rest_x.tolist()):
        if visited[y, x]:
            continue
        visited[y, x] = True
        pts = [(x, y)]
        py, px = y, x
        cy, cx = y, x
        while True:
            nxt = None
            for dy, dx in nbrs:
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < H and 0 <= nx < W and sk[ny, nx] and not visited[ny, nx]:
                    nxt = (ny, nx)
                    break
            if nxt is None:
                break
            cy, cx = nxt
            visited[cy, cx] = True
            pts.append((cx, cy))
        pts.append(pts[0])
        paths.append(pts)
    return paths


def _fit_circle(pts):
    a = np.array(pts, dtype=np.float64)
    x, y = a[:, 0], a[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x * x + y * y
    try:
        c, *_ = np.linalg.lstsq(A, b, rcond=None)
    except Exception:
        return None
    cx, cy = c[0], c[1]
    r = math.sqrt(max(c[2] + cx * cx + cy * cy, 0))
    err = np.abs(np.hypot(x - cx, y - cy) - r).max() if r > 0 else 1e9
    return cx, cy, r, err


def read_raster(path: str, page_no: int = 0, dpi: float = 220.0, progress=None, clip=None) -> Page:
    from skimage.morphology import skeletonize
    doc = pymupdf.open(path) if not path.lower().endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff")) else None
    if doc is not None:
        pg = doc[page_no]
        zoom = _zoom_for(pg, dpi)
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY, clip=pymupdf.Rect(clip) if clip else None)
        gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()
        page = Page(pg.rect.width, pg.rect.height)
    else:
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        zoom = dpi / 72.0
        gray = img
        page = Page(img.shape[1] / zoom, img.shape[0] / zoom)
    page.source = "raster"
    say = progress or (lambda *_: None)

    # ink: dark on light. Otsu on the whole sheet, a little biased towards keeping faint lines
    t, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ink = (gray < min(235, t + 25)).astype(np.uint8)
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, 1), np.uint8))

    say("ocr")
    words = _ocr_tiles(gray, zoom, rotate=False) + [w for w in _ocr_tiles(gray, zoom, rotate=True) if len(w[0]) >= 3]
    text_mask = np.zeros_like(ink)
    for text, x0, y0, x1, y1, conf, h in words:
        rot = 90.0 if (y1 - y0) > 1.6 * (x1 - x0) and len(text) >= 3 else 0.0
        page.words.append(Word(text, x0, y0, x1, y1, rot, h * 1.2, False))
        if conf >= 60:
            cv2.rectangle(text_mask, (int(x0 * zoom) - 1, int(y0 * zoom) - 1), (int(x1 * zoom) + 1, int(y1 * zoom) + 1), 1, -1)
    work = ink & (1 - text_mask)

    say("ocr-2")
    res, letters = _ocr_residual(gray, work, zoom, [w[6] for w in words])
    for text, x0, y0, x1, y1, conf, h, rot in res:
        page.words.append(Word(text, x0, y0, x1, y1, rot, h * 1.2, False))
        X0, Y0, X1, Y1 = int(x0 * zoom), int(y0 * zoom), int(x1 * zoom) + 1, int(y1 * zoom) + 1
        work[Y0:Y1, X0:X1] &= (1 - letters[Y0:Y1, X0:X1])          # only the letters go; a lamp beside them stays

    say("straight lines")
    # long level and upright lines straight from the ink (clean even where symbols sit on them)
    long_px = int(40 * zoom)
    straight = np.zeros_like(work)
    for horiz in (True, False):
        ker = cv2.getStructuringElement(cv2.MORPH_RECT, (long_px, 1) if horiz else (1, long_px))
        m = cv2.morphologyEx(work, cv2.MORPH_OPEN, ker)
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(m, 8)
        for i in range(1, n2):
            x, y, w, h, a = st2[i]
            across = h if horiz else w
            if across > 6 * zoom:
                continue                                   # a solid area, not a line
            if horiz:
                ys = np.nonzero(lab2[y:y + h, x:x + w] == i)[0]
                yc = y + float(ys.mean()) if len(ys) else y + h / 2
                page.segs.append(Seg(x / zoom, yc / zoom, (x + w) / zoom, yc / zoom, max(across / zoom, 0.3), False))
            else:
                xs_ = np.nonzero(lab2[y:y + h, x:x + w] == i)[1]
                xc = x + float(xs_.mean()) if len(xs_) else x + w / 2
                page.segs.append(Seg(xc / zoom, y / zoom, xc / zoom, (y + h) / zoom, max(across / zoom, 0.3), False))
        straight |= m
    work = work & (1 - cv2.dilate(straight, np.ones((3, 3), np.uint8)))

    say("blobs")
    # solid parts: what survives an opening a little wider than a drawn line
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 3)
    line_w = float(np.median(dist[dist > 0])) * 2 if np.any(dist > 0) else 2.0
    r = max(1, int(round(line_w * 0.75)))
    solid = cv2.morphologyEx(work, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
    compact = np.zeros_like(work)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        wp, hp = w / zoom, h / zoom
        if max(wp, hp) > 30 or area < 6:
            continue
        cnts, _ = cv2.findContours((lab[y:y + h, x:x + w] == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        c = max(cnts, key=cv2.contourArea)
        approx = cv2.approxPolyDP(c, 0.12 * cv2.arcLength(c, True), True)
        fill = area / max(w * h, 1)
        if max(w, h) > 3.2 * max(1, min(w, h)):
            continue                      # a piece of heavy line, not a blob: it stays line work
        mine = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
        tri_fit = 0.0
        if 3.5 <= max(wp, hp) <= 16:
            ok_, tri = cv2.minEnclosingTriangle(c)
            ta = abs(cv2.contourArea(tri)) if ok_ else 0
            tri_fit = cv2.contourArea(c) / ta if ta > 0 else 0.0
        if (len(approx) == 3 or tri_fit >= 0.8) and 3.5 <= max(wp, hp) <= 16:
            if len(approx) != 3:
                approx = tri.astype(np.int32)
            v = [((p[0][0] + x) / zoom, (p[0][1] + y) / zoom) for p in approx]
            e = [(math.hypot(v[k][0] - v[(k + 1) % 3][0], v[k][1] - v[(k + 1) % 3][1]), k) for k in range(3)]
            _, k = min(e)
            tip = v[(k + 2) % 3]
            base = ((v[k][0] + v[(k + 1) % 3][0]) / 2, (v[k][1] + v[(k + 1) % 3][1]) / 2)
            page.tris.append(Tri(tip, base, math.hypot(tip[0] - base[0], tip[1] - base[1])))
            compact[y:y + h, x:x + w] |= mine
        elif max(wp, hp) <= 7.5 and abs(wp - hp) <= 0.35 * max(wp, hp) and fill > 0.6:
            page.dots.append(Circle((x + w / 2) / zoom, (y + h / 2) / zoom, (wp + hp) / 4, True))
            compact[y:y + h, x:x + w] |= mine
        elif fill > 0.8 and min(wp, hp) >= 2.0:
            page.boxes.append(Box(x / zoom, y / zoom, (x + w) / zoom, (y + h) / zoom))
            compact[y:y + h, x:x + w] |= mine
    strokes = work & (1 - compact)

    say("circles")
    # round outlines (lamps): Hough on what is left, kept only where ink really runs round the circle
    blur = cv2.GaussianBlur((strokes * 255).astype(np.uint8), (5, 5), 1.2)
    hc = cv2.HoughCircles(blur, cv2.HOUGH_GRADIENT, dp=1.2, minDist=max(4, int(5.5 * zoom)), param1=120, param2=max(10, int(9 * zoom)),
                          minRadius=int(3.4 * zoom), maxRadius=int(8.5 * zoom))
    def coverage(cx, cy, rr, k=48):
        hits = 0
        for j in range(k):
            ang = 2 * math.pi * j / k
            px, py = int(round(cx + rr * math.cos(ang))), int(round(cy + rr * math.sin(ang)))
            if 0 <= py < strokes.shape[0] and 0 <= px < strokes.shape[1] and strokes[max(0, py - 1):py + 2, max(0, px - 1):px + 2].any():
                hits += 1
        return hits / k
    if hc is not None:
        for cx0, cy0, _ in hc[0]:
            best = None
            # Hough places the centre well but the radius loosely: search both a little
            for dx in (-1.5, 0, 1.5):
                for dy in (-1.5, 0, 1.5):
                    for rr in np.arange(3.4 * zoom, 8.5 * zoom, 0.5):
                        c = coverage(cx0 + dx, cy0 + dy, rr, 32)
                        if best is None or c > best[0] + 1e-6 or (abs(c - best[0]) < 1e-6 and rr < best[3]):
                            best = (c, cx0 + dx, cy0 + dy, rr)
            if best and best[0] >= 0.9 and coverage(best[1], best[2], best[3]) >= 0.85:
                cx, cy, rr = best[1], best[2], best[3]
                if not any(abs(c.cx - cx / zoom) < 2.0 and abs(c.cy - cy / zoom) < 2.0 for c in page.circles):
                    page.circles.append(Circle(cx / zoom, cy / zoom, rr / zoom, False))
    say("strokes")
    DEBUG.update(ink=ink, work=work, compact=compact, strokes=strokes, text_mask=text_mask)
    skel = skeletonize(strokes.astype(bool))
    paths = _trace(skel)
    for pts in paths:
        if len(pts) < 2:
            continue
        L = sum(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) for a_, b_ in zip(pts, pts[1:]))
        if L < 2.5:
            continue                                 # skeleton whisker
        closed = len(pts) > 8 and pts[0] == pts[-1]
        if closed:
            fc = _fit_circle(pts)
            if fc and fc[2] / zoom >= 1.6 and fc[3] <= max(1.6, 0.18 * fc[2]):
                if not any(abs(c.cx - fc[0] / zoom) < 1.0 and abs(c.cy - fc[1] / zoom) < 1.0 for c in page.circles):
                    page.circles.append(Circle(fc[0] / zoom, fc[1] / zoom, fc[2] / zoom, False))
                continue
        # one width for the whole stroke (the median along it), so a heavy line is heavy all along
        ws = [2.0 * float(dist[min(y, dist.shape[0] - 1), min(x, dist.shape[1] - 1)]) for x, y in pts[1:-1:3] or pts]
        wpt = (sorted(ws)[len(ws) // 2] if ws else line_w) / zoom
        arr = np.array(pts, dtype=np.int32).reshape(-1, 1, 2)
        simp = cv2.approxPolyDP(arr, 1.2, closed).reshape(-1, 2).tolist()
        if closed:
            simp.append(simp[0])
        thick = wpt >= 1.25 and (L / zoom) <= 10            # only short heavy strokes matter (joint ticks)
        for a_, b_ in zip(simp, simp[1:]):
            if a_ == b_:
                continue
            page.segs.append(Seg(a_[0] / zoom, a_[1] / zoom, b_[0] / zoom, b_[1] / zoom, max(wpt, 0.3), thick))
        if closed and len(simp) == 5:
            xs = [p[0] for p in simp]
            ys = [p[1] for p in simp]
            if len({round(v / 2) for v in xs}) <= 3 and len({round(v / 2) for v in ys}) <= 3:
                page.rects.append((min(xs) / zoom, min(ys) / zoom, max(xs) / zoom, max(ys) / zoom))
    if clip:
        _shift(page, clip[0], clip[1])
    say("done")
    return page


def _shift(page: Page, dx: float, dy: float) -> None:
    for s in page.segs:
        s.x0 += dx; s.x1 += dx; s.y0 += dy; s.y1 += dy
    for c in page.circles + page.dots:
        c.cx += dx; c.cy += dy
    for t in page.tris:
        t.tip = (t.tip[0] + dx, t.tip[1] + dy); t.base = (t.base[0] + dx, t.base[1] + dy)
    for b in page.boxes:
        b.x0 += dx; b.x1 += dx; b.y0 += dy; b.y1 += dy
    for w in page.words:
        w.x0 += dx; w.x1 += dx; w.y0 += dy; w.y1 += dy
    page.rects = [(r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy) for r in page.rects]
