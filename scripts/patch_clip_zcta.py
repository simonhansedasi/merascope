#!/usr/bin/env python3
"""
patch_clip_zcta.py — Clip existing ZCTA grid_scores.geojson to state boundaries.

Fixes cross-border polygon bleed: build_zcta.py deliberately keeps ZCTAs via
an 'intersects' (not 'within') join so boundary-crossing ZIPs aren't dropped,
but that means each state's ZCTA polygons can extend visibly past its border
when rendered. This clips those polygons down to the state boundary.

CAUTION — this clip has a side effect: it can drop border ZCTAs entirely when
clipping degenerates their geometry (see patch_restore_zcta_geom.py, which
runs AFTER this to put the original unclipped polygons back while keeping the
score values this step computed). Chain order: this -> patch_restore_zcta_geom.py
-> patch_simplify_zcta.py (per that script's own docstring).

Reads data/{STATE}/raw/state.geojson for the clip boundary.

Usage:
  python3 scripts/patch_clip_zcta.py
  python3 scripts/patch_clip_zcta.py --states WA OR TX
"""

import argparse
from pathlib import Path
import geopandas as gpd

DATA = Path("data")

STATES = [
    "WA","OR","TX","CA","NV","UT","ID","MT","AZ","CO","WY","NM","ND","SD","NE","KS","OK",
    "MN","IA","MO","AR","LA","MI","WI","IL","IN","KY","TN","MS","GA","OH",
    "AL","FL","SC","NC","VA","WV","PA","NY","NJ","CT","RI","MA","VT","NH","ME","DE","MD",
]


def clip_state(state):
    zcta_path  = DATA / state / "zcta" / "grid_scores.geojson"
    state_path = DATA / state / "raw" / "state.geojson"

    if not zcta_path.exists():
        print(f"  {state}: no zcta/grid_scores.geojson — skipping")
        return False
    if not state_path.exists():
        print(f"  {state}: no raw/state.geojson — skipping")
        return False

    state_gdf = gpd.read_file(state_path).to_crs("EPSG:4326")
    zcta_gdf  = gpd.read_file(zcta_path).to_crs("EPSG:4326")
    n_before  = len(zcta_gdf)

    # Fix invalid geometries before clipping to avoid TopologyException
    zcta_gdf = zcta_gdf.copy()
    zcta_gdf["geometry"] = zcta_gdf.geometry.buffer(0)
    state_union = state_gdf.geometry.union_all().buffer(0)
    clipped = zcta_gdf.clip(state_union).reset_index(drop=True)
    # Drop degenerate clip artifacts (GeometryCollection, LineString, None)
    valid = {'Polygon', 'MultiPolygon'}
    n_clipped = len(clipped)
    clipped = clipped[clipped.geometry.notna() & clipped.geometry.type.isin(valid)].reset_index(drop=True)
    clipped.to_file(zcta_path, driver="GeoJSON")
    print(f"  {state}: {n_before} → {n_clipped} clipped → {len(clipped)} after geometry filter → wrote {zcta_path}")
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
            if clip_state(state):
                ok += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  {state}: ERROR — {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Done. {ok} clipped, {failed} skipped/failed.")


if __name__ == "__main__":
    main()
