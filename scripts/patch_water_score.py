"""
patch_water_score.py — Update water_score in existing grid_scores.geojson using PRISM.

Fixes states scored before 02_indicators.py switched water_score to direct PRISM
raster sampling — an earlier run instead IDW-interpolated water_score from sparse
point data, which produced visible interpolation-artifact banding/blobs at state
scale. This patch resamples PRISM directly per this file's sample_prism() (same
approach 02_indicators.py now uses going forward) and overwrites water_score in
place. Drops any stray ann_precip_mm left over from the old approach so it
doesn't collide with patch_raws.py's own (correctly-sourced) ann_precip_mm.

Usage:
  python patch_water_score.py WA OR TX CA NV UT
"""

import argparse
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

PRISM_WEST  = -125.0208333
PRISM_NORTH = 49.9375000
PRISM_PIXEL = 1.0 / 24.0


def load_prism(root):
    tif = root / "data" / "prism_ppt_30yr.tif"
    if not tif.exists():
        raise FileNotFoundError(f"PRISM raster not found at {tif}")
    return np.array(Image.open(tif), dtype=np.float32)


def sample_prism(arr, lons, lats):
    cols = np.round((lons - PRISM_WEST) / PRISM_PIXEL).astype(int)
    rows = np.round((PRISM_NORTH - lats) / PRISM_PIXEL).astype(int)
    nrows, ncols = arr.shape
    cols = np.clip(cols, 0, ncols - 1)
    rows = np.clip(rows, 0, nrows - 1)
    vals = arr[rows, cols].astype(float)
    vals[vals < -9000] = np.nan
    return vals


def patch_state(abbr, prism_arr):
    cfg = get_state(abbr)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])

    if not grid_path.exists():
        print(f"  {abbr}: grid_scores.geojson not found — skipping")
        return

    grid = gpd.read_file(grid_path)
    centroids = grid.geometry.centroid
    lons = np.array([p.x for p in centroids])
    lats = np.array([p.y for p in centroids])

    ann_precip = sample_prism(prism_arr, lons, lats)
    p05, p95 = np.nanpercentile(ann_precip, [5, 95])
    water_score = ((ann_precip - p05) / max(p95 - p05, 1e-6)).clip(0, 1)
    water_score = np.where(np.isnan(water_score), np.nanmean(water_score), water_score)

    grid["water_score"] = np.round(water_score, 4)
    grid.drop(columns=["ann_precip_mm"], errors="ignore", inplace=True)

    grid.to_file(grid_path, driver="GeoJSON")
    print(f"  {abbr}: water_score {grid.water_score.min():.3f}-{grid.water_score.max():.3f}  "
          f"precip {np.nanmin(ann_precip):.0f}-{np.nanmax(ann_precip):.0f} mm/yr")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("states", nargs="+")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    prism_arr = load_prism(root)
    print(f"Loaded PRISM: {prism_arr.shape}")

    for abbr in args.states:
        print(f"Patching {abbr.upper()}...")
        patch_state(abbr.upper(), prism_arr)

    print("Done.")


if __name__ == "__main__":
    main()
