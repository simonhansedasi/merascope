#!/usr/bin/env python3
"""
prefetch_precip.py — Pre-fetch Open-Meteo precipitation for all 48 states.

Run this LOCALLY (residential IP avoids datacenter rate limits).
Saves data/{STATE}/raw/precip_coarse.csv for each state.
Hetzner pipeline will use these as cache and skip the API call entirely.

Only matters when data/prism_ppt_30yr.tif is missing — 02_zcta_indicators.py
(and 02_indicators.py) sample PRISM directly and only fall back to this
lat/lon point cache otherwise. See prefetch_precip_noaa.py for the
alternative source: that one has no rate limits and can run anywhere
(including on Hetzner itself), at the cost of sparser station coverage than
this script's dense per-state sample grid. Prefer NOAA for a fresh rerun
unless Open-Meteo's finer sampling is specifically needed.

Usage:
  python scripts/zcta/prefetch_precip.py
  python scripts/zcta/prefetch_precip.py WA OR CA   # specific states
"""

import sys
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"

STATES = [
    "AL","AR","AZ","CA","CO","CT","DE","FL","GA","IA","ID","IL","IN","KS","KY",
    "LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM",
    "NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA",
    "WI","WV","WY",
]


def fetch_precip(state, state_gdf):
    path = DATA / state / "raw" / "precip_coarse.csv"
    if path.exists():
        df = pd.read_csv(path)
        print(f"  {state}: cached ({len(df)} points)")
        return

    bounds = state_gdf.total_bounds
    state_union = state_gdf.geometry.union_all()
    sample_lats = np.linspace(bounds[1] + 0.4, bounds[3] - 0.2, 7)
    sample_lons = np.linspace(bounds[0] + 0.4, bounds[2] - 0.2, 11)
    pts = [(round(lat, 2), round(lon, 2))
           for lat in sample_lats for lon in sample_lons
           if state_union.contains(Point(lon, lat))]

    # Send all points in one batch request — one API call per state
    print(f"  {state}: batch request for {len(pts)} points...", flush=True)
    lats = ",".join(str(p[0]) for p in pts)
    lons = ",".join(str(p[1]) for p in pts)
    params = {
        "latitude": lats, "longitude": lons,
        "start_date": "1991-01-01", "end_date": "2020-12-31",
        "daily": "precipitation_sum", "timezone": "UTC",
    }
    records = []
    delay = 30
    for attempt in range(6):
        try:
            r = requests.get("https://archive-api.open-meteo.com/v1/archive",
                             params=params, timeout=120)
            if r.status_code == 429:
                print(f"    rate limited — waiting {delay}s...", flush=True)
                time.sleep(delay)
                delay = min(delay * 2, 300)
                continue
            r.raise_for_status()
            results = r.json()
            if isinstance(results, dict):
                results = [results]
            for i, res in enumerate(results):
                lat, lon = pts[i]
                vals = [v for v in res["daily"]["precipitation_sum"] if v is not None]
                if vals:
                    records.append({"lat": lat, "lon": lon, "ann_precip_mm": sum(vals) / 30.0})
            print(f"    OK — {len(records)} points returned", flush=True)
            time.sleep(3.0)
            break
        except Exception as e:
            if attempt == 5:
                print(f"    failed after retries: {e}", flush=True)
                return
            print(f"    retry {attempt+1} in {delay}s: {e}", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 300)

    df = pd.DataFrame(records)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    print(f"  {state}: saved {len(df)} points → {path}", flush=True)


def main():
    targets = [s.upper() for s in sys.argv[1:]] if len(sys.argv) > 1 else STATES
    missing = [s for s in targets if not (DATA / s / "raw" / "state.geojson").exists()]
    if missing:
        print(f"No state.geojson for: {missing} — skipping")
        targets = [s for s in targets if s not in missing]

    print(f"Fetching precip for {len(targets)} states...")
    for state in targets:
        state_gdf = gpd.read_file(DATA / state / "raw" / "state.geojson")
        fetch_precip(state, state_gdf)

    print("\nDone. Rsync to Hetzner with:")
    print("  rsync -av --include='precip_coarse.csv' --include='*/' --exclude='*' \\")
    print("    data/ root@<hetzner-ip>:/home/simonhans/coding/merascope/data/")


if __name__ == "__main__":
    main()
