"""
patch_raws_zcta.py — Backfill missing raw columns into ZCTA grid files.

Adds the following columns that were stripped from ZCTA grids during the original
pipeline run (02_zcta_indicators.py was dropping them before saving):

  tx_dist_m        — distance to nearest HV transmission line (m)     [all states]
  ann_precip_mm    — PRISM annual precip (mm/yr)                       [all states]
  seismic_pga_g    — interpolated PGA (g)                              [WA only — skipped steps 03+08]
  aquifer_depth_ft — interpolated depth to water table (ft)            [WA only — skipped steps 03+08]

Usage:
  python3 scripts/patch_raws_zcta.py              # all 48 states
  python3 scripts/patch_raws_zcta.py WA TX CA     # specific states
"""

import argparse
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from PIL import Image
from scipy.spatial import cKDTree

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))
from config import get_state, PROJECT_ROOT

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"

PRISM_TIF = PROJECT_ROOT / "data" / "prism_ppt_30yr.tif"
PRISM_XMIN = -125.0208333
PRISM_XMAX = -66.4791667
PRISM_YMIN = 24.0625
PRISM_YMAX = 49.9375

IDW_K = 8
IDW_POWER = 2

ALL_STATES = [
    "AL","AR","AZ","CA","CO","CT","DE","FL","GA","IA","ID","IL","IN","KS","KY",
    "LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM",
    "NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA",
    "WI","WV","WY",
]


def idw_k(src_pts, src_vals, tgt_pts, k=IDW_K, power=IDW_POWER):
    k = min(k, len(src_pts))
    tree = cKDTree(src_pts)
    dists, idxs = tree.query(tgt_pts, k=k)
    if k == 1:
        dists = dists[:, np.newaxis]
        idxs = idxs[:, np.newaxis]
    exact = dists[:, 0] == 0
    weights = 1.0 / np.where(dists == 0, 1e-10, dists) ** power
    weights /= weights.sum(axis=1, keepdims=True)
    interp = (weights * src_vals[idxs]).sum(axis=1)
    interp[exact] = src_vals[idxs[exact, 0]]
    return interp


def patch_tx_dist(grid, raw, cfg):
    if "tx_dist_m" in grid.columns:
        return
    tx_path = raw / "transmission.geojson"
    if not tx_path.exists():
        print("  transmission.geojson not found; skipping tx_dist_m")
        return
    tx_gdf = gpd.read_file(tx_path)
    if len(tx_gdf) == 0:
        print("  transmission.geojson empty; skipping tx_dist_m")
        return
    crs_proj = cfg["utm_epsg"]
    tx_proj = tx_gdf.to_crs(crs_proj)
    tx_union = tx_proj.geometry.unary_union
    grid_proj = grid.to_crs(crs_proj)
    centroids = list(grid_proj.geometry.centroid)
    print(f"  computing tx distances for {len(centroids)} ZCTAs...")
    grid["tx_dist_m"] = [tx_union.distance(pt) for pt in centroids]
    print(f"  tx_dist_m: {grid.tx_dist_m.min():.0f} - {grid.tx_dist_m.max():.0f} m")


def patch_precip(grid):
    if "ann_precip_mm" in grid.columns:
        return
    if not PRISM_TIF.exists():
        print(f"  {PRISM_TIF} not found; skipping ann_precip_mm")
        return
    nrows_img, ncols_img = None, None
    img = Image.open(PRISM_TIF)
    arr = np.array(img, dtype=np.float64)
    nrows_img, ncols_img = arr.shape
    dx = (PRISM_XMAX - PRISM_XMIN) / ncols_img
    dy = (PRISM_YMAX - PRISM_YMIN) / nrows_img
    centroids = grid.geometry.centroid
    vals = []
    for pt in centroids:
        col = int((pt.x - PRISM_XMIN) / dx)
        row = int((PRISM_YMAX - pt.y) / dy)
        col = max(0, min(col, ncols_img - 1))
        row = max(0, min(row, nrows_img - 1))
        v = arr[row, col]
        vals.append(float(v) if v > 0 else np.nan)
    arr_out = np.array(vals)
    med = float(np.nanmedian(arr_out))
    arr_out = np.where(np.isnan(arr_out), med, arr_out)
    grid["ann_precip_mm"] = arr_out
    print(f"  ann_precip_mm: {arr_out.min():.1f} - {arr_out.max():.1f} mm/yr")


def patch_seismic(grid, raw):
    if "seismic_pga_g" in grid.columns:
        return
    seismic_path = raw / "seismic_sample.csv"
    if not seismic_path.exists():
        print("  seismic_sample.csv not found; skipping seismic_pga_g")
        return
    df = pd.read_csv(seismic_path)
    centroids = grid.geometry.centroid
    tgt = np.column_stack([[p.y for p in centroids], [p.x for p in centroids]])
    src = df[["lat", "lon"]].values
    interp = idw_k(src, df["pgam"].values, tgt)
    grid["seismic_pga_g"] = interp.round(4)
    print(f"  seismic_pga_g: {interp.min():.4f} - {interp.max():.4f} g")


def patch_aquifer(grid, raw):
    if "aquifer_depth_ft" in grid.columns:
        return
    cache = raw / "well_depths.csv"
    if not cache.exists():
        print("  well_depths.csv not found; skipping aquifer_depth_ft")
        return
    df = pd.read_csv(cache).dropna(subset=["lat", "lon", "depth_ft"])
    if len(df) < 2:
        print("  insufficient well data; skipping aquifer_depth_ft")
        return
    centroids = grid.geometry.centroid
    tgt = np.column_stack([[p.x for p in centroids], [p.y for p in centroids]])
    src = df[["lon", "lat"]].values
    interp = idw_k(src, df["depth_ft"].values, tgt)
    grid["aquifer_depth_ft"] = interp.round(1)
    print(f"  aquifer_depth_ft: {interp.min():.1f} - {interp.max():.1f} ft")


def patch_state(abbr):
    cfg = get_state(abbr.upper())
    raw = PROJECT_ROOT / "data" / abbr.upper() / "raw"
    grid_path = PROJECT_ROOT / "data" / abbr.upper() / "zcta" / "grid_scores.geojson"

    if not grid_path.exists():
        print(f"  {grid_path} not found; skipping {abbr}")
        return

    grid = gpd.read_file(grid_path)
    print(f"  {len(grid)} ZCTAs, {len(grid.columns)} columns before patch")

    patch_tx_dist(grid, raw, cfg)
    patch_precip(grid)
    patch_seismic(grid, raw)
    patch_aquifer(grid, raw)

    grid.to_file(grid_path, driver="GeoJSON")
    added = [c for c in ["tx_dist_m", "ann_precip_mm", "seismic_pga_g", "aquifer_depth_ft"]
             if c in grid.columns]
    print(f"  Saved. Raw cols present: {added}")


def main():
    parser = argparse.ArgumentParser(description="Backfill raw columns into ZCTA grid files.")
    parser.add_argument("states", nargs="*", help="State abbrs (default: all 48)")
    args = parser.parse_args()

    states = [s.upper() for s in args.states] if args.states else ALL_STATES

    for abbr in states:
        print(f"\n=== patch_raws_zcta: {abbr} ===")
        try:
            patch_state(abbr)
        except Exception as e:
            print(f"  ERROR: {e}")


if __name__ == "__main__":
    main()
