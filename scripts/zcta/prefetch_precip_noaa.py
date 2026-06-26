#!/usr/bin/env python3
"""
prefetch_precip_noaa.py — Build precip_coarse.csv for all 48 states using
NOAA 1991-2020 Climate Normals station data. No API rate limits — two bulk
file downloads, then local IDW per state.

Run locally or on Hetzner. Saves data/{STATE}/raw/precip_coarse.csv.

Usage:
  python scripts/zcta/prefetch_precip_noaa.py
  python scripts/zcta/prefetch_precip_noaa.py WA OR
"""

import sys
from pathlib import Path
from tqdm import tqdm
import geopandas as gpd
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
CACHE_DIR = DATA / "_noaa_normals_cache"

STATES = [
    "AL","AR","AZ","CA","CO","CT","DE","FL","GA","IA","ID","IL","IN","KS","KY",
    "LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM",
    "NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA",
    "WI","WV","WY",
]

ARCHIVE_URL = (
    "https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/archive/"
    "us-climate-normals_1991-2020_v1.0.1_annualseasonal_multivariate_by-station_c20230404.tar.gz"
)


def load_normals():
    """Download 54 MB archive once, extract, parse ANN-PRCP-NORMAL from each station CSV."""
    import tarfile

    extracted_dir = CACHE_DIR / "annualseasonal"
    merged_path   = CACHE_DIR / "conus_ann_prcp.csv"

    if merged_path.exists():
        df = pd.read_csv(merged_path)
        print(f"  {len(df)} CONUS stations with precip normals (cached)")
        return df

    archive_path = CACHE_DIR / "normals_annualseasonal.tar.gz"
    if not archive_path.exists():
        print("Downloading NOAA 1991-2020 annual normals archive (~54 MB)...")
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        r = requests.get(ARCHIVE_URL, timeout=300, stream=True)
        r.raise_for_status()
        total = 0
        with open(archive_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                f.write(chunk)
                total += len(chunk)
                print(f"  {total // (1024*1024)} MB...", end="\r", flush=True)
        print(f"\n  saved {total // (1024*1024)} MB")

    print("Extracting archive...")
    extracted_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as tf:
        tf.extractall(extracted_dir)
    print("  done")

    print("Parsing station CSVs for ANN-PRCP-NORMAL...")
    rows = []
    for csv_path in tqdm(sorted(extracted_dir.rglob("*.csv"))):
        try:
            df = pd.read_csv(csv_path, dtype=str)
            if "ANN-PRCP-NORMAL" not in df.columns:
                continue
            row = df.iloc[0]
            lat = float(row["LATITUDE"])
            lon = float(row["LONGITUDE"])
            val_str = str(row["ANN-PRCP-NORMAL"])
            # Strip flag suffix (C/P/S/Q/R/Z)
            val_clean = val_str.rstrip("CPQRSTZ ")
            if val_clean in ("-9999", "-8888", "-7777", "nan", ""):
                continue
            ann_mm = float(val_clean)
            # CONUS filter
            if 24 <= lat <= 50 and -125 <= lon <= -65:
                rows.append({"lat": lat, "lon": lon, "ann_precip_mm": ann_mm})
        except Exception:
            continue
    df = pd.DataFrame(rows)
    df.to_csv(merged_path, index=False)
    print(f"  {len(df)} CONUS stations saved to {merged_path.name}")
    return df


def build_precip_csv(state, state_gdf, normals_gdf):
    path = DATA / state / "raw" / "precip_coarse.csv"
    if path.exists():
        print(f"  {state}: cached, skipping")
        return

    # Clip normals to state bounding box + buffer
    bounds = state_gdf.total_bounds
    buf = 1.0
    mask = (
        (normals_gdf["lon"] >= bounds[0] - buf) &
        (normals_gdf["lon"] <= bounds[2] + buf) &
        (normals_gdf["lat"] >= bounds[1] - buf) &
        (normals_gdf["lat"] <= bounds[3] + buf)
    )
    nearby = normals_gdf[mask]

    if len(nearby) < 3:
        print(f"  {state}: WARNING only {len(nearby)} nearby stations — skipping")
        return

    df = nearby[["lat", "lon", "ann_precip_mm"]].reset_index(drop=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    print(f"  {state}: {len(df)} stations → {path}", flush=True)


def main():
    targets = [s.upper() for s in sys.argv[1:]] if len(sys.argv) > 1 else STATES

    conus = load_normals()

    for state in targets:
        state_path = DATA / state / "raw" / "state.geojson"
        if not state_path.exists():
            print(f"  {state}: no state.geojson — skipping")
            continue
        state_gdf = gpd.read_file(state_path)
        build_precip_csv(state, state_gdf, conus)

    print("\nDone. Rsync to Hetzner:")
    print("  rsync -av --include='precip_coarse.csv' --include='*/' --exclude='*' \\")
    print("    data/ root@<hetzner-ip>:/home/simonhans/coding/merascope/data/")


if __name__ == "__main__":
    main()
