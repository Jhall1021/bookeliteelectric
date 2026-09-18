"""Minimal xlsx reader: zip + XML, no dependencies."""
import zipfile, re, sys
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

def _col(ref):
    m = re.match(r"([A-Z]+)", ref or "")
    if not m: return 0
    n = 0
    for ch in m.group(1): n = n * 26 + (ord(ch) - 64)
    return n - 1

def load(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    tgt = {r.get("Id"): r.get("Target") for r in rels}
    sheets = []
    for sh in wb.find(f"{NS}sheets"):
        rid = sh.get(f"{RNS}id")
        t = (tgt.get(rid) or "").lstrip("/")
        if not t.startswith("xl/"): t = "xl/" + t
        sheets.append((sh.get("name"), t))
    out = {}
    for name, target in sheets:
        if target not in z.namelist(): continue
        ws = ET.fromstring(z.read(target))
        rows = []
        for row in ws.iter(f"{NS}row"):
            cells = {}
            for c in row.findall(f"{NS}c"):
                v = c.find(f"{NS}v"); isel = c.find(f"{NS}is")
                if c.get("t") == "s" and v is not None:
                    val = shared[int(v.text)]
                elif isel is not None:
                    val = "".join(t.text or "" for t in isel.iter(f"{NS}t"))
                elif v is not None:
                    val = v.text
                else:
                    val = ""
                cells[_col(c.get("r"))] = (val or "").strip()
            if cells:
                width = max(cells) + 1
                rows.append([cells.get(i, "") for i in range(width)])
        out[name] = rows
    return out

if __name__ == "__main__":
    for p in sys.argv[1:]:
        d = load(p)
        print(f"\n=== {p.split('/')[-1]}")
        for name, rows in d.items():
            print(f"  sheet {name!r}: {len(rows)} rows, {max((len(r) for r in rows), default=0)} cols")
