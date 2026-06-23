"""
12_superfund.py — Superfund NPL and RCRA corrective action site proximity.

Adds to grid_scores.geojson:
  superfund_dist_m  — distance to nearest Superfund NPL site (meters)
  rcra_dist_m       — distance to nearest RCRA corrective action site (meters)
  superfund_score   — normalized proximity score (0-1, higher = farther = better)
  rcra_score        — normalized proximity score (0-1, higher = farther = better)

Source: EPA Envirofacts REST API (same pattern as 04_environment.py TRI fetch)

Usage:
  python 12_superfund.py WA
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


EPA_EFPOINTS = "https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer"
# Layer 0 = Superfund NPL, Layer 4 = Hazardous waste (RCRA)


def _fetch_efpoints_layer(layer_id, abbr, cache_path, label):
    """
    Query EPA efpoints ArcGIS REST service for a given layer + state.
    Returns DataFrame with lat, lon, name columns.
    """
    if cache_path.exists():
        df = pd.read_csv(cache_path)
        if len(df) > 0:
            print(f"  Cached: {len(df)} {label} sites for {abbr}")
            return df

    url = (f"{EPA_EFPOINTS}/{layer_id}/query"
           f"?where=state_code+%3D+%27{abbr}%27"
           f"&outFields=latitude%2Clongitude%2Cprimary_name"
           f"&f=json&resultRecordCount=2000")
    try:
        r = requests.get(url, timeout=90,
                         headers={"User-Agent": "datacenter-siting-research/1.0"})
        r.raise_for_status()
        data = r.json()
        features = data.get("features", [])
        rows = []
        for feat in features:
            attrs = feat.get("attributes", {})
            lat = _parse_coord(attrs.get("latitude"))
            lon = _parse_coord(attrs.get("longitude"))
            if lat is None or lon is None:
                # Fall back to geometry
                geom = feat.get("geometry", {})
                if geom:
                    lon = _parse_coord(geom.get("x"))
                    lat = _parse_coord(geom.get("y"))
            if lat is None or lon is None:
                continue
            if not (24 < lat < 50 and -130 < lon < -66):
                continue
            rows.append({"lat": lat, "lon": lon,
                          "name": attrs.get("primary_name", "")})
        df = pd.DataFrame(rows).dropna(subset=["lat", "lon"])
        df.to_csv(cache_path, index=False)
        print(f"  {label} API: {len(df)} sites for {abbr}")
        return df
    except Exception as e:
        print(f"  {label} API failed: {e}")

    df = pd.DataFrame(columns=["lat", "lon", "name"])
    df.to_csv(cache_path, index=False)
    return df


def fetch_superfund(abbr, raw):
    return _fetch_efpoints_layer(0, abbr, raw / "superfund_sites.csv", "Superfund")


def fetch_rcra(abbr, raw):
    return _fetch_efpoints_layer(4, abbr, raw / "rcra_sites.csv", "RCRA")


def _parse_coord(v):
    if v is None:
        return None
    try:
        f = float(v)
        return f if f != 0 else None
    except (ValueError, TypeError):
        return None


def dist_score(sites_df, centroids_proj, grid_proj, crs_proj):
    """Return (dist_m array, score array) from a sites DataFrame."""
    if len(sites_df) < 1:
        n = len(centroids_proj)
        return np.full(n, np.nan), np.ones(n)

    sites_gdf = gpd.GeoDataFrame(
        sites_df,
        geometry=gpd.points_from_xy(sites_df["lon"], sites_df["lat"]),
        crs=CRS
    ).to_crs(crs_proj)

    coords = np.column_stack([sites_gdf.geometry.x, sites_gdf.geometry.y])
    tree = cKDTree(coords)
    dists, _ = tree.query(centroids_proj, k=1)
    score = np.clip(dists / max(np.percentile(dists, 95), 1.0), 0, 1)
    return dists.round(1), np.round(score, 4)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    crs_proj = cfg["utm_epsg"]
    print(f"\n=== 12_superfund: {cfg['name']} ({cfg['abbr']}) ===")

    grid = gpd.read_file(grid_path)
    if "superfund_score" in grid.columns and "rcra_score" in grid.columns:
        print("  superfund_score + rcra_score already present; skipping.")
        return
    print(f"  Grid: {len(grid)} cells")

    grid_proj = grid.to_crs(crs_proj)
    centroids_proj = np.column_stack([
        [c.x for c in grid_proj.geometry.centroid],
        [c.y for c in grid_proj.geometry.centroid],
    ])

    print("  Fetching Superfund NPL sites...")
    sf_df = fetch_superfund(cfg["abbr"], raw)
    grid["superfund_dist_m"], grid["superfund_score"] = dist_score(
        sf_df, centroids_proj, grid_proj, crs_proj)
    print(f"  superfund_score: {grid['superfund_score'].min():.3f} - {grid['superfund_score'].max():.3f}")

    print("  Fetching RCRA corrective action sites...")
    rc_df = fetch_rcra(cfg["abbr"], raw)
    grid["rcra_dist_m"], grid["rcra_score"] = dist_score(
        rc_df, centroids_proj, grid_proj, crs_proj)
    print(f"  rcra_score: {grid['rcra_score'].min():.3f} - {grid['rcra_score'].max():.3f}")

    grid.to_file(grid_path, driver="GeoJSON")
    print(f"  Saved {grid_path.name}")


if __name__ == "__main__":
    main()
