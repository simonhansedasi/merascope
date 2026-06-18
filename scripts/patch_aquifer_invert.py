"""
patch_aquifer_invert.py — Recompute aquifer_score from existing aquifer_depth_ft
using the corrected formula: 1 - clip(depth_ft / p95, 0, 1)

Shallow aquifer = higher score (better cooling access).
Does NOT re-fetch from USGS NWIS; uses raw column already in each GeoJSON.
"""

from pathlib import Path
import numpy as np
import geopandas as gpd
import warnings
warnings.filterwarnings("ignore")

DATA_DIR = Path(__file__).parent.parent / "data"

states = sorted([d.name for d in DATA_DIR.iterdir() if d.is_dir() and len(d.name) == 2 and d.name.isupper()])

ok, skipped = 0, 0
for st in states:
    path = DATA_DIR / st / "grid_scores.geojson"
    if not path.exists():
        print(f"  {st}: no grid_scores.geojson — skip")
        skipped += 1
        continue

    gdf = gpd.read_file(path)

    if "aquifer_depth_ft" not in gdf.columns:
        print(f"  {st}: no aquifer_depth_ft column — skip")
        skipped += 1
        continue

    depth = gdf["aquifer_depth_ft"].values.astype(float)
    valid = depth[~np.isnan(depth)]
    if len(valid) == 0:
        print(f"  {st}: all NaN — skip")
        skipped += 1
        continue

    p95 = np.percentile(valid, 95)
    new_score = (1 - np.clip(depth / p95, 0, 1)).round(4)
    old_mean = gdf["aquifer_score"].mean() if "aquifer_score" in gdf.columns else float("nan")
    gdf["aquifer_score"] = new_score
    print(f"  {st}: p95={p95:.1f}ft  score {old_mean:.3f} -> {new_score.mean():.3f} (mean)")

    gdf.to_file(path, driver="GeoJSON")
    ok += 1

print(f"\nDone. {ok} states patched, {skipped} skipped.")
