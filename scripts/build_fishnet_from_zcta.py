#!/usr/bin/env python3
"""
build_fishnet_from_zcta.py — Derive fishnet grid_scores.geojson from ZCTA scores.

For each fishnet cell, finds the containing ZCTA and copies its score columns.
Border cells with no containing ZCTA fall back to nearest ZCTA centroid.
Preserves all original fishnet geometry and non-score properties.

Must run AFTER normalize_zcta_national.py so *_nat columns are present.

Usage:
  python scripts/build_fishnet_from_zcta.py WA
  python scripts/build_fishnet_from_zcta.py --all
"""

import argparse
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree

DATA_DIR = Path("data")

STATES = [
    "WA","OR","TX","CA","NV","UT","ID","MT","AZ","CO","WY","NM","ND","SD","NE","KS","OK",
    "MN","IA","MO","AR","LA","MI","WI","IL","IN","KY","TN","MS","GA","OH",
    "AL","FL","SC","NC","VA","WV","PA","NY","NJ","CT","RI","MA","VT","NH","ME","DE","MD",
]


def build_state(state):
    zcta_path    = DATA_DIR / state / "zcta" / "grid_scores.geojson"
    fishnet_path = DATA_DIR / state / "grid_scores.geojson"

    if not zcta_path.exists():
        print(f"  {state}: no ZCTA grid_scores.geojson — skipping")
        return False
    if not fishnet_path.exists():
        print(f"  {state}: no fishnet grid_scores.geojson — skipping")
        return False

    print(f"  {state}: loading ZCTA...")
    zcta_gdf = gpd.read_file(zcta_path).to_crs("EPSG:4326")

    print(f"  {state}: loading fishnet...")
    fish_gdf = gpd.read_file(fishnet_path).to_crs("EPSG:4326")

    # Score columns to copy from ZCTA (all *_score and *_nat)
    score_cols = [c for c in zcta_gdf.columns
                  if (c.endswith("_score") or c.endswith("_nat")) and c != "geometry"]
    # Also copy the zcta identifier
    id_cols = ["zcta"] if "zcta" in zcta_gdf.columns else []
    copy_cols = id_cols + score_cols

    print(f"  {state}: {len(zcta_gdf)} ZCTAs, {len(fish_gdf)} fishnet cells, {len(score_cols)} score cols")

    # Use fishnet centroids for spatial join
    fish_centroids = fish_gdf.copy()
    fish_centroids["geometry"] = fish_gdf.centroid

    # Spatial join: fishnet centroid within ZCTA polygon.
    # Exclude score/nat cols from the fishnet side so ZCTA values always win without collision.
    copy_set = set(copy_cols)
    fish_keep = [c for c in fish_gdf.columns if c != "geometry" and c not in copy_set]
    joined = gpd.sjoin(
        fish_centroids[["geometry"] + fish_keep],
        zcta_gdf[["geometry"] + copy_cols],
        how="left",
        predicate="within",
    )

    # Identify unmatched cells (border edge cases)
    unmatched = joined[joined["index_right"].isna()].index
    n_unmatched = len(unmatched)
    if n_unmatched > 0:
        print(f"  {state}: {n_unmatched} border cells — applying nearest-ZCTA fallback")
        zcta_cents = np.array(list(zip(zcta_gdf.centroid.x, zcta_gdf.centroid.y)))
        tree = cKDTree(zcta_cents)
        for idx in unmatched:
            pt = (fish_centroids.loc[idx, "geometry"].x, fish_centroids.loc[idx, "geometry"].y)
            _, nn_idx = tree.query(pt)
            for col in copy_cols:
                joined.at[idx, col] = zcta_gdf.iloc[nn_idx][col]

    # Drop sjoin artifact columns, restore original fishnet geometry
    joined = joined.drop(columns=["index_right"], errors="ignore")
    joined["geometry"] = fish_gdf["geometry"].values

    # Drop duplicate columns from sjoin (left_ prefix artifacts)
    dup_cols = [c for c in joined.columns if c.endswith("_left") or c.endswith("_right")]
    joined = joined.drop(columns=dup_cols, errors="ignore")

    out_gdf = gpd.GeoDataFrame(joined, geometry="geometry", crs="EPSG:4326")
    out_gdf.to_file(fishnet_path, driver="GeoJSON")
    print(f"  {state}: wrote {fishnet_path}")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state", nargs="?", help="State abbreviation (e.g. WA)")
    parser.add_argument("--all", action="store_true", help="Run for all 48 states")
    args = parser.parse_args()

    if args.all:
        targets = STATES
    elif args.state:
        targets = [args.state.upper()]
    else:
        parser.print_help()
        sys.exit(1)

    ok = failed = 0
    for state in targets:
        print(f"\n{'─'*50}")
        try:
            if build_state(state):
                ok += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  {state}: ERROR — {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Done. {ok} succeeded, {failed} failed/skipped.")


if __name__ == "__main__":
    main()
