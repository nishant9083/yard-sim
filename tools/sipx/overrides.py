"""Hand corrections kept in the station config, so they survive re-running the extractor."""
from __future__ import annotations

from net import Net


def apply_overrides(st: dict, cfg: dict, origin) -> None:
    ov = cfg.get("overrides", {})
    if not ov:
        return
    ox, oy = origin
    net = Net(st)
    for item in ov.get("tracksAt", []):          # {"at": [sheetX, sheetY], "set": {...}}
        nr = net.nearest((item["at"][0] - ox, item["at"][1] - oy), tracks_only=True)
        if nr:
            next(t for t in st["tracks"] if t["id"] == nr[2]).update(item["set"])
    for tid, patch in ov.get("tracks", {}).items():
        for t in st["tracks"]:
            if t["id"] == tid:
                t.update(patch)
    for kind in ("signals", "points", "trackCircuits", "platforms", "bridges"):
        key = "number" if kind == "bridges" else "name" if kind == "platforms" else "code"
        for code, patch in ov.get(kind, {}).items():
            for it in st["assets"].get(kind, []):
                if it.get(key) == code:
                    it.update(patch)
        drop = set(ov.get("drop", {}).get(kind, []))
        if drop:
            st["assets"][kind] = [it for it in st["assets"][kind] if it.get(key) not in drop]
    for kind, items in ov.get("add", {}).items():
        st["assets"].setdefault(kind, []).extend(items)
    for section in ("meta",):
        st[section].update(ov.get(section, {}))
