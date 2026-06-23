"""
13_air_quality.py — EPA NAAQS non-attainment status.

Adds to grid_scores.geojson:
  naaqs_nonattainment  — 1 if cell's county is in attainment, 0 if non-attainment
  air_quality_score    — same as naaqs_nonattainment (float for consistency)

Source: EPA Green Book GIS non-attainment area shapefile (downloaded once to data/shared/)

Non-attainment for PM2.5, PM10, or Ozone flags backup diesel generator permitting risk.

Usage:
  python 13_air_quality.py WA
"""

import argparse
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import Point

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"

# EPA Green Book ArcGIS REST MapServer (updated weekly, no download URL needed)
GREEN_BOOK_REST = (
    "https://gispub.epa.gov/arcgis/rest/services/OAR_OAQPS/NonattainmentAreas/MapServer"
)
# Layer IDs for current standards (most relevant for large facility permitting)
NAAQS_LAYERS = {
    "ozone_2015": 2,   # Ozone 8-hr 2015 standard
    "ozone_2008": 1,   # Ozone 8-hr 2008 standard
    "pm25_2012":  7,   # PM2.5 Annual 2012 standard
    "pm10_1987":  8,   # PM10 1987 standard
}
SHARED_GEOJSON = "naaqs_nonattainment.geojson"


def _query_naaqs_layer(layer_id, layer_name):
    """Query one NAAQS layer for all features. Returns list of GeoJSON-like polygons."""
    # Request all features (no state filter — small dataset, <200 features per layer)
    url = (f"{GREEN_BOOK_REST}/{layer_id}/query"
           f"?where=1%3D1&outFields=OBJECTID&returnGeometry=true"
           f"&f=geojson&geometryPrecision=4")
    try:
        r = requests.get(url, timeout=60,
                         headers={"User-Agent": "datacenter-siting-research/1.0"})
        r.raise_for_status()
        gdf = gpd.read_file(r.text)
        if len(gdf) > 0:
            print(f"    Layer {layer_name}: {len(gdf)} non-attainment areas")
            return gdf.to_crs(CRS)[["geometry"]]
    except Exception as e:
        print(f"    Layer {layer_name} failed: {e}")
    return gpd.GeoDataFrame(columns=["geometry"], crs=CRS)


def fetch_nonattainment(shared_dir):
    """Query EPA Green Book ArcGIS REST service and cache as GeoJSON."""
    path = shared_dir / SHARED_GEOJSON
    if path.exists():
        gdf = gpd.read_file(path)
        print(f"  Cached: {len(gdf)} non-attainment polygons")
        return gdf

    print("  Querying EPA Green Book NAAQS REST service...")
    layers = []
    for name, lid in NAAQS_LAYERS.items():
        gdf = _query_naaqs_layer(lid, name)
        if len(gdf) > 0:
            layers.append(gdf)

    if not layers:
        print("  WARNING: No NAAQS data retrieved")
        return gpd.GeoDataFrame(columns=["geometry"], crs=CRS)

    combined = gpd.GeoDataFrame(
        pd.concat(layers, ignore_index=True), crs=CRS
    )
    # Repair invalid geometries before dissolve (EPA polygons sometimes have topology issues)
    combined["geometry"] = combined["geometry"].buffer(0)
    # Dissolve overlapping polygons from different standards
    combined = combined.dissolve().explode(index_parts=False).reset_index(drop=True)
    combined.to_file(path, driver="GeoJSON")
    print(f"  Cached: {len(combined)} non-attainment polygons total")
    return combined


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    shared_dir = root / "data" / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n=== 13_air_quality: {cfg['name']} ({cfg['abbr']}) ===")

    grid = gpd.read_file(grid_path)
    if "air_quality_score" in grid.columns:
        print("  air_quality_score already present; skipping.")
        return
    print(f"  Grid: {len(grid)} cells")

    naaqs = fetch_nonattainment(shared_dir)

    if len(naaqs) == 0:
        print("  No non-attainment data; setting air_quality_score=1.0 (all attainment)")
        grid["naaqs_nonattainment"] = 1
        grid["air_quality_score"] = 1.0
        grid.to_file(grid_path, driver="GeoJSON")
        return

    # Clip to state bbox to speed up spatial join
    w, s, e, n = cfg["bbox"]
    naaqs_state = naaqs.cx[w:e, s:n]
    print(f"  {len(naaqs_state)} non-attainment polygons in state bbox")

    # Build centroid GDF for spatial join
    centroids = grid.geometry.centroid
    cent_gdf = gpd.GeoDataFrame(
        {"cell_idx": range(len(grid))},
        geometry=centroids,
        crs=CRS
    )

    if len(naaqs_state) > 0:
        # Spatial join: which centroids fall inside a non-attainment polygon?
        joined = gpd.sjoin(cent_gdf, naaqs_state[["geometry"]], how="left", predicate="within")
        nonattainment_idx = set(joined[joined["index_right"].notna()]["cell_idx"].tolist())
    else:
        nonattainment_idx = set()

    flags = np.ones(len(grid), dtype=int)
    for i in nonattainment_idx:
        flags[i] = 0  # 0 = non-attainment (bad for permitting)

    grid["naaqs_nonattainment"] = flags
    grid["air_quality_score"] = flags.astype(float)

    n_nonatt = int((flags == 0).sum())
    print(f"  Non-attainment cells: {n_nonatt} / {len(grid)}")

    grid.to_file(grid_path, driver="GeoJSON")
    print(f"  Saved {grid_path.name}")


if __name__ == "__main__":
    main()
