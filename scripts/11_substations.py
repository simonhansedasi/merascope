"""
11_substations.py — Substation proximity and voltage score.

Adds to grid_scores.geojson:
  substation_dist_m    — distance to nearest electric substation (meters)
  substation_voltage_kv — voltage class of nearest substation (kV)
  substation_score     — composite of proximity + voltage class (0-1, higher = better)

Source: HIFLD Electric Substations (national, downloaded once to data/shared/)

Usage:
  python 11_substations.py WA
"""

import argparse
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"

# EIA Form 860 Annual Electric Generator Report — reliable, stable URL
# Plants with ≥1 MW capacity → proxy for grid nodes (each plant is substation-connected)
EIA860_URL = "https://www.eia.gov/electricity/data/eia860/xls/eia8602024.zip"
EIA860_URL_FALLBACK = "https://www.eia.gov/electricity/data/eia860/xls/eia8602023.zip"


def capacity_weight(mw):
    """Map plant capacity (MW) to a grid-capacity weight (0-1)."""
    if mw >= 500:
        return 1.0
    if mw >= 100:
        return 0.85
    if mw >= 10:
        return 0.60
    if mw > 0:
        return 0.30
    return 0.10


def fetch_substations(shared_dir):
    """
    Download EIA Form 860 plant data and cache to data/shared/substations.csv.
    Power plants (≥1 MW) are substation-connected; they serve as grid-node proxies.
    Capacity (MW) is used as a voltage proxy (larger plant = higher voltage connection).
    """
    path = shared_dir / "substations.csv"
    if path.exists():
        df = pd.read_csv(path, low_memory=False)
        if len(df) > 0:
            print(f"  Cached: {len(df)} grid nodes (EIA 860)")
            return df

    import io, zipfile
    for url in [EIA860_URL, EIA860_URL_FALLBACK]:
        print(f"  Downloading EIA Form 860 from {url}...")
        try:
            r = requests.get(url, timeout=180,
                             headers={"User-Agent": "datacenter-siting-research/1.0"})
            r.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                # Find the plant-level file (contains lat/lon)
                plant_file = next(
                    (n for n in z.namelist()
                     if "plant" in n.lower() and n.endswith(".xlsx")), None
                )
                if plant_file is None:
                    continue
                with z.open(plant_file) as f:
                    # Header row is often row 2 (0-indexed row 1) in EIA files
                    for skip in [1, 0, 2]:
                        try:
                            df = pd.read_excel(f, header=skip, engine="openpyxl")
                            if "Latitude" in df.columns or "latitude" in df.columns:
                                break
                        except Exception:
                            continue

            df.columns = [str(c).strip() for c in df.columns]
            lat_col = next((c for c in df.columns if c.lower() == "latitude"), None)
            lon_col = next((c for c in df.columns if c.lower() == "longitude"), None)
            cap_col = next((c for c in df.columns
                            if "nameplate" in c.lower() or "capacity" in c.lower()), None)

            if lat_col is None or lon_col is None:
                print(f"  WARNING: lat/lon not found. Columns: {list(df.columns[:10])}")
                continue

            out = pd.DataFrame()
            out["lat"] = pd.to_numeric(df[lat_col], errors="coerce")
            out["lon"] = pd.to_numeric(df[lon_col], errors="coerce")
            out["voltage_kv"] = (
                pd.to_numeric(df[cap_col], errors="coerce").fillna(0)
                if cap_col else 0.0
            )
            out = out.dropna(subset=["lat", "lon"])
            out = out[(out["lat"] > 24) & (out["lat"] < 50) &
                      (out["lon"] > -125) & (out["lon"] < -66)]
            out = out.reset_index(drop=True)
            out.to_csv(path, index=False)
            print(f"  Downloaded: {len(out)} EIA 860 plant locations")
            return out
        except Exception as e:
            print(f"  EIA 860 download failed: {e}")

    return pd.DataFrame(columns=["lat", "lon", "voltage_kv"])


def parse_substations(df):
    """EIA 860 data is already parsed; this pass-through validates it."""
    if "lat" not in df.columns or "lon" not in df.columns:
        return pd.DataFrame(columns=["lat", "lon", "voltage_kv"])
    if "voltage_kv" not in df.columns:
        df = df.copy()
        df["voltage_kv"] = 0.0
    return df.dropna(subset=["lat", "lon"]).reset_index(drop=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    crs_proj = cfg["utm_epsg"]
    shared_dir = root / "data" / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n=== 11_substations: {cfg['name']} ({cfg['abbr']}) ===")

    grid = gpd.read_file(grid_path)
    if "substation_score" in grid.columns:
        print("  substation_score already present; skipping.")
        return
    print(f"  Grid: {len(grid)} cells")

    raw_df = fetch_substations(shared_dir)
    subs = parse_substations(raw_df)
    if len(subs) < 2:
        print("  WARNING: No substation data; setting substation_score=0.5")
        grid["substation_dist_m"] = np.nan
        grid["substation_voltage_kv"] = np.nan
        grid["substation_score"] = 0.5
        grid.to_file(grid_path, driver="GeoJSON")
        return

    print(f"  {len(subs)} CONUS substations loaded")

    # Project to UTM for accurate distances
    subs_gdf = gpd.GeoDataFrame(
        subs,
        geometry=gpd.points_from_xy(subs["lon"], subs["lat"]),
        crs=CRS
    ).to_crs(crs_proj)

    grid_proj = grid.to_crs(crs_proj)
    centroids_proj = np.column_stack([
        [c.x for c in grid_proj.geometry.centroid],
        [c.y for c in grid_proj.geometry.centroid],
    ])
    sub_coords = np.column_stack([subs_gdf.geometry.x, subs_gdf.geometry.y])
    tree = cKDTree(sub_coords)

    # Nearest substation distance and voltage
    dists, idxs = tree.query(centroids_proj, k=1)
    nearest_voltage = subs["voltage_kv"].values[idxs]

    grid["substation_dist_m"] = dists.round(1)
    grid["substation_voltage_kv"] = nearest_voltage.round(0)

    # Score: combine proximity (inverted, normalized) and capacity weight
    p95_dist = np.percentile(dists, 95)
    prox_score = 1.0 - np.clip(dists / max(p95_dist, 1.0), 0, 1)
    cap_weights = np.array([capacity_weight(v) for v in nearest_voltage])
    grid["substation_score"] = np.round(0.6 * prox_score + 0.4 * cap_weights, 4)

    print(f"  substation_dist_m: {dists.min():.0f} - {dists.max():.0f} m")
    print(f"  substation_score: {grid['substation_score'].min():.3f} - {grid['substation_score'].max():.3f}")

    grid.to_file(grid_path, driver="GeoJSON")
    print(f"  Saved {grid_path.name}")


if __name__ == "__main__":
    main()
