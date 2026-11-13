"""Text patterns used across stages. Kept in one place so a new naming habit is a one-line change."""
import re

# track circuit / axle section captions: 3T, 57BT, 011T, C12T, 11/12T, 03/04T1, 31/33T, 1AT, L2T1, 35BT, URXT(SEC...)
TC_RE = re.compile(r"^(?:[A-Z]{0,2}\d+[A-Z]?(?:/\d+[A-Z]?)?T\d*|[A-Z]{2,3}XT(?:\(.*\))?|\d+[A-Z]?XT)$")
# point numbers beside a turnout: 31A, 57B, 36, 112A
POINT_RE = re.compile(r"^\d{1,3}[A-Z]?$")
# switch angle captions: 1 IN 8.5 CS, 1 IN 12(CS), 1 IN 8.5 SS(CS), 1 IN 8.5 (SS)
RATIO_RE = re.compile(r"1\s*IN\s*(\d+(?:\.\d+)?)\s*\(?\s*([A-Z]{2,3}(?:\s*\([A-Z]{2,3}\))?)?\s*\)?", re.I)
# signal names: S-03, SH-103, C-12, D-12, DSH-301, 1A/B/C, C-1A/B/C, SH3A/B, SH4(A-D), 26, UP DIST
SIGNAL_RE = re.compile(r"^(?:(?:S|SH|C|D|DSH|A|R|IB|GD|CO|ID|S/C)-?\d+[A-Z]?(?:[/\-][A-Z])*(?:\([A-Z\-/]+\))?|\d{1,3}[A-Z]?(?:/[A-Z])*|(?:UP|DN)\s+DIST\.?|(?:UP|DN)\s+DISTANT)$")
CHAINAGE_RE = re.compile(r"CH\s*[:.\-]?\s*(-?\d+(?:\.\d+)?)\s*[mM]?")
KM_RE = re.compile(r"\bkm\s*[:.\-]?\s*(\d+(?:\.\d+)?)", re.I)
LINE_NO_RE = re.compile(r"LINE\s*No\.?\s*-?\s*(\d+)", re.I)
LENGTH_RE = re.compile(r"\(?\s*\d+(?:\.\d+)?\s*[mM](?:\s*\(?(?:MIN|APPROX)\.?\)?)?\s*\)?$|\d+(?:\.\d+)?\s*K[mM]")
