"""
Generator for src/sip/data/jrt.json  (Jarati, SIP.ECoR.WAT.JRT.03).

Every number below was read from the SIP PDF (pt coordinates of the drawing page).
The viewer never reads this file; it only reads the generated JSON. Keep this
script as the audit trail from "what the PDF shows" to "what the JSON says".

Run:  python3 tools/jrt/gen_jrt.py
"""
import json
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "sip", "data", "jrt_new.json")

X0, Y0 = 350.0, 630.0            # shift PDF pts so the yard sits near the origin
CSB_X = 3418.5                   # x of the station-building centre line in the PDF
M_PER_PT = 0.35278               # 1 pt = 0.35278 mm on paper; 1:1000 horizontal => 0.35278 m


def P(x, y):
    return [round(x - X0, 2), round(y - Y0, 2)]


def XY(x, y):
    px, py = P(x, y)
    return {"x": px, "y": py}


def ch_to_x(ch, side):
    """Chainage (m, F/CSB) to PDF x. side: 'W' (KTV) or 'E' (KRDL)."""
    d = ch / M_PER_PT
    return CSB_X - d if side == "W" else CSB_X + d


# ---------------------------------------------------------------- track levels
Y4, Y3, Y2, Y1, YH = 638.0, 673.6, 700.4, 727.2, 753.9
LEVEL = {"L4": Y4, "L3": Y3, "L2": Y2, "L1": Y1, "TM": Y1, "HAS": YH, "L1X": 741.4}

# ---------------------------------------------------------------- nodes
N = {}


def node(i, x, y, kind, label=None):
    px, py = P(x, y)
    d = {"id": i, "x": px, "y": py, "kind": kind}
    if label:
        d["label"] = label
    N[i] = d


node("W_L3", 357.8, 663.5, "boundary", "KTV end")
node("W_J1", 609.0, 663.5, "plain")
node("W_J2", 629.0, Y3, "plain")
node("W_L2", 357.8, Y2, "boundary", "KTV end")
node("E_L2", 6822.5, Y2, "boundary", "KRDL end")

node("J31A", 1959.0, Y3, "junction")
node("J33A", 2058.8, Y3, "junction")
node("J40A", 4739.4, Y3, "junction")
node("J34B", 4757.8, Y3, "junction")

node("J31B", 2140.9, Y2, "junction")
node("J35A", 2159.4, Y2, "junction")
node("J38A", 4802.6, Y2, "junction")
node("J34A", 5020.6, Y2, "junction")

node("J33B", 2281.4, Y4, "junction")
node("J40B", 4428.7, Y4, "junction")
node("B_L4", 4768.8, Y4, "bufferStop", "L4 end")

node("J35C", 2407.4, Y1, "junction")
node("J35B", 2419.8, Y1, "junction")
node("J37A", 2464.4, Y1, "junction")
node("J39B", 2935.1, Y1, "junction")
node("J38B", 4545.7, Y1, "junction")
node("J36", 4885.9, Y1, "junction")
node("B_TM", 5736.2, Y1, "bufferStop", "TM siding end")

node("J37B", 2637.7, YH, "junction")
node("J39A", 2767.3, YH, "junction")

node("B_L1X", 2017.2, 741.4, "bufferStop", "L1 overrun end")
node("J35O", 2209.4, 741.4, "junction")

node("X1", 4807.3, 670.2, "plain")
node("X2", 4856.6, 664.4, "plain")
node("X3", 4905.7, 656.6, "plain")
node("B_L3X", 4954.3, 646.6, "bufferStop", "overrun end")

node("S36a", 4878.7, 728.7, "plain")
node("S36b", 4872.4, 732.7, "plain")
node("B_S36", 4867.9, 738.5, "bufferStop", "36 leg end")


def track(i, name, line_no, kind, direction, ids, remarks=None):
    d = {"id": i, "name": name, "kind": kind, "direction": direction, "nodeIds": ids}
    if line_no:
        d["lineNo"] = line_no
    if remarks:
        d["remarks"] = remarks
    return d


tracks = [
    track("L4", "UP LOOP LINE", 4, "loop", "UP", ["J33B", "J40B", "B_L4"],
          "CSL-749M (STR TO SS). 1 IN 243 grade CH:481.23M (KTV) to CH:474.82M (KRDL), 956.05M."),
    track("L3", "UP MAIN LINE", 3, "main", "UP", ["W_L3", "W_J1", "W_J2", "J31A", "J33A", "J40A", "J34B"],
          "CSL-753M (STR TO SS). 1 IN 243 grade CH:567M to CH:613.60M, 1180.60M."),
    track("L2", "DN MAIN LINE", 2, "main", "DN", ["W_L2", "J31B", "J35A", "J38A", "J34A", "E_L2"],
          "CSL-759M (STR TO SS). 1 IN 243 grade CH:567M to CH:613.60M, 1180.60M."),
    track("L1", "COMMON LOOP LINE", 1, "loop", "BOTH", ["J35C", "J35B", "J37A", "J39B", "J38B", "J36"],
          "CSL-733M (STR TO STR). 1 IN 243 grade CH:495.89M to CH:613.60M, 1109.49M."),
    track("TM", "LONG TM SIDING LINE", None, "siding", "BOTH", ["J36", "B_TM"],
          "280M (SH TO SS) long TM siding. Flanked by 300M rail-level platforms."),
    track("HAS", "HOT AXLE SIDING", None, "siding", "BOTH", ["J37B", "J39A"],
          "Points 37A/B and 39A/B. 1 IN 243 grade CH:338.20M to CH:172.13M, 166.07M towards KTV."),
    track("L1X", "L1 OVERRUN LINE", None, "overrun", "BOTH", ["B_L1X", "J35O"],
          "141.98M over run line (no stabling)."),
    track("L3X", "L3 OVERRUN LINE", None, "overrun", "BOTH", ["J34B", "X1", "X2", "X3", "B_L3X"],
          "Over run line beyond 34B (printed: 120M over run line, no stabling)."),
    track("T36", "POINT 36 LEG", None, "siding", "BOTH", ["J36", "S36a", "S36b", "B_S36"],
          "Short curved leg of point 36 that ends in the open. Its purpose is not stated in the SIP."),
]


def bez(p0, p1, p2, p3, n=7):
    out = []
    for k in range(1, n):
        t = k / n
        u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def snap(pts, a, b):
    """Shift the interior points so the polyline meets node a and node b exactly."""
    x0, y0 = pts[0]
    x1, y1 = pts[-1]
    ax, ay = N[a]["x"] + X0, N[a]["y"] + Y0
    bx, by = N[b]["x"] + X0, N[b]["y"] + Y0
    d0 = (ax - x0, ay - y0)
    d1 = (bx - x1, by - y1)
    out = []
    for (x, y) in pts[1:-1]:
        t = 0 if x1 == x0 else (x - x0) / (x1 - x0)
        out.append((x + d0[0] * (1 - t) + d1[0] * t, y + d0[1] * (1 - t) + d1[1] * t))
    return out


def conn(i, kind, a, b, label, pts):
    via = snap(pts, a, b)
    # keep ~1 point in 2 on long polylines
    return {"id": i, "kind": kind, "from": a, "to": b, "label": label,
            "via": [XY(x, y) for (x, y) in via]}


C31 = [(1959.0, 677.2), (1978.0, 678.6), (1996.8, 680.4), (2015.5, 682.5), (2034.2, 685.3), (2053.0, 688.3),
       (2074.9, 691.2), (2096.9, 693.6), (2118.8, 695.5), (2140.9, 696.9)]
C33 = [(2058.8, 670.2), (2074.7, 669.4), (2090.6, 668.2), (2106.4, 666.6), (2122.2, 664.5), (2137.9, 662.0),
       (2153.5, 659.0), (2169.0, 655.6), (2187.6, 652.3), (2206.3, 649.3), (2225.0, 646.8), (2243.8, 644.6),
       (2262.6, 642.9), (2281.4, 641.5)]
C35 = [(2159.4, 704.0), (2182.0, 704.6), (2204.5, 705.6), (2227.1, 707.0), (2249.6, 708.9), (2272.1, 711.2),
       (2294.5, 714.0), (2315.3, 716.6), (2336.2, 718.8), (2357.0, 720.7), (2377.9, 722.0), (2398.8, 723.1),
       (2419.8, 723.7)]
C35O = [(2209.4, 741.4), (2242.6, 740.4), (2275.6, 738.8), (2308.7, 736.8), (2341.7, 734.1), (2374.6, 730.9),
        (2407.4, 727.2)]
C37 = ([(2464.4, 730.7)] + bez((2464.4, 730.7), (2490.3, 731.1), (2516.1, 734.4), (2541.2, 740.6), 5)
       + [(2541.2, 740.6), (2554.7, 743.7), (2568.4, 746.2), (2582.2, 748.2), (2596.0, 749.7), (2609.9, 750.6),
          (2623.8, 750.9), (2637.7, 750.8)])
C39 = ([(2767.3, 750.8), (2780.6, 751.3), (2794.1, 751.2), (2807.4, 750.6), (2820.7, 749.4), (2833.9, 747.8),
        (2847.1, 745.5), (2860.2, 742.9)]
       + bez((2860.3, 742.8), (2884.9, 736.8), (2909.9, 732.7), (2935.1, 730.7), 5) + [(2935.1, 730.7)])
C40 = [(4428.7, 641.5), (4453.3, 642.3), (4477.8, 643.6), (4502.3, 645.4), (4526.8, 647.6), (4551.1, 650.2),
       (4575.5, 653.2), (4599.8, 656.8), (4623.0, 660.1), (4646.2, 662.8), (4669.4, 665.2), (4692.7, 667.3),
       (4716.0, 669.0), (4739.4, 670.2)]
C38 = [(4545.7, 723.7), (4568.0, 723.6), (4590.4, 722.8), (4612.8, 721.6), (4635.0, 720.0), (4657.3, 717.7),
       (4679.4, 714.9), (4699.9, 712.0), (4720.3, 709.6), (4740.8, 707.6), (4761.4, 706.0), (4782.0, 704.8),
       (4802.6, 704.0)]
C34 = [(4757.8, 677.2), (4781.5, 678.2), (4805.2, 679.5), (4828.8, 681.3), (4852.4, 683.5), (4876.0, 686.1),
       (4899.5, 689.1), (4923.6, 691.9), (4947.8, 693.9), (4972.0, 695.5), (4996.3, 696.4), (5020.6, 696.9)]

connections = [
    conn("C31", "crossover", "J31A", "J31B", "31A/31B", C31),
    conn("C33", "crossover", "J33A", "J33B", "33A/33B", C33),
    conn("C35", "crossover", "J35A", "J35B", "35A/35B", C35),
    conn("C35O", "turnout", "J35O", "J35C", "35 overrun leg", C35O),
    conn("C37", "turnout", "J37A", "J37B", "37A/37B", C37),
    conn("C39", "turnout", "J39B", "J39A", "39A/39B", C39[::-1]),
    conn("C38", "crossover", "J38B", "J38A", "38B/38A", C38),
    conn("C40", "crossover", "J40B", "J40A", "40B/40A", C40),
    conn("C34", "crossover", "J34B", "J34A", "34B/34A", C34),
]

# ---------------------------------------------------------------- points
RATIO_DEFAULT = ("1 IN 12", "TWS")
POINTS = [
    # code, node, connection, ratio, switch, inferred, crank handle, label xy (PDF)
    ("31A", "J31A", "C31", "1 IN 8.5", "CS", False, "CH1", (1959, 670)),
    ("31B", "J31B", "C31", "1 IN 8.5", "CS", False, "CH1", (2140, 692)),
    ("33A", "J33A", "C33", None, None, True, "CH2", (2061, 665)),
    ("33B", "J33B", "C33", None, None, True, "CH2", (2280, 628)),
    ("35A", "J35A", "C35", "1 IN 12", "CS", False, "CH4", (2161, 711)),
    ("35B", "J35B", "C35", "1 IN 8.5", "SS(CS)", False, "CH4", (2404, 719)),
    ("36", "J36", None, None, None, True, "CH5", (4875, 746)),
    ("37A", "J37A", "C37", "1 IN 8.5", "CS", False, "CH6", (2463, 737)),
    ("37B", "J37B", "C37", None, None, True, "CH6", (2609, 759)),
    ("38A", "J38A", "C38", None, None, True, "CH4", (4801, 712)),
    ("38B", "J38B", "C38", None, None, True, "CH4", (4551, 732)),
    ("39A", "J39A", "C39", None, None, True, "CH7", (2792, 759)),
    ("39B", "J39B", "C39", "1 IN 8.5", "CS", False, "CH7", (2940, 737)),
    ("40A", "J40A", "C40", None, None, True, "CH2", (4736, 665)),
    ("40B", "J40B", "C40", None, None, True, "CH2", (4433, 634)),
    ("34A", "J34A", "C34", "1 IN 12", "CS", False, "CH3", (5018, 692)),
    ("34B", "J34B", "C34", "1 IN 8.5", "SS", False, "CH3", (4762, 684)),
]
points = []
for code, nid, cid, ratio, sw, inferred, ch, (lx, ly) in POINTS:
    r, s = (ratio, sw) if ratio else RATIO_DEFAULT
    d = {"id": f"P{code}", "code": code, "nodeId": nid, "ratio": r, "switch": s,
         "ratioInferred": inferred, "control": int("".join(c for c in code if c.isdigit())),
         "crankHandle": ch, "label": XY(lx, ly)}
    if cid:
        d["connectionId"] = cid
    points.append(d)

# ---------------------------------------------------------------- signals
# footX: where the post stands on the track (arrow tip in the PDF).
# anchorX: where the wire meets the head. elements: ordered outward from the anchor.
L = lambda s: {"kind": "lamp", "style": s}
MK = lambda t: {"kind": "marker", "text": t}
CALL = {"kind": "callingOn"}
RI = {"kind": "routeIndicator"}
SH = lambda t=None: ({"kind": "shunt", "text": t} if t else {"kind": "shunt"})


def sig(code, name, kind, direction, track_id, foot, anchor, side, head, elements, control=None,
        full=None, board=None, label_xy=None):
    d = {"id": "SIG_" + code.replace("/", "").replace(" ", "_"), "code": code, "name": name, "kind": kind,
         "direction": direction, "trackId": track_id, "footX": round(foot - X0, 2),
         "anchorX": round(anchor - X0, 2), "side": side, "headDir": head, "elements": elements}
    if control is not None:
        d["control"] = control
    if full:
        d["fullCode"] = full
    if board:
        d["board"] = board
    return d


signals = [
    sig("UP DIST", "UP DISTANT", "distant", "UP", "L3", 867.8, 880, "above", "east",
        [MK("P"), L("slash"), L("solid"), L("slash")]),
    sig("1A/B/C", "UP HOME", "home", "UP", "L3", 1401.5, 1413, "above", "east",
        [MK("C"), CALL, L("vbar"), L("slash"), RI], control=1, board="SL"),
    sig("11", "UP LOOP LINE UP starter", "starter", "UP", "L4", 4405.7, 4396, "above", "east",
        [L("vbar"), L("slash")], control=11, full="S11"),
    sig("13", "UP MAIN STARTER", "starter", "UP", "L3", 4428.7, 4430, "above", "west",
        [L("slash"), L("vbar")], control=13),
    sig("15", "DN MAIN LINE UP starter (with shunt)", "starter", "UP", "L2", 4582.2, 4569, "above", "west",
        [L("solid"), L("vbar"), SH("SH15")], control=15, full="S/SH15"),
    sig("17", "COMMON LOOP UP starter (with shunt)", "starter", "UP", "L1", 4522.9, 4523, "above", "east",
        [SH("SH17"), L("vbar"), L("slash")], control=17, full="S/SH17"),
    sig("25", "UP ADVANCED STARTER", "advancedStarter", "UP", "L2", 5360.8, 5377, "above", "east",
        [L("vbar"), L("hbar")], control=25),
    sig("29", "TM SIDING signal", "starter", "UP", "L1", 5722.2, 5730, "above", "east",
        [L("vbar"), L("solid")], control=29),
    sig("26", "DN ADVANCED STARTER", "advancedStarter", "DN", "L2", 1663.3, 1660, "below", "west",
        [MK("B"), L("vbar"), L("hbar")], control=26),
    sig("16", "UP LOOP LINE DN starter", "starter", "DN", "L4", 2304.1, 2316, "below", "west",
        [L("vbar"), L("solid")], control=16, full="SS16"),
    sig("14", "UP MAIN LINE DN starter", "starter", "DN", "L3", 2293.0, 2305, "below", "west",
        [L("vbar"), L("solid")], control=14, full="SS14"),
    sig("12", "DN MAIN STARTER", "starter", "DN", "L2", 2429.2, 2476, "below", "west",
        [L("vbar"), L("slash"), L("hbar")], control=12, full="S12"),
    sig("10", "COMMON LOOP DN starter", "starter", "DN", "L1", 2442.5, 2438, "below", "west",
        [L("vbar"), L("slash")], control=10, full="S10"),
    sig("2A/B", "DN HOME", "home", "DN", "L2", 5936.0, 5928, "below", "west",
        [MK("C"), CALL, L("vbar"), L("slash"), L("hbar"), RI], control=2, board="DL"),
    sig("DN DIST", "DN DISTANT", "distant", "DN", "L2", 6469.7, 6461, "below", "west",
        [MK("P"), L("slash"), L("hbar"), L("slash")]),
    sig("SH3A/B", "Shunt signal 3A/3B", "shunt", "UP", "L2", 1958.0, 1962, "above", "east", [SH("SH3A/B")]),
    sig("SH4A-D", "Shunt signals 4A to 4D", "shunt", "DN", "L2", 5071.6, 5064, "below", "west",
        [SH("SH4(A-D)")]),
    sig("SH6", "Shunt signal 6", "shunt", "DN", "L1", 4936.8, 4928, "below", "west", [SH("SH6")]),
]
# printed label positions (PDF) so the viewer can show the code exactly where the SIP does
SIG_LABEL = {"UP DIST": (912, 641), "1A/B/C": (1477, 637), "11": (4407, 604), "13": (4446, 656),
             "15": (4584, 681), "17": (4564, 714), "25": (5409, 676), "29": (5761, 712), "26": (1626, 732),
             "16": (2318, 665), "14": (2274, 693), "12": (2434, 718), "10": (2406, 745), "2A/B": (5859, 733),
             "DN DIST": (6427, 734), "SH3A/B": (1956, 685), "SH4A-D": (5084, 719), "SH6": (4922, 760)}
for s in signals:
    x, y = SIG_LABEL[s["code"]]
    s["label"] = XY(x, y)

# ---------------------------------------------------------------- insulated joints
IJ = {
    "L3": [1217, 1438, 1944.5, 2284, 2962.5, 3633.5, 4465.5],
    "L2": [1588, 1994.5, 2149.5, 2420.5, 3148, 3867.5, 4590.5, 5035, 5397.5, 5899.5, 6120.5],
    "L1": [2434, 2949.5, 3850.5, 4531.5, 4900],
}
joints = []
for tid, xs in IJ.items():
    for x in xs:
        joints.append({"id": f"IJ_{tid}_{int(round(x))}", "trackId": tid, "x": round(x - X0, 2)})

# ---------------------------------------------------------------- track circuits / axle sections
def tc(code, spans, label, approx=True, kind="trackCircuit", text=None):
    sp = []
    for s in spans:
        if s[0] == "conn":
            sp.append({"connectionId": s[1]})
        else:
            sp.append({"trackId": s[0], "x0": round(s[1] - X0, 2), "x1": round(s[2] - X0, 2)})
    d = {"id": f"TC_{code.replace('/', '_')}", "code": code, "kind": kind, "spans": sp,
         "label": XY(*label), "approx": approx}
    if text:
        d["text"] = text
    return d


trackCircuits = [
    tc("URXT", [("L3", 357.8, 1217)], (988, 666), kind="axleCounter", text="URXT (SEC: MVF-JRT)"),
    tc("DDXT", [("L2", 357.8, 1588)], (986, 710), kind="axleCounter", text="DDXT (SEC: JRT-MVF)"),
    tc("BAXT", [("L2", 6120.5, 6822.5)], (6540, 692), kind="axleCounter", text="BAXT (SEC: JARATI-MALIGURA)"),
    tc("1AT", [("L3", 1217, 1438)], (1317, 670)),
    tc("1T", [("L3", 1438, 1944.5)], (1665, 669)),
    tc("31/33T", [("L3", 1944.5, 2284)], (2190, 669)),
    tc("L3T1", [("L3", 2284, 2962.5)], (2597, 668)),
    tc("L3T2", [("L3", 2962.5, 3633.5)], (3202, 668)),
    tc("L3T3", [("L3", 3633.5, 4465.5)], (4252, 668)),
    tc("40AT", [("L3", 4465.5, 4757.8)], (4641, 680)),
    tc("34BT", [("L3X", 4757.8, 4954.3)], (4842, 662)),
    tc("26AT", [("L2", 1588, 1994.5)], (1840, 706)),
    tc("31BT", [("L2", 1994.5, 2149.5)], (2040, 709)),
    tc("35AT", [("L2", 2149.5, 2420.5)], (2350, 697)),
    tc("L2T1", [("L2", 2420.5, 3148)], (2597, 696)),
    tc("L2T2", [("L2", 3148, 3867.5)], (3201, 695)),
    tc("L2T3", [("L2", 3867.5, 4590.5)], (4252, 695)),
    tc("34/38AT", [("L2", 4590.5, 5035)], (4902, 708)),
    tc("25AT", [("L2", 5035, 5397.5)], (5135, 693)),
    tc("2T", [("L2", 5397.5, 5899.5)], (5662, 695)),
    tc("2AT", [("L2", 5899.5, 6120.5)], (6052, 695)),
    tc("L1T1", [("L1", 2434, 2949.5)], (2708, 722)),
    tc("L1T2", [("L1", 2949.5, 3850.5)], (3203, 721)),
    tc("L1T3", [("L1", 3850.5, 4531.5)], (4253, 722)),
    tc("36/38T", [("L1", 4531.5, 4900)], (4628, 734)),
    tc("35BT", [("L1X", 2017.2, 2209.4), ("conn", "C35O")], (2273, 735)),
    tc("L4T1", [("L4", 2281.4, 2962.5)], (2597, 645)),
    tc("L4T2", [("L4", 2962.5, 3633.5)], (3202, 644)),
    tc("L4T3", [("L4", 3633.5, 4428.7)], (4253, 644)),
    tc("40BT", [("L4", 4428.7, 4768.8)], (4486, 633)),
]

# ---------------------------------------------------------------- platforms
platforms = [
    {"id": "PF2", "name": "PLATFORM No. 2", "kind": "high", "text": "HIGH LEVEL PASSENGER PLATFORM No.-2",
     "lengthM": 560, "widthM": 7, "startChainage": 282.81, "endChainage": 277.19,
     "polygon": [XY(*p) for p in [(2621, 632.2), (2621, 592.6), (3528, 592.6), (3528, 579), (3655, 579),
                                   (3655, 592.6), (4209, 592.6), (4209, 632.2)]],
     "label": XY(3058, 614)},
    {"id": "PF1", "name": "PLATFORM No. 1", "kind": "rail", "text": "RAIL LEVEL PLATFORM No.-1",
     "lengthM": 325, "widthM": 6.1, "startChainage": 133.27, "endChainage": 191.73,
     "polygon": [XY(*p) for p in [(3045, 732.9), (3980, 732.9), (3966, 767.5), (3665, 767.5), (3635, 777.6),
                                   (3548.4, 777.6), (3548.4, 791), (3530, 791), (3530, 803.1), (3399, 803.1),
                                   (3399, 767.6), (3045, 767.6)]],
     "label": XY(3249, 750)},
    {"id": "RLPF_S", "name": "R.L. PLATFORM (TM SIDING)", "kind": "rail", "text": "R. L. PLATFORM (300 X 3 M)",
     "lengthM": 300, "widthM": 3, "startChainage": 516.09, "endChainage": 816.09,
     "polygon": [XY(*p) for p in [(4893.4, 735.0), (5736.2, 735.0), (5736.2, 750.1), (4925, 750.1),
                                   (4893.4, 750.1)]],
     "label": XY(5128, 743)},
    {"id": "RLPF_N", "name": "RL PF (TM SIDING, NORTH)", "kind": "rail", "text": "RL PF (300M X 1.35M)",
     "lengthM": 300, "widthM": 1.35, "startChainage": 516.09, "endChainage": 816.09,
     "polygon": [XY(*p) for p in [(4893.4, 715.2), (5719, 715.2), (5719, 724.2), (4893.4, 724.2)]],
     "label": XY(5192, 720)},
]

# ---------------------------------------------------------------- structures
def rect(x0, y0, x1, y1):
    return {"type": "rect", "x0": round(x0 - X0, 2), "y0": round(y0 - Y0, 2),
            "x1": round(x1 - X0, 2), "y1": round(y1 - Y0, 2)}


structures = [
    {"id": "STN_EXIST", "kind": "building", "name": "EXISTING STN. BLDG", "shape": rect(3364.4, 813.2, 3477.8, 869.8),
     "label": XY(3421, 838)},
    {"id": "STN_NEW", "kind": "building", "name": "NEW STN. BLDG (58.3 X 7.46M)", "shape": rect(3674.3, 812.2, 3787.7, 868.9),
     "label": XY(3731, 877), "chainage": 109},
    {"id": "SM_ROOM", "kind": "smRoom", "name": "S.M. (VDU FOR E.I.)", "shape": rect(3707.8, 827.7, 3754.0, 853.6),
     "label": XY(3730, 862)},
    {"id": "FOB_V", "kind": "fob", "name": "FOB CH:40M F/CSB (3M WIDE)", "shape": rect(3548.4, 588.4, 3559.7, 777.6),
     "label": XY(3531, 846), "chainage": 40},
    {"id": "FOB_H", "kind": "fob", "name": "FOB CH:40M F/CSB (3M WIDE)", "shape": rect(3548.4, 765.9, 3630.6, 777.6)},
    {"id": "GOOMTY_W", "kind": "goomty", "name": "S&T GOOMTY", "shape": rect(2456.0, 601.4, 2484.5, 618.1),
     "foot": {"trackId": "L4", "x": round(2470.9 - X0, 2)}, "label": XY(2465, 590), "chainage": 335.87},
    {"id": "GOOMTY_E", "kind": "goomty", "name": "S&T GOOMTY", "shape": rect(4646.4, 601.5, 4674.8, 618.2),
     "foot": {"trackId": "L4", "x": round(4661.3 - X0, 2)}, "label": XY(4656, 590), "chainage": 436.85},
    {"id": "GOOMTY_LW", "kind": "goomty", "name": "GOOMTY", "shape": rect(2217.8, 803.1, 2246.3, 819.9),
     "label": XY(2240, 830), "chainage": 420.0},
    {"id": "GOOMTY_LE", "kind": "goomty", "name": "GOOMTY", "shape": rect(4514.0, 820.3, 4542.5, 837.1),
     "label": XY(4523, 846), "chainage": 390.0},
    {"id": "BOX_W", "kind": "detector", "name": "Detection point (box with circle), UP side, 1.4KM",
     "shape": rect(727.4, 638.5, 752.9, 652.6), "foot": {"trackId": "L3", "x": round(713.4 - X0, 2)}},
    {"id": "BOX_E", "kind": "detector", "name": "Detection point (box with circle), DN side, 1.4KM",
     "shape": rect(6586.9, 721.4, 6612.2, 735.7), "foot": {"trackId": "L2", "x": round(6626.4 - X0, 2)}},
    {"id": "LOCO_W", "kind": "locoPilotBoard", "name": "Loco pilot board (UP side, 30M)",
     "shape": rect(1146.2, 645.0, 1171.6, 660.8), "foot": {"trackId": "L3", "x": round(1132.1 - X0, 2)}},
    {"id": "LOCO_E", "kind": "locoPilotBoard", "name": "Loco pilot board (DN side, 30M)",
     "shape": rect(6165.8, 717.3, 6191.3, 731.6), "foot": {"trackId": "L2", "x": round(6205.3 - X0, 2)}},
    {"id": "LVV_UP", "kind": "lvv", "name": "UP LVV (MVF-JRT)", "at": {"trackId": "L3", "x": round(1924 - X0, 2)},
     "label": XY(1925, 653)},
    {"id": "LVV_DN", "kind": "lvv", "name": "DN LVV (JRT-MVF)", "at": {"trackId": "L2", "x": round(1618 - X0, 2)},
     "label": XY(1614, 681)},
    {"id": "LVV_E", "kind": "lvv", "name": "LVV (JRT-MVG)", "at": {"trackId": "L2", "x": round(5420 - X0, 2)},
     "label": XY(5436, 710)},
]

# ---------------------------------------------------------------- bridges (x from the printed chainage)
def bridge(no, ch, side, spec, x=None, new=False):
    px = x if x else ch_to_x(ch, side)
    d = {"id": f"BR{no}{'N' if new else ''}", "number": no, "chainage": ch, "x": round(px - X0, 2), "spec": spec}
    if new:
        d["isNew"] = True
    return d


bridges = [
    bridge("617", 571.70, "W", "1X1.22M HP (EXTN 1X1.50M X 1.650M RCC BOX)", x=1802),
    bridge("618", 468.86, "W", "2X1.22M (H.P) / 1X3.05M / (EXTN) 1X3.0 X 1.950M RCC BOX"),
    bridge("618", 421.63, "W", "1X3.687M RCC SLAB / 1X3.75 X 3.350M RCC BOX (EXTN)", x=2226.5, new=True),
    bridge("619", 134.36, "W", "1X3.0 X 1.80M RCC BOX", x=3042),
    bridge("620", 201.98, "E", "1X3.0 X 1.650M RCC BOX"),
    bridge("621", 415.56, "E", "2X1.22M HP (EXTN 1X3.0 X 1.650M RCC BOX)", x=4601),
    bridge("622", 674.12, "E", "3X1.22M HP (EXTN 1X4.5 X 1.65M RCC BOX)", x=5333.5),
]

# ---------------------------------------------------------------- chainage marks
MARKS = [  # kind, chainage, side of CSB, lane
    ("PT", 353.91, "W", "bottom"), ("FM", 356.58, "W", "bottom"), ("FM", 397.02, "W", "bottom"),
    ("PT", 338.20, "W", "bottom"), ("FM", 289.70, "W", "bottom"), ("DS", 277.02, "W", "bottom"),
    ("DS", 231.30, "W", "bottom"), ("FM", 220.63, "W", "bottom"), ("PT", 172.13, "W", "bottom"),
    ("PF END", 133.27, "W", "bottom"),
    ("PF END", 191.73, "E", "bottom"), ("FM", 414.95, "E", "bottom"), ("DS", 516.09, "E", "bottom"),
    ("PF END", 516.09, "E", "bottom"), ("DE", 816.09, "E", "bottom"), ("PF END", 816.09, "E", "bottom"),
    ("PT", 516.44, "W", "bottom"), ("FM", 500.77, "W", "bottom"), ("DE", 495.89, "W", "bottom"),
    ("FM", 467.94, "W", "bottom"), ("PT", 452.27, "W", "bottom"), ("PT", 445.77, "W", "bottom"),
    ("FM", 464.59, "E", "bottom"), ("PT", 486.71, "E", "bottom"),
    ("DS", 402.72, "W", "top"), ("FM", 404.64, "W", "top"), ("PT", 481.23, "W", "top"),
    ("PF END", 282.81, "W", "top"), ("PF END", 277.19, "E", "top"),
    ("PT", 354.82, "E", "top"), ("FM", 383.80, "E", "top"),
    ("PT", 464.40, "E", "top"), ("PT", 470.90, "E", "top"), ("DE", 474.82, "E", "top"),
    ("FM", 480.88, "E", "top"), ("DE", 543.87, "E", "top"), ("PT", 563.60, "E", "top"),
]
# printed sides: marks whose text sits west of the CSB are W; the 4xx/5xx marks east of it are E.
# 516.44/500.77/495.89/467.94/452.27/445.77 are printed west (x 1955..2136); 464.59/486.71 east (x 4734..4798).
chainageMarks = []
for k, (kind, ch, side, lane) in enumerate(MARKS):
    chainageMarks.append({"id": f"CM{k + 1}", "kind": kind, "chainage": ch,
                          "x": round(ch_to_x(ch, side) - X0, 2), "lane": lane})

# ---------------------------------------------------------------- gradients (printed posts)
def grad(i, direction, x, ch, a, b, label):
    d = {"id": i, "direction": direction, "x": round(x - X0, 2), "from": a, "to": b, "text": label}
    if ch is not None:
        d["chainage"] = ch
    return d


gradients = [
    grad("G_UP1", "UP", 335, 5218.54, None, "117", "CH:5218.54M"),
    grad("G_UP2", "UP", 492, 1576.54, "117", "130", "CH:1576.54M"),
    grad("G_UP3", "UP", 729, 991.54, "130", "135", "CH:991.54M"),
    grad("G_UP4", "UP", 1816, 567.0, "135", "243", "CH:567.0M"),
    grad("G_BOTH1", "BOTH", 5162, 613.6, "243", "110.24", "CH:613.60M"),
    grad("G_BOTH2", "BOTH", 6573, 1100, "110.24", "100", "CH:1100M"),
    grad("G_BOTH3", "BOTH", 6652, 1608, "100", "150", "CH:1608M"),
    grad("G_BOTH4", "BOTH", 6723, 1988, "150", "105", "CH:1988M"),
    grad("G_BOTH5", "BOTH", 6807, 2528, "105", "120", "CH:2528M"),
    grad("G_BOTH6", "BOTH", 6870, 3288, "120", None, "CH:3288M"),
    grad("G_DN1", "DN", 431, 4033, None, "120", "CH:4033M"),
    grad("G_DN2", "DN", 557, 2533, "120", "100", "CH:2533M"),
    grad("G_DN3", "DN", 626, 2273, "100", "130", "CH:2273M"),
    grad("G_DN4", "DN", 1179, 773.0, "130", "100", "CH:773.0M"),
    grad("G_DN5", "DN", 1815, 567.0, "100", "243", "CH:567.0M"),
]

# ---------------------------------------------------------------- dimensions
def vdim(x, ya, yb, text, lx=None, ly=None):
    d = {"id": f"DV{len(dims) + 1}", "kind": "vertical", "x": round(x - X0, 2), "y0": round(ya - Y0, 2),
         "y1": round(yb - Y0, 2), "text": text}
    if lx is not None:
        d["label"] = XY(lx, ly)
    return d


def hdim(y, xa, xb, text, tx):
    return {"id": f"DH{len(dims) + 1}", "kind": "horizontal", "y": round(y - Y0, 2), "x0": round(xa - X0, 2),
            "x1": round(xb - X0, 2), "text": text, "label": XY(tx, y)}


dims = []
for args in [
    (506.9, 663.4, 700.2, "6.50M", 502.4, 681.7), (1873.6, 673.6, 700.4, "4.72M", 1869.2, 686.8),
    (2071.6, 700.4, 741.6, "9.30M", 2067.1, 720.9), (2212.7, 741.1, 803.1, "9.19M", 2208.2, 772.0),
    (2232.2, 700.6, 803.2, "17.00M", 2239.9, 737.9), (2252.5, 803.1, 819.9, "5.00M", 2264.7, 811.6),
    (2470.9, 618.1, 638.0, "3.52M", 2456, 629), (2555.5, 673.6, 700.4, "4.72M", 2549.2, 686.9),
    (2671.6, 638.0, 673.6, "6.30M", 2665.5, 655.6), (2671.6, 673.6, 700.4, "4.72M", 2665.3, 686.8),
    (2671.6, 700.4, 727.2, "4.72M", 2665.6, 713.6), (2671.6, 727.2, 754.0, "4.72M", 2665.6, 740.4),
    (3121.7, 700.4, 727.2, "4.72M", 3115.3, 713.6), (3523.9, 638.0, 673.6, "6.30M", 3517.8, 655.6),
    (3563.5, 727.0, 791.4, "11.33M", 3559.2, 759.3), (3577.1, 599.2, 638.0, "6.83M", 3572.6, 618.4),
    (3584.8, 727.2, 765.9, "6.83M", 3580.3, 746.4), (3635.2, 766.0, 777.6, "3.00M", 3643.3, 772.1),
    (3731.9, 727.2, 812.2, "15.00M", 3732.8, 769.9), (4173.5, 592.5, 632.2, "7M", 4169.1, 612.2),
    (4214.4, 638.0, 673.6, "6.30M", 4208.3, 655.6), (4214.4, 673.6, 700.4, "4.72M", 4208.2, 686.8),
    (4214.4, 700.4, 727.2, "4.72M", 4208.4, 713.6), (4528.4, 727.2, 820.3, "12.28M", 4536.4, 784.7),
    (4548.8, 820.3, 837.1, "5.00M", 4561.0, 828.8), (4661.3, 618.2, 638.1, "3.50M", 4646, 629),
]:
    dims.append(vdim(*args))

for args in [
    (584, 713.4, 1401.5, "1.4KM", 1010), (584, 1401.5, 1905, "180M (MIN)", 1656),
    (603, 867.8, 1401.5, "1KM (MIN)", 1117), (626, 1132.1, 1217, "30M", 1174), (626, 1217, 1401.5, "5RL", 1318),
    (753, 1663.3, 1997, "120M", 1833), (619, 5028, 5360.8, "120M (MIN)", 5190),
    (763, 5432, 5929, "180M", 5680), (749, 5936, 6120.5, "5RL", 6037), (749, 6120.5, 6205.3, "30M", 6163),
    (770, 5936, 6469.7, "1KM (MIN)", 6218), (791, 5936, 6626.4, "1.4KM", 6235),
]:
    dims.append(hdim(*args))

# ---------------------------------------------------------------- printed route labels & annotations
def txt(i, t, x, y, **kw):
    d = {"id": i, "text": t, "x": round(x - X0, 2), "y": round(y - Y0, 2)}
    d.update(kw)
    return d


routeLabels = [
    txt("R1", "1A.C1A.", 2849, 644, arrow="east"), txt("R2", "1B.C1B.", 2849, 669, arrow="east"),
    txt("R3", "SH3A", 2853, 695, arrow="east"), txt("R4", "1C.C1C.SH3B", 2837, 723, arrow="east"),
    txt("R5", "1A.C1A.", 2115, 661, arrow="east"), txt("R6", "1C.C1C", 2023, 687, arrow="east"),
    txt("R7", "1C.C1C.SH3B", 2255, 714, arrow="east"), txt("R8", "10.12.", 1722, 708, arrow="west"),
    txt("R9", "SH4C.", 4316, 668, arrow="west"), txt("R10", "SH4D.", 4317, 644, arrow="west"),
    txt("R11", "2B.C2B.SH4B.", 4331, 695, arrow="west"), txt("R12", "2A.C2A.SH4A.SH6", 4338, 722, arrow="west"),
    txt("R13", "SH4D", 4658, 661, arrow="west"), txt("R14", "2A.C2A.SH4A", 4714, 715, arrow="west"),
    txt("R15", "SH4C/D", 4937, 690, arrow="west"), txt("R16", "11.13.17.SH15", 5234, 694, arrow="east"),
    txt("R17", "11.13.", 4850, 680, arrow="east"), txt("R18", "SH17", 5288, 724, arrow="east"),
    txt("R19", "11", 4564, 656, arrow="east"), txt("R20", "17", 4564, 714, arrow="east"),
    txt("R21", "15", 4584, 681, arrow="east"),
]

annotations = [
    txt("A1", "KOTTAVALASA", 436, 642, tone="end"), txt("A2", "(MANABAR 9.207 KMS)", 452, 657, tone="end"),
    txt("A3", "KIRANDUL", 6688, 673, tone="end"), txt("A4", "(MALIGURA 11.405 KM)", 6719, 688, tone="end"),
    txt("A5", "UP →", 644, 667), txt("A6", "← DN", 666, 708),
    txt("A7", "DN/UP", 6375, 696),
    txt("A8", "141.98M OVER RUN LINE (NO STABLING)", 2116, 749),
    txt("A9", "120M OVER RUN LINE (NO STABLING)", 4684, 644),
    txt("A10", "120M OVER RUN LINE (NO STABLING)", 4741, 737),
    txt("A11", "2M STAGGERED", 5475, 679),
    txt("A12", "280M (SH TO SS) LONG TM SIDING LINE", 5544, 721),
    txt("A13", "T.M. SIDING", 5030, 743),
    txt("A14", "CSL-749M (STR TO SS)", 4129, 644, tone="line"), txt("A15", "CSL-753M (STR TO SS)", 4129, 668, tone="line"),
    txt("A16", "CSL-759M (STR TO SS)", 4130, 695, tone="line"), txt("A17", "CSL-733M (STR TO STR)", 4132, 723, tone="line"),
    txt("A26", "RAIL LEVEL", 3114, 750), txt("A27", "10.00M", 2232, 837), txt("A28", "10.00M", 4528, 854),
    txt("A29", "5RL", 6037, 751),
]
# track-break marks (the SIP compresses the long approach)
breaks = [{"trackId": t, "x": round(x - X0, 2)} for t in ("L3", "L2") for x in (794, 1053)]

# ---------------------------------------------------------------- info panels (tables, notes, legend)
NOTES = [
    ("1", "THE SIGNALLING ARRANGEMENT IS SUITABLE FOR 25KV AC TRACTION."),
    ("2", "ALL SIGNAL LAMPS ARE OF LED TYPE."),
    ("3", "ALL CHAINAGES ARE SHOWN WITH RESPECT TO CENTRE LINE OF STATION BUILDING (CSB) AS 0.00M."),
    ("4", "ALL POINTS ARE 1 IN 12 (TWS) EXCEPT WHERE OTHERWISE INDICATED."),
    ("5", "ALL POINTS ARE MOTOR OPERATED."),
    ("6", "OPERATION OF E.I. IS FROM VISUAL DISPLAY UNIT AND ANOTHER VDU IS AVAILABLE AS STAND BY OPTION."),
    ("7", "PHYSICAL SM'S KEY & ALL COUNTERS SHALL BE PROVIDED."),
    ("8", "'ON' ASPECT OF UP AND DN HOME, UP & DN ADVANCED STARTER SIGNALS ARE TO BE PROVED IN RESPECTIVE BLOCK CIRCUITS."),
    ("9", "HASSDAC FOR LAST VEHICLE CHECK IS PROVIDED FOR BLOCK SECTION JARATI-MANABAR AND JARATI-MALIGURA."),
    ("10", "IN CASE OF FAILURE OF HASSDAC, THE PROCEDURES AS DETAILED IN SWR OF THE STATION WILL BE FOLLOWED FOR RESETTING THE SAME."),
    ("11", "FIELD OFFICIALS OF S&T DEPT SHALL ENSURE SOD CONCERNED. ALSO IRSOD 2022, SCH-I, CHAPTER-II (STATION YARD) NOTE No.(b) OF 1 (SPACING OF TRACKS) TO BE FOLLOWED."),
    ("12", "NO LOAD SHALL BE STABLED IN NON ISOLATED LINES WITHOUT A LIVE LOCOMOTIVE IS ATTACHED OTHERWISE VEHICLE SHALL BE SECURED AS PER RAILWAY BOARD's LETTER No.2012/SAFETY (A&R)/19/1, DTD. 04.12.2018. THIS IS TO BE INCORPORATED IN SWR."),
    ("13", "SIGNAL NO. S10, S11, S12, SS14, S/SH15, SS16, S/SH17 ARE PLACED AT A DISTANCE OF 3M FROM GLUED JOINT AS PER RAILWAY BOARD LETTER No.(i) 2012/SIG/SEM-II/MISC, DT 10.10.2012 AND (ii) 2012/SAFETY (A&R)/19/5, DT. 13.06.2013."),
    ("14", "WHILE SHUNTING ON GRADIENT TOWARDS UP ADV. STR SIG. No.25 AND DN ADV. STR SIG. No.26, AN ENGINE TO BE ATTACHED TOWARDS THE FALLING SIDE OF THE GRADIENT. G.R.5.20 TO BE STRICTLY FOLLOWED. THIS SAME IS TO BE MENTIONED IN SWR."),
    ("15", "LEGEND: see Legend tab."),
    ("16", "CONDONATION OBTAINED FROM GM THROUGH PCSO AS PER IRSOD REVISED 2022, (ACS-02) CHAPTER-II PARA-2 NOTE (D) (i) FOR GRADE STEEPER THAN 1 IN 400 AND UPTO 1 IN 100 IN YARD PORTION (REF: CE'S DRG. NO.- 5532/23, NOTE NO. 27) VIDE LETTER No: W.1/PLG/GM/COND/JRT YARD 1 IN 243/4246 DATE 24.06.2025 FOR THE FOLLOWING:"),
]
GRADE_NOTES = [
    ("i", "UP LINE (L-3)", "1 IN 243", "567M (KTV END)", "613.60M (KRDL END)", "1180.60M"),
    ("ii", "DN LINE (L-2)", "1 IN 243", "567M (KTV END)", "613.60M (KRDL END)", "1180.60M"),
    ("iii", "UP LOOP LINE (L-4)", "1 IN 243", "481.23M (KTV END)", "474.82M (KRDL END)", "956.05M"),
    ("iv", "COMMON LOOP LINE (L-1)", "1 IN 243", "495.89M (KTV END)", "613.60M (KRDL END)", "1109.49M"),
    ("v", "HOT AXLE SIDING", "1 IN 243", "338.20M (KTV END)", "172.13M", "166.07M towards KTV end"),
]

info = {
    "titleBlock": [
        {"label": "Station", "value": "JARATI (JRT)"},
        {"label": "Title", "value": "SIGNAL INTERLOCKING PLAN (ELECTRONIC INTERLOCKING)"},
        {"label": "Plan no.", "value": "SIP.ECoR.WAT.JRT.03 (RETRACED)"},
        {"label": "Zone / Division", "value": "ECoR / WAT (Waltair)"},
        {"label": "Class", "value": "'B' CLASS"},
        {"label": "Standard of interlocking", "value": "II"},
        {"label": "Scale", "value": "Horizontal 1:1000, vertical 1:500"},
        {"label": "Location", "value": "KM 205.946 F/KTV"},
        {"label": "Section", "value": "Koraput - Jagdalpur (doubling, Phase-I)"},
        {"label": "Retraced from", "value": "IP No. SIP.ECoR.WAT.JRT.02"},
        {"label": "CE's drawing", "value": "5532/23 ALT-2 dt. 23.06.2025; special note approved by CPDE/BBS on 26.08.2025"},
        {"label": "PCSTE's reference", "value": "23281"},
        {"label": "Signed", "value": "18-19.09.2025 (JE/C/D&D to CTPM/ECoR/BBS)"},
    ],
    "lines": [
        {"track": "L4", "lineNo": 4, "name": "UP LOOP LINE", "csl": "CSL-749M (STR TO SS)", "cslM": 749},
        {"track": "L3", "lineNo": 3, "name": "UP MAIN LINE", "csl": "CSL-753M (STR TO SS)", "cslM": 753},
        {"track": "L2", "lineNo": 2, "name": "DN MAIN LINE", "csl": "CSL-759M (STR TO SS)", "cslM": 759},
        {"track": "L1", "lineNo": 1, "name": "COMMON LOOP LINE", "csl": "CSL-733M (STR TO STR)", "cslM": 733},
    ],
    "legend": [
        {"id": "hassdac", "title": "HASSDAC", "text": "Last vehicle check device (dot pairs across the line).", "printed": True},
        {"id": "locoPilot", "title": "Loco pilot board",
         "text": "\"LOCO PILOT-DRAW AHEAD RIGHT UPTO THE FOOT OF THE SIGNAL IF FOUND AT ON.\"", "printed": True},
        {"id": "sl", "title": "SL", "text": "\"ENTERING INTO SINGLE LINE TERRITORY\"", "printed": True},
        {"id": "dl", "title": "DL", "text": "\"ENTERING INTO DOUBLE LINE TERRITORY\"", "printed": True},
    ],
    "notes": [{"no": n, "text": t} for n, t in NOTES],
    "tables": [
        {"id": "controls", "title": "Controls",
         "columns": ["Group", "Range", "Used", "Spare"],
         "rows": [
             ["Total no. of controls", "1 to 50", "", ""],
             ["Signal controls", "1-30", "1, 2, 3, 4, 6, 10, 11, 12, 13, 14, 15, 16, 17, 25, 26, 29",
              "5, 7, 8, 9, 18, 19-24, 27, 28, 30"],
             ["Points & other controls", "31-50", "31, 33, 34, 35, 36, 37, 38, 39, 40", "32, 41-50"],
         ]},
        {"id": "crank", "title": "Crank handle control for emergency operation of points",
         "columns": ["No.", "Crank handle", "Control points"],
         "rows": [["1", "CH1", "31A/B"], ["2", "CH2", "33A/B, 40A/B"], ["3", "CH3", "34A/B"],
                  ["4", "CH4", "35A/B, 38A/B"], ["5", "CH5", "36"], ["6", "CH6", "37A/B"], ["7", "CH7", "39A/B"]]},
        {"id": "overlap", "title": "Overlap setting column",
         "columns": ["Sl.", "Route no.", "Overlap setting"],
         "rows": [["1", "1A SET TO ORL (OV1_11)", "40N."],
                  ["2", "1A SET TO M/L (OV2_11)", "40R. 34R. (38N)"],
                  ["3", "1B SET TO SH (OV1_13)", "40N. 34N"],
                  ["4", "1B SET TO M/L (OV2_13)", "40N. 34R. (38N)"],
                  ["5", "1C SET TO ORL (OV1_17)", "38N. 36N."],
                  ["6", "1C SET TO M/L (OV2_17)", "38R. 34N. (36N)"],
                  ["7", "2A SET TO ORL (OV1_10)", "35N."],
                  ["8", "2A SET TO M/L (OV2_10)", "35R. 31N."],
                  ["9", "2B (OV_12)", "35N. 31N."]]},
        {"id": "working", "title": "System of working",
         "columns": ["S.no.", "System", "Section", "Instrument", "Location"],
         "rows": [["1", "ABSOLUTE BLOCK", "JARATI - MANABAR", "D L B I (S.G.E TYPE)", "S.M."],
                  ["2", "ABSOLUTE BLOCK", "JARATI - MALIGURA", "TLBI (DAIDO TYPE)", "S.M."]]},
        {"id": "grades", "title": "Gradients condoned (note 16)",
         "columns": ["Item", "Line", "Grade", "From", "To", "Length"],
         "rows": [list(r) for r in GRADE_NOTES]},
    ],
    "procedures": [
        {"id": "key-q", "title": "Hot axle siding point 37A/B: key 'Q'",
         "location": "In hot axle sdg loc (for operation of point 37A/B); crank handle CH6 in H.A. siding loc",
         "steps": [
             "To operate siding point, key 'Q' is required to be inserted in EKT-2.",
             "Key 'Q' can be extracted from EKT-1 only when S.M. extends permission from SM's VDU. Extraction of key 'Q' from EKT-1 will block all signalling movement on line No. 1.",
             "Key 'Q' when inserted in EKT-2, point free indication appears in the board.",
             "Point button & normal or reverse buttons are simultaneously pressed to set the point to normal or reverse as the case may be.",
             "After the setting of point to reverse, key 'Q' should be extracted from EKT-2 and kept in the custody of shunting porter. Removal of key will lock the point.",
             "After completion of the movement, key 'Q' is to be inserted in EKT-2 and siding point 37A/B is to be operated normal position. After ensuring that both ends of point end of 37A/B is in normal position, key 'Q' is extracted from EKT-2 and inserted in EKT-1 to enable S.M. to release the control 37. Key 'Q' in EKT-1 resumes all signalling movements over 37A/B in normal position.",
             "In case of failure of electrical operation, crank handle control CH6 is to be taken out for crank handling the point 37A/B.",
             "110V feed of point 37A/B shall be extended when concerned control 37 is transmitted to location.",
         ]},
        {"id": "key-p", "title": "Hot axle siding point 39A/B: key 'P'",
         "location": "In hot axle sdg loc (for operation of point 39A/B); crank handle CH7 in hot axle sdg loc",
         "steps": [
             "To operate siding point, key 'P' is required to be inserted in EKT-2.",
             "Key 'P' can be extracted from EKT-1 only when S.M. extends permission from SM's VDU. Extraction of key 'P' from EKT-1 will block all signalling movement on line No. 1.",
             "Key 'P' when inserted in EKT-2, point free indication appears in the board.",
             "Point button & normal or reverse buttons are simultaneously pressed to set the point to normal or reverse as the case may be.",
             "After the setting of point to reverse, key 'P' should be extracted from EKT-2 and kept in the custody of shunting porter. Removal of key will lock the point.",
             "After completion of the movement, key 'P' is to be inserted in EKT-2 and siding point 39A/B is to be operated normal position. After ensuring that both ends of point end of 39A/B is in normal position, key 'P' is extracted from EKT-2 and inserted in EKT-1 to enable S.M. to release the control 39. Key 'P' in EKT-1 resumes all signalling movements over 39A/B in normal position.",
             "In case of failure of electrical operation, crank handle control CH7 is to be taken out for crank handling the point 39A/B.",
             "110V feed of point 39A/B shall be extended when concerned control 39 is transmitted to location.",
         ]},
    ],
    "aspectCharts": [
        {"direction": "UP", "title": "UP ASPECT CONTROL CHART",
         "signals": [{"name": "UP DIST", "code": ""}, {"name": "UP HOME", "code": "1A/B/C"},
                     {"name": "UP MAIN STR.", "code": "13"}, {"name": "UP ADV. STR", "code": "25"}],
         "gaps": ["1KM (MIN)", "1067M (APPROX)", "330M (APPROX)"],
         "rows": [["YY", "Y", "Ywu", "G"], ["", "Ywu", "Ywu", "R"], ["Y", "R", "R", ""]]},
        {"direction": "DN", "title": "DN ASPECT CONTROL CHART",
         "signals": [{"name": "DN ADV. STR", "code": "26"}, {"name": "DN MAIN STR.", "code": "12"},
                     {"name": "DN HOME", "code": "2A/B"}, {"name": "DN DIST", "code": ""}],
         "gaps": ["270M (APPROX)", "1237M (APPROX)", "1KM (MIN)"],
         "rows": [["G", "G", "G", "G"], ["R", "Y", "Y", "YY"], ["", "R", "Ywu", "Y"], ["", "", "R", ""]]},
    ],
    "revisions": [
        {"ver": "03", "text": "REMODELING OF JARATI STN YARD IN CONNECTION WITH DOUBLING OF KORAPUT-JAGDALPUR SECTION (PHASE-I). NOTE ITEM No. 28 OF ESP.",
         "supersedes": "SIP.ECoR.WAT.JRT.02", "reference": "CE'S DRG NO. 5532/23 ALT-2 DT. 23.06.2025"},
        {"ver": "02", "text": "PF RETAIN AS RAIL LEVEL AND PF END CH ALTERED (KRDL END); GRADIENT ALTERED; BRIDGE DETAILS ALTERED AS PER APPROVED GADS; PLATFORM NO. ALLOCATED; 300X1.3M RL PF PROVIDED IN TM SIDING; NOTE NO. 16 ALTERED.",
         "supersedes": "SIP.ECoR.WAT.JRT.01", "reference": "CE'S DRG NO. 5532/23 ALT-1 & ALT-2; CPDE/ECoR/BBS letter W.1/PLG/GM/COND/JRT YARD 1 IN 243/4246 dt. 24.06.25"},
        {"ver": "01", "text": "REMODELING OF JARATI STN YARD IN CONNECTION WITH DOUBLING OF KORAPUT-JAGDALPUR SECTION (PHASE-I), ALT-'B'.",
         "supersedes": "", "reference": "CE'S DRG NO. 5532/23 ALT-2 dt. 14.08.2023"},
    ],
}

station = {
    "meta": {
        "code": "JRT", "name": "Jarati", "zone": "ECoR", "sipRef": "SIP.ECoR.WAT.JRT.03",
        "coordinateSpace": "drawing-pt: x grows toward KRDL (east), y grows downward; origin shifted from the PDF",
        "ends": {"west": "KTV (Kottavalasa) end", "east": "KRDL (Kirandul) end"},
        "chainage": {"originX": round(CSB_X - X0, 2), "metresPerUnit": M_PER_PT, "label": "F/CSB",
                     "origin": "Centre line of station building, KM 205.946 F/KTV"},
        "scale": {"horizontal": "1:1000", "vertical": "1:500"},
        "viewHints": {"yExaggeration": 4},
    },
    "nodes": list(N.values()), "tracks": tracks, "connections": connections,
    "assets": {
        "points": points, "signals": signals, "joints": joints, "trackCircuits": trackCircuits,
        "platforms": platforms, "structures": structures, "bridges": bridges, "chainageMarks": chainageMarks,
        "gradients": gradients, "dimensions": dims, "routeLabels": routeLabels, "annotations": annotations,
        "breaks": breaks,
    },
    "info": info,
}

if __name__ == "__main__":
    with open(OUT, "w") as f:
        json.dump(station, f, indent=1, ensure_ascii=False)
    a = station["assets"]
    print({k: len(v) for k, v in a.items()}, len(N), "nodes", len(tracks), "tracks", len(connections), "conns")
