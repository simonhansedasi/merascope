"""One-time export: the actual WRI Aqueduct watershed polygons for the
pnw-water-stress page -- both the map layers (WA/OR, the 7 Colorado River
Compact states) and the lightweight national stats file the area-weighted
national comparison is computed from. This is now the ONLY source the page's
analysis reads (analysis_pnw_water_stress.py no longer touches ZCTA data at
all -- see that script's module docstring for why).

Each state is clipped INDIVIDUALLY against its own real TIGER boundary (not
clipped once against a region union) and tagged with that state's abbreviation
in the output -- a watershed that straddles WA/OR gets two clipped pieces,
one per state, each carrying only that state's real portion. This matters for
area math: Aqueduct's own `area_km2` column is the whole watershed's area,
which would overstate a border watershed's contribution to a single state's
total. Area is recomputed post-clip in EPSG:5070 (CONUS Albers equal-area),
not read off the pre-clip column.

Run: python3 scripts/export_pnw_watersheds.py
Output:
  data/shared/pnw_watersheds.geojson       WA + OR, state-tagged
  data/shared/compact_watersheds.geojson   AZ/CA/CO/NV/NM/UT/WY, state-tagged
  data/shared/national_watershed_stats.json  area_km2 + bws for all CONUS
                                              watersheds, no geometry -- just
                                              enough for the national share
"""
import json
import os

import geopandas as gpd

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
EXTREME = 4.0
EQUAL_AREA_CRS = "EPSG:5070"  # NAD83 / Conus Albers -- for area in km2, not degrees

PNW_STATES = ["WA", "OR"]
COMPACT_STATES = ["AZ", "CA", "CO", "NV", "NM", "UT", "WY"]


def _tag(v):
    return "extremely high" if v >= EXTREME else ("high" if v >= 3 else "low")


def clip_state(aqueduct, state):
    boundary = gpd.read_file(os.path.join(BASE, state, "raw", "state.geojson")).to_crs(aqueduct.crs)
    region = gpd.GeoDataFrame(geometry=[boundary.union_all()], crs=aqueduct.crs)
    hits = aqueduct[aqueduct.geometry.intersects(region.geometry.iloc[0])].copy()
    clipped = gpd.clip(hits, region)
    clipped = clipped[clipped.geometry.notna() & ~clipped.geometry.is_empty]
    clipped = clipped[clipped["bws_score"].notna()]
    # Real post-clip area, not Aqueduct's pre-clip area_km2 column.
    clipped["area_km2_clipped"] = clipped.geometry.to_crs(EQUAL_AREA_CRS).area / 1e6
    clipped["state"] = state
    return clipped


def export_region(states, out_name, aqueduct):
    parts = [clip_state(aqueduct, s) for s in states]
    combined = gpd.pd.concat(parts, ignore_index=True) if len(parts) > 1 else parts[0]

    features = []
    for _, row in combined.iterrows():
        v = float(row["bws_score"])
        features.append({
            "type": "Feature",
            "properties": {
                "aq30_id": row.get("aq30_id"),
                "state": row["state"],
                "bws": round(v, 4),
                "tag": _tag(v),
                "area_km2": round(float(row["area_km2_clipped"]), 1),
            },
            "geometry": json.loads(gpd.GeoSeries([row.geometry], crs=combined.crs).to_json())["features"][0]["geometry"],
        })

    out = {"type": "FeatureCollection", "features": features}
    out_path = os.path.join(BASE, "shared", out_name)
    with open(out_path, "w") as f:
        json.dump(out, f)
    print(f"{states}: {len(features)} watershed polygons -> {out_path} ({os.path.getsize(out_path)/1e6:.2f} MB)")


def export_national_stats(aqueduct):
    """No geometry, no per-state clipping -- just area + bws for every CONUS
    watershed, for the national area-weighted comparison line."""
    valid = aqueduct[aqueduct["bws_score"].notna()].copy()
    valid["area_km2_real"] = valid.geometry.to_crs(EQUAL_AREA_CRS).area / 1e6
    rows = [{"area_km2": round(float(a), 1), "bws": round(float(b), 4)}
            for a, b in zip(valid["area_km2_real"], valid["bws_score"])]
    out_path = os.path.join(BASE, "shared", "national_watershed_stats.json")
    with open(out_path, "w") as f:
        json.dump(rows, f)
    print(f"national: {len(rows)} watersheds -> {out_path} ({os.path.getsize(out_path)/1e6:.2f} MB)")


def main():
    aqueduct = gpd.read_file(os.path.join(BASE, "shared", "aqueduct_watersheds.gpkg"))
    export_region(PNW_STATES, "pnw_watersheds.geojson", aqueduct)
    export_region(COMPACT_STATES, "compact_watersheds.geojson", aqueduct)
    export_national_stats(aqueduct)


if __name__ == "__main__":
    main()
