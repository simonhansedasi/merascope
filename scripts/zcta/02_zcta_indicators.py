"""
02_zcta_indicators.py — Build ZCTA grid and compute stress indicators.

ZCTA (ZIP Code Tabulation Areas) are the base geography for municipal-scale studies.
Unlike the uniform fishnet, ZCTAs follow population density — useful when the deliverable
is a jurisdiction study where the client thinks in census geographies.

NOTE: For the state-wide atlas, use scripts/02_indicators.py (fishnet). This script is
for the ZCTA study tier: finer resolution in dense areas, aligned with how planning
agencies and municipalities report demographic and land-use data.

Output: data/{STATE}/zcta/grid_scores.geojson
  zcta               — 5-digit ZCTA code (replaces cell_id)
  tx_score, water_score, ej_score, pop_exposure_score

Subsequent risk/environment/terrain/protected scripts (03-07) from the parent pipeline
are geometry-agnostic and run unchanged via DC_SUBDIR=zcta (handled by run_zcta_study.py).

Usage:
  python zcta/02_zcta_indicators.py WA
"""

import argparse
import io
import os
import sys
import time
import warnings
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import Point

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS_DIR))
from config import get_state, PROJECT_ROOT

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"
DARK_BG = "#1a1a2e"
WHITE = "white"

ZCTA_CB_URL  = "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip"
ZCTA_CB_DIR  = PROJECT_ROOT / "data" / "raw" / "zcta_cb"
PRISM_TIF    = PROJECT_ROOT / "data" / "prism_ppt_30yr.tif"
# PRISM CONUS extent (standard 800 m / 4 km products share this bounding box)
_PRISM_XMIN, _PRISM_XMAX = -125.0208333, -66.4791667
_PRISM_YMIN, _PRISM_YMAX =   24.0625,     49.9375


def get_zcta_paths(state_abbr):
    """Return paths for the ZCTA study output (data/{STATE}/zcta/)."""
    root = PROJECT_ROOT / "data" / state_abbr
    raw = root / "raw"
    processed = root / "processed"
    zcta_root = root / "zcta"
    zcta_root.mkdir(parents=True, exist_ok=True)
    raw.mkdir(parents=True, exist_ok=True)
    processed.mkdir(parents=True, exist_ok=True)
    return root, raw, processed, zcta_root / "grid_scores.geojson"


def fetch_zcta(state_gdf, zcta_root):
    """Download Census 500k ZCTA boundaries clipped to state. Cached in zcta/ subdir."""
    path = zcta_root / "zcta.geojson"
    if path.exists():
        return gpd.read_file(path)
    if not (ZCTA_CB_DIR / "cb_2020_us_zcta520_500k.shp").exists():
        print("  Downloading national ZCTA cartographic boundaries (~14 MB)...")
        r = requests.get(ZCTA_CB_URL, timeout=300)
        r.raise_for_status()
        ZCTA_CB_DIR.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            z.extractall(ZCTA_CB_DIR)
        print(f"  Cached to {ZCTA_CB_DIR}")
    print("  Filtering ZCTAs to state boundary...")
    national = gpd.read_file(ZCTA_CB_DIR / "cb_2020_us_zcta520_500k.shp").to_crs(CRS)
    state_union = state_gdf.geometry.union_all()
    mask = national.geometry.centroid.within(state_union)
    zcta = national[mask][["ZCTA5CE20", "geometry"]].copy()
    zcta = zcta.rename(columns={"ZCTA5CE20": "zcta"}).reset_index(drop=True)
    zcta.to_file(path, driver="GeoJSON")
    print(f"  Saved {len(zcta)} ZCTAs to {path}")
    return zcta


def load_census_key():
    key = os.environ.get("CENSUS_API_KEY")
    if key:
        return key
    for env_file in [PROJECT_ROOT / ".env", Path("/home/simonhans/coding/snotrac/.env"), Path.home() / ".env"]:
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("CENSUS_API_KEY"):
                    return line.split("=", 1)[1].strip()
    raise RuntimeError("Census API key not found. Set CENSUS_API_KEY env var or add to ~/.env")


def fetch_acs_zcta(zcta_codes, zcta_root):
    """Download ACS 5-year data at ZCTA level, filtered to state ZCTAs."""
    path = zcta_root / "acs_demog.csv"
    if path.exists():
        df = pd.read_csv(path, dtype={"zcta": str})
        if "pop" in df.columns and "zcta" in df.columns:
            return df
        print("  Cache missing required columns; re-fetching...")
    key = load_census_key()
    params = {
        "get": "NAME,B17001_001E,B17001_002E,B02001_001E,B02001_002E,B01003_001E",
        "for": "zip code tabulation area:*",
        "key": key,
    }
    print("  Downloading ACS 5-year ZCTA data (national, ~33K rows)...")
    r = requests.get("https://api.census.gov/data/2022/acs/acs5", params=params, timeout=180)
    r.raise_for_status()
    rows = r.json()
    df = pd.DataFrame(rows[1:], columns=rows[0])
    for col in ["B17001_001E", "B17001_002E", "B02001_001E", "B02001_002E", "B01003_001E"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["zcta"] = df["zip code tabulation area"].astype(str).str.zfill(5)
    df["poverty_rate"] = (df["B17001_002E"] / df["B17001_001E"]).clip(0, 1)
    df["minority_rate"] = (1 - df["B02001_002E"] / df["B02001_001E"]).clip(0, 1)
    df["demog_index"] = (df["poverty_rate"] + df["minority_rate"]) / 2
    df["pop"] = df["B01003_001E"]
    state_df = df[df["zcta"].isin(zcta_codes)][
        ["zcta", "poverty_rate", "minority_rate", "demog_index", "pop"]
    ].copy()
    state_df.to_csv(path, index=False)
    print(f"  Saved {len(state_df)} state ZCTAs to {path.name}")
    return state_df


def sample_prism_precip(grid):
    """Read annual precipitation (mm) for each ZCTA centroid directly from PRISM TIF."""
    from PIL import Image
    print(f"  reading PRISM TIF: {PRISM_TIF}", flush=True)
    img = Image.open(PRISM_TIF)
    data = np.array(img, dtype=np.float64)
    nrows, ncols = data.shape
    dx = (_PRISM_XMAX - _PRISM_XMIN) / ncols
    dy = (_PRISM_YMAX - _PRISM_YMIN) / nrows
    centroids = grid.geometry.centroid
    vals = []
    for pt in centroids:
        col = int((pt.x - _PRISM_XMIN) / dx)
        row = int((_PRISM_YMAX - pt.y) / dy)
        col = max(0, min(col, ncols - 1))
        row = max(0, min(row, nrows - 1))
        v = data[row, col]
        vals.append(float(v) if v > 0 else np.nan)
    arr = np.array(vals)
    # Fill any nodata with state median
    med = float(np.nanmedian(arr))
    arr = np.where(np.isnan(arr), med, arr)
    print(f"  PRISM precip: {arr.min():.1f} - {arr.max():.1f} mm/yr", flush=True)
    return arr


def fetch_precip(state_gdf, raw):
    path = raw / "precip_coarse.csv"
    if path.exists():
        return pd.read_csv(path)
    bounds = state_gdf.total_bounds
    state_union = state_gdf.geometry.union_all()
    sample_lats = np.linspace(bounds[1] + 0.4, bounds[3] - 0.2, 7)
    sample_lons = np.linspace(bounds[0] + 0.4, bounds[2] - 0.2, 11)
    pts = [(round(lat, 2), round(lon, 2))
           for lat in sample_lats for lon in sample_lons
           if state_union.contains(Point(lon, lat))]
    print(f"  fetching {len(pts)} precip points in one batch request...", flush=True)

    BATCH = 50
    records = []
    for batch_start in range(0, len(pts), BATCH):
        batch = pts[batch_start:batch_start + BATCH]
        lats = ",".join(str(p[0]) for p in batch)
        lons = ",".join(str(p[1]) for p in batch)
        params = {
            "latitude": lats, "longitude": lons,
            "start_date": "1991-01-01", "end_date": "2020-12-31",
            "daily": "precipitation_sum", "timezone": "UTC",
        }
        delay = 30
        for attempt in range(8):
            try:
                r = requests.get("https://archive-api.open-meteo.com/v1/archive",
                                 params=params, timeout=120)
                if r.status_code == 429:
                    print(f"  Rate limited (batch {batch_start//BATCH+1}) — waiting {delay}s...", flush=True)
                    time.sleep(delay)
                    delay = min(delay * 2, 300)
                    continue
                r.raise_for_status()
                results = r.json()
                # Batch response is a list when multiple locations are requested
                if isinstance(results, dict):
                    results = [results]
                for i, res in enumerate(results):
                    lat, lon = batch[i]
                    vals = [v for v in res["daily"]["precipitation_sum"] if v is not None]
                    if vals:
                        records.append({"lat": lat, "lon": lon, "ann_precip_mm": sum(vals) / 30.0})
                print(f"  batch {batch_start//BATCH+1}: {len(results)} locations OK", flush=True)
                time.sleep(2.0)
                break
            except Exception as e:
                if attempt == 7:
                    print(f"  batch {batch_start//BATCH+1} failed after retries: {e}", flush=True)
                else:
                    print(f"  batch retry {attempt+1} in {delay}s: {e}", flush=True)
                    time.sleep(delay)
                    delay = min(delay * 2, 300)

    df = pd.DataFrame(records)
    df.to_csv(path, index=False)
    print(f"  Saved {len(df)} precip points to {path.name}", flush=True)
    return df


# Fallback-only IDW (used when PRISM_TIF is missing, see fetch_precip() below) —
# a plain O(n*m) brute-force distance loop rather than the cKDTree-based idw_k()
# used elsewhere in the pipeline (03/05/08/09/10/patch_raws.py). Fine here since
# it only ever runs over one state's ~7x11 sample points, not full grid scale.
def idw(src_lats, src_lons, src_vals, tgt_lats, tgt_lons, power=2):
    results = []
    for lat, lon in zip(tgt_lats, tgt_lons):
        dists = np.sqrt((src_lats - lat) ** 2 + (src_lons - lon) ** 2)
        dists = np.maximum(dists, 1e-10)
        w = 1.0 / dists ** power
        results.append(float(np.sum(w * src_vals) / np.sum(w)))
    return results


def main():
    parser = argparse.ArgumentParser(description="Build ZCTA grid and compute stress indicators.")
    parser.add_argument("state", help="Two-letter state abbreviation (e.g. WA)")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_zcta_paths(cfg["abbr"])
    zcta_root = grid_path.parent
    crs_proj = cfg["utm_epsg"]
    print(f"\n=== 02_zcta_indicators: {cfg['name']} ({cfg['abbr']}) ===")
    print(f"  Output: {grid_path}")

    state = gpd.read_file(raw / "state.geojson")
    tx_gdf = gpd.read_file(raw / "transmission.geojson") if (raw / "transmission.geojson").exists() else \
             gpd.GeoDataFrame(columns=["geometry"], crs=CRS)

    print("Fetching ZCTA boundaries...", flush=True)
    grid = fetch_zcta(state, zcta_root)
    print(f"  {len(grid)} ZCTAs", flush=True)

    print("Transmission proximity (tx_score)...", flush=True)
    if len(tx_gdf) > 0:
        tx_proj = tx_gdf.to_crs(crs_proj)
        tx_union = tx_proj.geometry.union_all()
        grid_proj = grid.to_crs(crs_proj)
        centroids = list(grid_proj.geometry.centroid)
        print(f"  computing distances for {len(centroids)} ZCTAs...", flush=True)
        grid["tx_dist_m"] = [tx_union.distance(pt) for pt in centroids]
        grid["tx_score"] = 1.0 - (grid["tx_dist_m"] / grid["tx_dist_m"].max())
    else:
        grid["tx_score"] = 0.5
    print(f"  tx_score: {grid['tx_score'].min():.3f} - {grid['tx_score'].max():.3f}")

    print("Precipitation / water availability (water_score)...", flush=True)
    # Precip source priority: PRISM raster (preferred, no network) -> cached
    # precip_coarse.csv (from prefetch_precip.py / prefetch_precip_noaa.py,
    # see those files) -> live Open-Meteo fetch as a last resort inline below.
    if PRISM_TIF.exists():
        precip_vals = sample_prism_precip(grid)
    else:
        precip_df = fetch_precip(state, raw)
        centroids_ll = grid.geometry.centroid
        precip_vals = np.array(idw(
            precip_df["lat"].values, precip_df["lon"].values, precip_df["ann_precip_mm"].values,
            np.array([p.y for p in centroids_ll]), np.array([p.x for p in centroids_ll]),
        ))
    grid["ann_precip_mm"] = precip_vals
    p05, p95 = np.nanpercentile(precip_vals, [5, 95])
    grid["water_score"] = ((grid["ann_precip_mm"] - p05) / (p95 - p05)).clip(0, 1)
    print(f"  water_score: {grid['water_score'].min():.3f} - {grid['water_score'].max():.3f}", flush=True)

    print("Community burden / EJ score (ej_score)...", flush=True)
    zcta_codes = set(grid["zcta"].astype(str).str.zfill(5))
    df_acs = fetch_acs_zcta(zcta_codes, zcta_root)
    df_acs["zcta"] = df_acs["zcta"].astype(str).str.zfill(5)
    grid["zcta"] = grid["zcta"].astype(str).str.zfill(5)
    grid = grid.merge(df_acs[["zcta", "demog_index", "pop"]], on="zcta", how="left")
    q01, q99 = grid["demog_index"].quantile([0.01, 0.99])
    grid["ej_score"] = 1.0 - ((grid["demog_index"] - q01) / (q99 - q01)).clip(0, 1)
    grid["ej_score"] = grid["ej_score"].fillna(grid["ej_score"].median())
    print(f"  ej_score: {grid['ej_score'].min():.3f} - {grid['ej_score'].max():.3f}")

    print("Population exposure (pop_exposure_score)...", flush=True)
    grid_proj_tmp = grid.to_crs(crs_proj)
    grid["area_km2"] = grid_proj_tmp.geometry.area / 1e6
    grid["pop_density"] = (grid["pop"] / grid["area_km2"].clip(lower=0.01)).fillna(0)
    p95_dens = grid["pop_density"].quantile(0.95)
    grid["pop_exposure_score"] = (1.0 - (grid["pop_density"] / p95_dens).clip(0, 1))
    print(f"  pop_exposure_score: {grid['pop_exposure_score'].min():.3f} - {grid['pop_exposure_score'].max():.3f}")

    grid_out = grid.drop(
        columns=["demog_index", "area_km2", "pop_density", "pop"],
        errors="ignore",
    )
    grid_out.to_file(grid_path, driver="GeoJSON")
    print(f"\nSaved grid ({len(grid_out)} ZCTAs) to {grid_path}")
    print("Done.")


if __name__ == "__main__":
    main()
