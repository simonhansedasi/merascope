"""
15_water_stress.py — WRI Aqueduct watershed water stress score.

Adds to grid_scores.geojson:
  water_stress_raw    — baseline water stress score (0-5 from Aqueduct; higher = more stressed)
  water_stress_score  — normalized (0-1, higher = LESS stressed = better site)

Does NOT modify water_score (PRISM precipitation stays per CLAUDE.md).

Source: WRI Aqueduct Water Risk Atlas 3.0 watershed polygons
  Downloaded once to data/shared/aqueduct_watersheds.gpkg

Usage:
  python 15_water_stress.py WA
"""

import argparse
import os
import shutil
import sys
import warnings
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"

AQUEDUCT_URL = (
    "https://wri-projects.s3.amazonaws.com/Aqueduct30/finalData/"
    "Y2019M07D12_Aqueduct30_V01.zip"
)
SHARED_GPKG = "aqueduct_watersheds.gpkg"
# Clip to CONUS on first download so the cached file stays small (~30-60 MB).
CONUS_BBOX = (-125.0, 24.0, -67.0, 50.0)


def fetch_aqueduct(shared_dir):
    """Download WRI Aqueduct, clip to CONUS, cache to data/shared/."""
    path = shared_dir / SHARED_GPKG
    if path.exists():
        try:
            gdf = gpd.read_file(path)
            if len(gdf) > 0:
                print(f"  Cached: {len(gdf)} Aqueduct watersheds (CONUS)")
                return gdf
        except Exception:
            pass

    zip_path  = shared_dir / "aqueduct_dl.zip"
    ext_dir   = shared_dir / "aqueduct_tmp"

    print("  Downloading WRI Aqueduct Water Risk Atlas (streaming to disk)...")
    try:
        r = requests.get(AQUEDUCT_URL, timeout=600, stream=True,
                         headers={"User-Agent": "datacenter-siting-research/1.0"})
        r.raise_for_status()
        total = 0
        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)
                total += len(chunk)
        print(f"  Downloaded {total / 1e6:.1f} MB → {zip_path.name}")

        ext_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(ext_dir)

        gpkg_files = sorted(ext_dir.rglob("*.gpkg"))
        shp_files  = sorted(ext_dir.rglob("*.shp"))
        if gpkg_files:
            src = gpkg_files[0]
        elif shp_files:
            src = shp_files[0]
        else:
            print("  ERROR: No gpkg or shp in Aqueduct ZIP")
            return gpd.GeoDataFrame(columns=["geometry"], crs=CRS)

        print(f"  Reading {src.name}, clipping to CONUS...")
        gdf = gpd.read_file(src, bbox=CONUS_BBOX).to_crs(CRS)
        gdf.to_file(path, driver="GPKG")
        print(f"  Saved CONUS clip: {len(gdf)} watersheds")
        return gdf

    except Exception as e:
        print(f"  Aqueduct download failed: {e}")
        return gpd.GeoDataFrame(columns=["geometry"], crs=CRS)
    finally:
        if zip_path.exists():
            zip_path.unlink()
        if ext_dir.exists():
            shutil.rmtree(ext_dir, ignore_errors=True)


def find_stress_column(gdf):
    """Find the baseline water stress score column in Aqueduct data."""
    candidates = ["bws_score", "bws_cat", "bws_label", "BWS_SCORE", "BWS_CAT"]
    for c in candidates:
        if c in gdf.columns:
            return c
    # Look for any column with 'bws' in name
    bws_cols = [c for c in gdf.columns if "bws" in c.lower()]
    return bws_cols[0] if bws_cols else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    shared_dir = root / "data" / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n=== 15_water_stress: {cfg['name']} ({cfg['abbr']}) ===")

    grid = gpd.read_file(grid_path)
    if "water_stress_score" in grid.columns:
        print("  water_stress_score already present; skipping.")
        return
    print(f"  Grid: {len(grid)} cells")

    aqueduct = fetch_aqueduct(shared_dir)

    if len(aqueduct) == 0:
        print("  No Aqueduct data; setting water_stress_score=0.5 (neutral)")
        grid["water_stress_raw"] = np.nan
        grid["water_stress_score"] = 0.5
        grid.to_file(grid_path, driver="GeoJSON")
        return

    stress_col = find_stress_column(aqueduct)
    if stress_col is None:
        print(f"  WARNING: Cannot find stress column. Columns: {list(aqueduct.columns[:10])}")
        grid["water_stress_raw"] = np.nan
        grid["water_stress_score"] = 0.5
        grid.to_file(grid_path, driver="GeoJSON")
        return

    print(f"  Using stress column: {stress_col}")

    # Convert stress scores to numeric (Aqueduct uses -1 for no data, 0-5 for stress)
    aqueduct[stress_col] = pd.to_numeric(aqueduct[stress_col], errors="coerce")
    aqueduct = aqueduct[aqueduct[stress_col] >= 0].copy()  # Drop no-data rows

    # Clip to state bbox for speed
    w, s, e, n = cfg["bbox"]
    aqueduct_state = aqueduct.cx[w:e, s:n]
    print(f"  {len(aqueduct_state)} watersheds in state bbox")

    # Spatial join: each cell centroid → watershed it falls in
    centroids_gdf = gpd.GeoDataFrame(
        {"cell_idx": range(len(grid))},
        geometry=grid.geometry.centroid,
        crs=CRS
    )

    if len(aqueduct_state) > 0:
        joined = gpd.sjoin(centroids_gdf, aqueduct_state[[stress_col, "geometry"]],
                           how="left", predicate="within")
        # If multiple matches, take first
        joined = joined.reset_index(drop=True)
        stress_vals = joined.groupby("cell_idx")[stress_col].first()
    else:
        stress_vals = pd.Series(dtype=float)

    raw_arr = np.full(len(grid), np.nan)
    for i, v in stress_vals.items():
        if not pd.isna(v):
            raw_arr[i] = float(v)

    # For cells with no watershed match, interpolate from neighbors using median
    valid_mask = ~np.isnan(raw_arr)
    if valid_mask.sum() > 0:
        median_stress = np.nanmedian(raw_arr)
        raw_arr[~valid_mask] = median_stress
    else:
        raw_arr[:] = 2.5  # Neutral

    grid["water_stress_raw"] = np.round(raw_arr, 4)

    # Normalize: invert so lower stress = higher score
    min_s = raw_arr.min()
    max_s = raw_arr.max()
    if max_s > min_s:
        normalized = 1.0 - (raw_arr - min_s) / (max_s - min_s)
    else:
        normalized = np.ones(len(grid)) * 0.5

    grid["water_stress_score"] = np.round(normalized, 4)

    print(f"  water_stress_raw: {raw_arr.min():.2f} - {raw_arr.max():.2f}")
    print(f"  water_stress_score: {grid['water_stress_score'].min():.3f} - {grid['water_stress_score'].max():.3f}")

    grid.to_file(grid_path, driver="GeoJSON")
    print(f"  Saved {grid_path.name}")


if __name__ == "__main__":
    main()
