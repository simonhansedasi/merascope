#!/usr/bin/env python3
"""
patch_simplify_zcta.py — Simplify ZCTA polygon vertices to reduce file size.

Applies shapely simplify (Douglas-Peucker, tolerance=0.01 deg ~1km) to all
state ZCTA grid_scores.geojson files in-place. Invisible at national zoom;
negligible at state zoom for a scoring tool.

Run on Hetzner AFTER patch_restore_zcta_geom.py completes.

Usage:
  python3 scripts/patch_simplify_zcta.py
  python3 scripts/patch_simplify_zcta.py --states WA OR TX
  python3 scripts/patch_simplify_zcta.py --tolerance 0.005
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


def simplify_state(state, tolerance):
    path = DATA / state / "zcta" / "grid_scores.geojson"
    if not path.exists():
        print(f"  {state}: missing — skipping")
        return False
    before = path.stat().st_size
    gdf = gpd.read_file(path)
    gdf["geometry"] = gdf.geometry.simplify(tolerance, preserve_topology=True)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].reset_index(drop=True)
    gdf.to_file(path, driver="GeoJSON")
    after = path.stat().st_size
    pct = 100 * (1 - after / before) if before else 0
    print(f"  {state}: {before//1024}KB → {after//1024}KB ({pct:.0f}% smaller)")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--states", nargs="+", default=None)
    parser.add_argument("--tolerance", type=float, default=0.01)
    args = parser.parse_args()

    targets = [s.upper() for s in args.states] if args.states else STATES
    print(f"Simplifying with tolerance={args.tolerance} deg (~{args.tolerance * 111:.0f}km)")
    ok = failed = 0
    for state in targets:
        try:
            if simplify_state(state, args.tolerance):
                ok += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  {state}: ERROR — {e}")
            failed += 1

    print(f"\nDone. {ok} simplified, {failed} skipped/failed.")


if __name__ == "__main__":
    main()
