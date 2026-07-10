#!/usr/bin/env python3
"""
build_transmission_national.py — Merge each state's raw transmission.geojson
(from 01_basemap.py's OSM fetch) into one small national file for
map.jsx/data.js to render without per-state downloads.

NOTE: despite this docstring historically saying ">= 115kV" / "3 decimal
places", the code below actually filters to >= 345000 V (line/bulk
transmission tier, not the 115kV sub-transmission tier) and rounds to 2
decimal places (~1km precision, not ~100m) — see parse_v()'s 345000 cutoff
and round_coords()'s `, 2)` below. If this needs to match the docstring's
original intent, change the threshold/precision here, not the comment.

Run on VPS: /usr/bin/python3 -u scripts/build_transmission_national.py
"""
import json
from pathlib import Path

STATES = [
    "WA","OR","TX","CA","NV","UT","ID","MT","AZ","CO","WY","NM","ND","SD","NE","KS","OK",
    "MN","IA","MO","AR","LA","MI","WI","IL","IN","KY","TN","MS","GA","OH",
    "AL","FL","SC","NC","VA","WV","PA","NY","NJ","CT","RI","MA","VT","NH","ME","DE","MD",
]

DATA_DIR = Path(__file__).parent.parent / "data"

def parse_v(raw):
    # OSM voltage tags can be multi-valued for shared-corridor lines (e.g.
    # "115000;230000"); this takes only the first value, which is not
    # guaranteed to be the highest — a line tagged "115000;345000" would be
    # excluded below even though it carries a qualifying 345kV circuit.
    try:
        return int(str(raw).split(";")[0].replace(",", "").strip())
    except Exception:
        return 0

def round_coords(coords):
    if coords and isinstance(coords[0], list):
        return [round_coords(c) for c in coords]
    return [round(coords[0], 2), round(coords[1], 2)]


features = []
for st in STATES:
    path = DATA_DIR / st / "raw" / "transmission.geojson"
    if not path.exists():
        print(f"  {st}: missing — skipping")
        continue
    with open(path) as f:
        gj = json.load(f)
    kept = 0
    for feat in gj.get("features", []):
        v = parse_v(feat.get("properties", {}).get("voltage", 0))
        if v < 345000:
            continue
        geom = feat.get("geometry", {})
        if geom.get("type") not in ("LineString", "MultiLineString"):
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": geom["type"], "coordinates": round_coords(geom["coordinates"])},
            "properties": {"v": v},
        })
        kept += 1
    print(f"  {st}: {kept} / {len(gj.get('features', []))} kept")

out_path = DATA_DIR / "shared" / "transmission_national.geojson"
with open(out_path, "w") as f:
    json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

mb = out_path.stat().st_size / 1024 / 1024
print(f"\n{len(features)} features → {out_path} ({mb:.1f} MB)")
