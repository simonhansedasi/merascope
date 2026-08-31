"""Fetch all US OSM data centres WITH geometry (footprint), unlike 01_basemap.py
which uses `out center` and discards area. Area is what separates a hyperscale
campus from a single colo suite in a downtown office tower."""
import json, time, sys
import requests

OVERPASS = "https://overpass-api.de/api/interpreter"
# Contiguous US bbox
S, W, N, E = 24.0, -125.0, 49.5, -66.5

QUERY = f"""
[out:json][timeout:600][maxsize:1073741824];
(
  node["man_made"="data_centre"]({S},{W},{N},{E});
  way["man_made"="data_centre"]({S},{W},{N},{E});
  relation["man_made"="data_centre"]({S},{W},{N},{E});
  node["telecom"="data_center"]({S},{W},{N},{E});
  way["telecom"="data_center"]({S},{W},{N},{E});
  relation["telecom"="data_center"]({S},{W},{N},{E});
);
out geom;
"""

for attempt in range(4):
    try:
        r = requests.post(OVERPASS, data={"data": QUERY},
                          headers={"User-Agent": "merascope-research/1.0"}, timeout=700)
        r.raise_for_status()
        data = r.json()
        break
    except Exception as e:
        print(f"attempt {attempt+1} failed: {e}", flush=True)
        if attempt == 3:
            sys.exit(1)
        time.sleep(30)

els = data.get("elements", [])
print(f"elements: {len(els)}")
with open("cache/osm_datacenters_raw.json", "w") as f:
    json.dump(data, f)
print("saved cache/osm_datacenters_raw.json")
