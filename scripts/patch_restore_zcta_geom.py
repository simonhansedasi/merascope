#!/usr/bin/env python3
"""
patch_restore_zcta_geom.py — Restore original unclipped ZCTA geometries.

patch_clip_zcta.py overwrote grid_scores.geojson with clipped polygons and
dropped some border ZCTAs entirely. This script rebuilds each state's
grid_scores.geojson using the untouched zcta/zcta.geojson cache (original
full polygons) as the geometry base, re-joining scores from the current
(clipped) grid_scores.geojson. ZCTAs that were dropped by the clip get
scores filled from their nearest surviving neighbor.

Usage:
  python3 scripts/patch_restore_zcta_geom.py
  python3 scripts/patch_restore_zcta_geom.py --states WA OR TX
"""

import argparse
from pathlib import Path

import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree

DATA = Path("data")

STATES = [
    "WA","OR","TX","CA","NV","UT","ID","MT","AZ","CO","WY","NM","ND","SD","NE","KS","OK",
    "MN","IA","MO","AR","LA","MI","WI","IL","IN","KY","TN","MS","GA","OH",
    "AL","FL","SC","NC","VA","WV","PA","NY","NJ","CT","RI","MA","VT","NH","ME","DE","MD",
]


def restore_state(state):
    cache_path = DATA / state / "zcta" / "zcta.geojson"
    scores_path = DATA / state / "zcta" / "grid_scores.geojson"

    if not cache_path.exists():
        print(f"  {state}: no zcta/zcta.geojson cache — skipping")
        return False
    if not scores_path.exists():
        print(f"  {state}: no zcta/grid_scores.geojson — skipping")
        return False

    # Original unclipped boundaries
    cache_gdf = gpd.read_file(cache_path).to_crs("EPSG:4326")[["zcta", "geometry"]]
    # Current clipped scores (may be missing some border ZCTAs)
    scores_gdf = gpd.read_file(scores_path).to_crs("EPSG:4326")

    score_cols = [c for c in scores_gdf.columns if c not in ("geometry", "zcta")]

    n_cache  = len(cache_gdf)
    n_scores = len(scores_gdf)

    # Left join: all original ZCTAs get original geometry, scores where available
    merged = cache_gdf.merge(scores_gdf.drop(columns="geometry"), on="zcta", how="left")

    missing_mask = merged[score_cols[0]].isna() if score_cols else np.zeros(len(merged), dtype=bool)
    n_missing = missing_mask.sum()

    if n_missing > 0 and score_cols:
        print(f"  {state}: {n_missing} border ZCTAs missing scores — nearest-neighbor fill")
        # Centroids of ZCTAs that DO have scores
        scored = merged[~missing_mask].copy()
        scored_cents = np.array([(g.centroid.x, g.centroid.y) for g in scored.geometry])
        tree = cKDTree(scored_cents)

        for idx in merged[missing_mask].index:
            pt = (merged.loc[idx, "geometry"].centroid.x,
                  merged.loc[idx, "geometry"].centroid.y)
            _, nn_pos = tree.query(pt)
            nn_idx = scored.index[nn_pos]
            for col in score_cols:
                merged.at[idx, col] = merged.at[nn_idx, col]

    out = gpd.GeoDataFrame(merged, geometry="geometry", crs="EPSG:4326")
    out.to_file(scores_path, driver="GeoJSON")
    print(f"  {state}: restored {n_cache} ZCTAs ({n_cache - n_scores} filled) → {scores_path}")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--states", nargs="+", default=None)
    args = parser.parse_args()

    targets = [s.upper() for s in args.states] if args.states else STATES
    ok = failed = 0
    for state in targets:
        print(f"\n{'─'*40}")
        try:
            if restore_state(state):
                ok += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  {state}: ERROR — {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Done. {ok} restored, {failed} skipped/failed.")


if __name__ == "__main__":
    main()
