"""Companion stat to analysis_wa_fire_risk.py, built for a LinkedIn post: what
share of WA reads WHP "non-burnable" (class 6 -- developed/ag land, scored
fireproof by land-cover convention, not by real fire history), and what share
of confirmed WA data-center sites sit on that same land, and what share of
that "non-burnable" land has actually ignited since 1984 per MTBS.

Same Monte Carlo methodology as _compute_area_stats() in
analysis_wa_fire_risk.py (same seed, same N_SAMPLES) -- this just adds the
class==6-conditioned burned share and the DC-site count, neither of which
compute() returns.

Run: python3 scripts/analysis_wa_nonburnable_ignition.py
"""
import json
import os

import geopandas as gpd
import numpy as np
from pyproj import Transformer
from shapely import contains_xy
from shapely.geometry import shape

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "shared")
DATA_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
N_SAMPLES = 20_000
WHP_LABELS = {1: "very low", 2: "low", 3: "moderate", 4: "high", 5: "very high",
              6: "non-burnable", 7: "water", 255: None}


def _load(name):
    with open(os.path.join(BASE, name)) as f:
        return json.load(f)


def main():
    perimeters = _load("wa_fire_perimeters.geojson")
    arr = np.load(os.path.join(BASE, "whp_wa.npy"))
    t = _load("whp_wa_transform.json")
    to_whp = Transformer.from_crs("EPSG:4326", t["crs"], always_xy=True)

    wa = gpd.read_file(os.path.join(DATA_ROOT, "WA", "raw", "state.geojson"))
    wa_union = wa.unary_union
    minlon, minlat, maxlon, maxlat = wa.total_bounds
    perim_union = gpd.GeoSeries([shape(f["geometry"]) for f in perimeters["features"]], crs="EPSG:4326").unary_union

    rng = np.random.default_rng(0)
    lons = np.empty(0)
    lats = np.empty(0)
    while lons.size < N_SAMPLES:
        cand_lon = rng.uniform(minlon, maxlon, N_SAMPLES * 2)
        cand_lat = rng.uniform(minlat, maxlat, N_SAMPLES * 2)
        keep = contains_xy(wa_union, cand_lon, cand_lat)
        lons = np.concatenate([lons, cand_lon[keep]])
        lats = np.concatenate([lats, cand_lat[keep]])
    lons, lats = lons[:N_SAMPLES], lats[:N_SAMPLES]

    burned = contains_xy(perim_union, lons, lats)

    xs, ys = to_whp.transform(lons, lats)
    cols = np.round((xs - t["origin_x"]) / t["pixel_x"]).astype(int)
    rows = np.round((t["origin_y"] - ys) / -t["pixel_y"]).astype(int)
    valid = (rows >= 0) & (rows < arr.shape[0]) & (cols >= 0) & (cols < arr.shape[1])
    classes = np.where(valid, arr[np.clip(rows, 0, arr.shape[0] - 1), np.clip(cols, 0, arr.shape[1] - 1)], 255)

    print("WHP class shares of WA land area:")
    for cls, label in WHP_LABELS.items():
        if label is None:
            continue
        share = 100.0 * (classes == cls).sum() / N_SAMPLES
        print(f"  {label:14s} (class {cls}): {share:.2f}%")

    nonburn = classes == 6
    n_nonburn = int(nonburn.sum())
    n_nonburn_and_burned = int((nonburn & burned).sum())
    nonburn_ignited_pct = 100.0 * n_nonburn_and_burned / n_nonburn
    print(f"\nOf the {100.0 * n_nonburn / N_SAMPLES:.1f}% of WA classed 'non-burnable', "
          f"{nonburn_ignited_pct:.2f}% has actually burned since 1984 (n={n_nonburn} samples).")

    confirmed = [f for f in _load("tracked_datacenters.geojson")["features"]
                 if f["properties"]["confirmed"] and f["properties"]["state"] == "WA"
                 and f["properties"]["status"] in ("operating", "under_construction", "proposed")]
    n_dc_nonburn = 0
    for f in confirmed:
        lon, lat = f["geometry"]["coordinates"]
        x, y = to_whp.transform(lon, lat)
        col = int(round((x - t["origin_x"]) / t["pixel_x"]))
        row = int(round((t["origin_y"] - y) / -t["pixel_y"]))
        cls = int(arr[row, col]) if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1] else None
        if cls == 6:
            n_dc_nonburn += 1
    print(f"\n{n_dc_nonburn} of {len(confirmed)} confirmed WA data-center sites sit on WHP class 6 (non-burnable) land.")

    out = {
        "n_samples": N_SAMPLES,
        "nonburnable_share_pct": round(100.0 * n_nonburn / N_SAMPLES, 2),
        "nonburnable_ignited_pct": round(nonburn_ignited_pct, 2),
        "n_dc_sites": len(confirmed),
        "n_dc_sites_on_nonburnable": n_dc_nonburn,
    }
    out_path = os.path.join(BASE, "..", "reports", "wa_nonburnable_ignition.json")
    out_path = os.path.normpath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nSaved {out_path}")


if __name__ == "__main__":
    main()
