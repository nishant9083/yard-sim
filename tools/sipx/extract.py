"""Shared front half of the pipeline: sheet -> rails -> skeleton."""
from __future__ import annotations

import network as N
import pdfio
import tracks as T


def needs_stroke_text(page) -> bool:
    """Little real text but many letter-sized strokes: the captions are drawn as lines."""
    return len(page.small_paths) > 2000 and len(page.words) < 0.05 * len(page.small_paths)


def read_any(pdf: str, cfg: dict):
    """Vector sheet -> pdfio; a scan or a picture -> raster reader."""
    if pdf.lower().endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff")):
        import raster
        return raster.read_raster(pdf, dpi=cfg.get("dpi", 220))
    import pymupdf
    pg = pymupdf.open(pdf)[cfg.get("page", 0)]
    if cfg.get("raster") is True or (cfg.get("raster", "auto") == "auto" and _is_scan(pg)):
        import raster
        return raster.read_raster(pdf, cfg.get("page", 0), dpi=cfg.get("dpi", 220))
    return pdfio.read_page(pdf, cfg.get("page", 0))


def _is_scan(pg) -> bool:
    import raster
    return raster.image_page(pg)


def skeleton(pdf: str, cfg: dict, page=None):
    page = page or read_any(pdf, cfg)
    text_info = None
    if cfg.get("strokeText", "auto") is True or (cfg.get("strokeText", "auto") == "auto" and needs_stroke_text(page)):
        import stroketext
        text_info = stroketext.apply(page)
    tp = dict(cfg.get("tracks", {}))
    if page.source == "raster":
        tp.setdefault("merge_min_len", 4.0)       # a scanned rail comes in pieces between joints and crossings
    P = T.Params(**tp)
    lines, small, ticks, loops, outlines = T.find_lines(page, P)
    lines = T._merge_collinear(lines, P)
    rails = T.select_rails(page, lines, small, P)
    if not rails:
        raise SystemExit("No rails found: no line on this sheet carries a track-circuit caption (e.g. 3T, 31/33T).")
    xs = [q[0] for l in rails for q in l.pts]
    ys = [q[1] for l in rails for q in l.pts]
    origin = (min(xs) - 40.0, min(ys) - 40.0)
    st = N.build(rails, P, origin)
    ctx = {"strokeText": text_info, "page": page, "P": P, "lines": lines, "small": small, "ticks": ticks, "loops": loops + outlines, "rails": rails, "origin": origin}
    return st, ctx
