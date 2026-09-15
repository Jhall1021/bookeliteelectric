import re, json
TXT = open("mlu.txt", encoding="utf-8", errors="replace").read().split("\n")
ROW = re.compile(r"^\s*(.+?)\s{2,}(?:X\s+)?(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+([CEMX])\s*\d?\s*$")

def rows_in(lo, hi):
    out = []
    for i in range(lo, min(hi, len(TXT))):
        m = ROW.match(TXT[i])
        if m:
            desc = re.sub(r"\s+", " ", m.group(1)).strip()
            if len(desc) < 2: continue
            out.append({"line": i + 1, "description": desc,
                        "normal": float(m.group(2)), "difficult": float(m.group(3)),
                        "veryDifficult": float(m.group(4)), "unit": m.group(5)})
    return out

def norm(unit, v):
    """MLU unit -> manhours per single item / per linear foot."""
    if unit == "C": return v / 100.0
    if unit == "M": return v / 1000.0
    if unit == "E": return v
    return None

BLOCKS = [
  ("surface_metal_raceway", "MLU 2-42/2-43", "Section 2 — Surface Metal Raceways", 5342, 5470),
  ("nonmetallic_surface_raceway", "MLU 2-46/2-47", "Section 2 — Nonmetallic Surface Raceways (Wiremold)", 5645, 5800),
  ("emt_and_fittings", "MLU 2-21/2-22", "Section 2 — EMT and Fittings", 3760, 3846),
  ("knockout_steel_boxes", "MLU 2-19", "Section 2 — Knockout Type Steel Boxes", 3618, 3670),
  ("nm_cable", "MLU 3-15/3-16", "Section 3 — 600V NM/UF Cable Copper", 10955, 11005),
  ("cable_straps", "MLU 3-15", "Section 3 — One-hole straps", 10943, 10956),
  ("building_wire_thhn", "MLU 3-6", "Section 3 — 600V Bldg Wire 1/C Copper THHN/THWN", 10286, 10310),
]
out = {
  "source": {"id": "SRC-MLU-2015", "title": "NECA Manual of Labor Units 2015-2016 Edition",
             "provider": "National Electrical Contractors Association", "edition": "2015-2016",
             "file": "MLU 2015-16.pdf"},
  "conventions": {
    "values": "man-hours",
    "units": {"C": "per 100 items or per 100 linear feet", "M": "per 1000 linear feet", "E": "each"},
    "columns": ["Normal", "Difficult", "Very Difficult", "Company Experience (blank)"],
    "included": ["normal material handling", "drawing study, measurement and layout",
                 "material installation", "normal non-productive labor"],
    "excluded": ["field supervision", "raceway terminations", "welding or painting", "testing of any type",
                 "fasteners, hangers and supports (separately published)"],
    "scopeRule": ("Labor units in this manual are for new work only and for a complete electrical "
                  "installation. For remodeling or change order situations these labor units need to "
                  "be substantially increased."),
    "conditionRule": "Labor units are based on NEW material and de-energized conditions.",
  },
  "blocks": {},
}
for key, page, title, lo, hi in BLOCKS:
    rs = rows_in(lo, hi)
    for r in rs:
        r["normalizedPerItemOrFoot"] = norm(r["unit"], r["normal"])
        r["page"] = page
    out["blocks"][key] = {"title": title, "page": page, "rowCount": len(rs), "rows": rs}
    print(f"  {key:<32} {len(rs):>3} rows  ({page})")
json.dump(out, open("mlu_evidence.json", "w"), indent=2)
print(f"\n  total rows extracted: {sum(len(b['rows']) for b in out['blocks'].values())}")
