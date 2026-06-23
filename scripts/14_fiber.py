"""
14_fiber.py — Fiber infrastructure proximity score.

Adds to grid_scores.geojson:
  fac_dist_m    — distance to nearest carrier hotel / colo facility (meters)
  fiber_score   — normalized proximity score (0-1, higher = better connectivity)

Source: PeeringDB /api/fac (free JSON) — carrier hotel and colo facility locations.
These are the physical points where long-haul fiber routes terminate and interconnect.
PeeringDB /api/ix IX objects do not carry lat/lon; facility records are used instead.

Usage:
  python 14_fiber.py WA
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

PEERINGDB_FAC_URL = "https://www.peeringdb.com/api/fac?depth=2"


def fetch_peeringdb_fac(shared_dir):
    """Download PeeringDB carrier hotel / colo facility locations."""
    path = shared_dir / "peeringdb_fac.csv"
    if path.exists():
        df = pd.read_csv(path)
        if len(df) > 0:
            print(f"  Cached: {len(df)} colo facility locations")
            return df

    print("  Downloading PeeringDB colo facility locations...")
    try:
        r = requests.get(PEERINGDB_FAC_URL, timeout=60,
                         headers={"User-Agent": "datacenter-siting-research/1.0"})
        r.raise_for_status()
        data = r.json().get("data", [])
        rows = []
        for rec in data:
            lat = rec.get("latitude") or rec.get("lat")
            lon = rec.get("longitude") or rec.get("lon")
            if lat is None or lon is None:
                continue
            try:
                lat, lon = float(lat), float(lon)
            except (ValueError, TypeError):
                continue
            rows.append({"lat": lat, "lon": lon, "name": rec.get("name", "")})
        df = pd.DataFrame(rows).dropna(subset=["lat", "lon"])
        df.to_csv(path, index=False)
        print(f"  Downloaded: {len(df)} colo locations")
        return df
    except Exception as e:
        print(f"  PeeringDB fac failed: {e}")
        return pd.DataFrame(columns=["lat", "lon", "name"])


def pt_distance(df, centroids_proj, crs_proj, label):
    """Return distance array from centroids to nearest point in df (projected)."""
    if len(df) < 1:
        print(f"  WARNING: No {label} data; using max-distance fallback")
        return np.full(len(centroids_proj), 5e6)  # 5000 km = worst score

    gdf = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df["lon"], df["lat"]),
        crs=CRS
    ).to_crs(crs_proj)

    coords = np.column_stack([gdf.geometry.x, gdf.geometry.y])
    tree = cKDTree(coords)
    dists, _ = tree.query(centroids_proj, k=1)
    return dists


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    crs_proj = cfg["utm_epsg"]
    shared_dir = root / "data" / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n=== 14_fiber: {cfg['name']} ({cfg['abbr']}) ===")

    grid = gpd.read_file(grid_path)
    if "fiber_score" in grid.columns:
        print("  fiber_score already present; skipping.")
        return
    print(f"  Grid: {len(grid)} cells")

    grid_proj = grid.to_crs(crs_proj)
    centroids_proj = np.column_stack([
        [c.x for c in grid_proj.geometry.centroid],
        [c.y for c in grid_proj.geometry.centroid],
    ])

    # Colo/carrier hotel distances (PeeringDB fac = fiber interconnect points)
    print("  PeeringDB colo/carrier hotel locations...")
    fac_df = fetch_peeringdb_fac(shared_dir)
    fac_dists = pt_distance(fac_df, centroids_proj, crs_proj, "colo")
    grid["fac_dist_m"] = fac_dists.round(1)

    p95_fac = np.percentile(fac_dists[np.isfinite(fac_dists)], 95) or 1.0
    grid["fiber_score"] = np.round(
        1.0 - np.clip(fac_dists / p95_fac, 0, 1), 4
    )

    print(f"  fac_dist_m: {fac_dists.min():.0f} - {fac_dists.max():.0f} m")
    print(f"  fiber_score: {grid['fiber_score'].min():.3f} - {grid['fiber_score'].max():.3f}")

    grid.to_file(grid_path, driver="GeoJSON")
    print(f"  Saved {grid_path.name}")


if __name__ == "__main__":
    main()
