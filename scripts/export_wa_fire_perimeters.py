"""One-time export: real MTBS (Monitoring Trends in Burn Severity) fire
perimeter polygons clipped to Washington, for the wa-fire-risk report --
the fire equivalent of export_pnw_watersheds.py's watershed clip. A burn
perimeter is a real boundary (what actually burned), not an administrative
or invented one, same reasoning as using Aqueduct's own watershed shapes
instead of a ZCTA join.

Source: MTBS national burned-area boundary shapefile (~390 MB), streamed to
disk and deleted after clipping -- same discipline as 15_water_stress.py's
Aqueduct download (never join iter_content into memory).

Run: python3 scripts/export_wa_fire_perimeters.py
Output: data/shared/wa_fire_perimeters.geojson
"""
import json
import os
import shutil
import zipfile

import geopandas as gpd
import pandas as pd
import requests

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
SHARED = os.path.join(BASE, "shared")
EQUAL_AREA_CRS = "EPSG:5070"  # NAD83 / Conus Albers -- for real area in km2

MTBS_URL = (
    "https://edcintl.cr.usgs.gov/downloads/sciweb1/shared/MTBS_Fire/data/"
    "composite_data/burned_area_extent_shapefile/mtbs_perimeter_data.zip"
)

# MTBS attribute names have shifted across releases (Ig_Date vs ig_date,
# BurnBndAc vs burn_bnd_ac). Try known candidates rather than assuming.
YEAR_CANDIDATES = ["Ig_Date", "ig_date", "IG_DATE", "Fire_Year", "fire_year"]
ACRES_CANDIDATES = ["BurnBndAc", "burnbndac", "burn_bnd_ac", "BURN_BND_AC", "Acres", "acres"]
NAME_CANDIDATES = ["Incid_Name", "incid_name", "INCID_NAME"]
# NOT a burn-severity class -- MTBS's boundary shapefile has no single
# per-fire severity label (severity/dNBR is a separate per-fire raster
# product). asmnt_type is MTBS's own assessment-methodology field
# ("Initial"/"Extended"/"Comprehensive" -- how the fire was mapped, not how
# hot it burned). Labeled honestly as assessment_type below, not "severity".
ASSESSMENT_TYPE_CANDIDATES = ["Asmnt_Type", "asmnt_type", "ASMNT_TYPE"]


def _find_col(gdf, candidates):
    for c in candidates:
        if c in gdf.columns:
            return c
    return None


def fetch_mtbs():
    """Download MTBS national perimeters, clip to WA, cache the RAW clip
    (all MTBS columns) to data/shared/ -- build_report_layer() reduces this
    to report fields separately, same two-step split as
    aqueduct_watersheds.gpkg (raw) -> pnw_watersheds.geojson (reduced) in
    export_pnw_watersheds.py. Keeping these separate means a re-run reads
    the real MTBS column names from the raw cache instead of re-parsing its
    own already-reduced output."""
    out_path = os.path.join(SHARED, "wa_fire_perimeters_raw.geojson")
    if os.path.exists(out_path):
        gdf = gpd.read_file(out_path)
        if len(gdf) > 0:
            print(f"  Cached raw: {len(gdf)} WA fire perimeters")
            return gdf

    zip_path = os.path.join(SHARED, "mtbs_dl.zip")
    ext_dir = os.path.join(SHARED, "mtbs_tmp")

    print("  Downloading MTBS national fire perimeters (streaming to disk, ~390 MB)...")
    r = requests.get(MTBS_URL, timeout=900, stream=True,
                      headers={"User-Agent": "datacenter-siting-research/1.0"})
    r.raise_for_status()
    total = 0
    with open(zip_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
            f.write(chunk)
            total += len(chunk)
    print(f"  Downloaded {total / 1e6:.1f} MB -> {os.path.basename(zip_path)}")

    try:
        os.makedirs(ext_dir, exist_ok=True)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(ext_dir)

        shp_files = [os.path.join(dp, f) for dp, _, fs in os.walk(ext_dir) for f in fs if f.endswith(".shp")]
        if not shp_files:
            raise RuntimeError("No .shp found in MTBS ZIP")
        src = shp_files[0]

        print(f"  Reading {os.path.basename(src)}...")
        national = gpd.read_file(src)
        print(f"  {len(national)} national fire perimeters. Columns: {list(national.columns)}")

        wa_boundary = gpd.read_file(os.path.join(BASE, "WA", "raw", "state.geojson")).to_crs(national.crs)
        region = gpd.GeoDataFrame(geometry=[wa_boundary.union_all()], crs=national.crs)
        hits = national[national.geometry.intersects(region.geometry.iloc[0])].copy()
        wa = gpd.clip(hits, region)
        wa = wa[wa.geometry.notna() & ~wa.geometry.is_empty].to_crs("EPSG:4326")
        print(f"  {len(wa)} perimeters intersect WA")

        wa.to_file(out_path, driver="GeoJSON")
        return wa
    finally:
        if os.path.exists(zip_path):
            os.unlink(zip_path)
        if os.path.exists(ext_dir):
            shutil.rmtree(ext_dir, ignore_errors=True)


def build_report_layer(wa):
    """Reduce to the fields the report/map need, real post-clip area in
    km2 (not any pre-clip acreage column), one clean feature per fire."""
    year_col = _find_col(wa, YEAR_CANDIDATES)
    acres_col = _find_col(wa, ACRES_CANDIDATES)
    name_col = _find_col(wa, NAME_CANDIDATES)
    asmnt_col = _find_col(wa, ASSESSMENT_TYPE_CANDIDATES)
    print(f"  Using columns: year={year_col} acres={acres_col} name={name_col} assessment_type={asmnt_col}")

    years = pd.to_datetime(wa[year_col], errors="coerce").dt.year if year_col else pd.Series([None] * len(wa))
    area_km2 = wa.geometry.to_crs(EQUAL_AREA_CRS).area / 1e6
    # Area computed from the full-resolution geometry above; simplification
    # below is display-only (MTBS perimeters are survey-grade digitized
    # boundaries, far more vertex-dense than a report map needs -- 650 of
    # them at full resolution made the report's per-request JSON parse +
    # shapely-load cost ~2s, same "simplified for web" treatment already
    # used for the parcel dossiers, e.g. grant_county_web.geojson).
    simplified = wa.geometry.simplify(0.0005, preserve_topology=True)  # ~55m tolerance

    features = []
    for i, (_, row) in enumerate(wa.iterrows()):
        y = years.iloc[i]
        features.append({
            "type": "Feature",
            "properties": {
                "name": row.get(name_col) if name_col else None,
                "year": int(y) if pd.notna(y) else None,
                "acres": round(float(row[acres_col]), 1) if acres_col and pd.notna(row[acres_col]) else None,
                "assessment_type": row.get(asmnt_col) if asmnt_col else None,
                "area_km2": round(float(area_km2.iloc[i]), 2),
            },
            "geometry": json.loads(gpd.GeoSeries([simplified.iloc[i]], crs=wa.crs).to_json())["features"][0]["geometry"],
        })

    out = {"type": "FeatureCollection", "features": features}
    out_path = os.path.join(SHARED, "wa_fire_perimeters.geojson")
    with open(out_path, "w") as f:
        json.dump(out, f)
    print(f"WA: {len(features)} fire perimeters -> {out_path} ({os.path.getsize(out_path)/1e6:.2f} MB)")
    return out


def main():
    os.makedirs(SHARED, exist_ok=True)
    wa = fetch_mtbs()
    build_report_layer(wa)


if __name__ == "__main__":
    main()
