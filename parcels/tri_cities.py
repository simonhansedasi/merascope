"""
tri_cities.py — Parcel-level data center siting dossier for the Tri-Cities area, WA.

Covers Benton County (Richland, Kennewick) and Franklin County (Pasco).
Data from WA State Current_Parcels ArcGIS service (bbox + FIPS filter).

Scoring dimensions:
  zcta_score    — inherited from ZCTA study (join by centroid)
  tx_score      — proximity to HV transmission line
  acreage_score — log-normalized parcel size (larger = better)
  vacant_score  — 1 - (building value / total value); low building = undeveloped

Hard gates:
  - ZCTA flatness_score == 0 or protected_score == 0 → excluded
  - LANDUSE_CD 11–19 (residential) → excluded

Note: Government/federal land (Hanford Reservation, DOE) is caught by ZCTA
protected_score hard gate rather than an explicit exempt field.

Output:
  data/WA/parcels/tri_cities_parcels.geojson   — all viable scored parcels
  data/WA/parcels/tri_cities_top50.csv         — top 50 by composite score
  data/WA/parcels/tri_cities_web.geojson       — all viable, simplified for map

Usage:
  conda activate merascope
  python parcels/tri_cities.py
"""

import json
import sys
import time
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests

warnings.filterwarnings("ignore")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR     = PROJECT_ROOT / "data" / "WA"
OUT_DIR      = DATA_DIR / "parcels"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PARCEL_CACHE = OUT_DIR / "tri_cities_raw.geojson"
OUT_SCORED   = OUT_DIR / "tri_cities_parcels.geojson"
OUT_TOP50    = OUT_DIR / "tri_cities_top50.csv"
OUT_WEB      = OUT_DIR / "tri_cities_web.geojson"

FEATURE_SERVER = (
    "https://services.arcgis.com/jsIt88o09Q0r1j8h"
    "/arcgis/rest/services/Current_Parcels/FeatureServer/0"
)
# Benton (005) + Franklin (021) counties
FIPS_KEEP = {"005", "021"}

# Bbox covering Tri-Cities + surrounding agricultural land
# Benton County extends west (Horse Heaven Hills) + north (Hanford)
# Franklin County extends east (Pasco industrial zone)
BBOX = {"xmin": -120.2, "ymin": 45.9, "xmax": -118.5, "ymax": 46.7}

# 5 acres * 43560 sq ft/acre — Shape__Area is in sq ft in this service
ACRES_MIN_SQFT = 5 * 43560
FIELDS = "PARCEL_ID_NR,FIPS_NR,LANDUSE_CD,VALUE_LAND,VALUE_BLDG,SITUS_CITY_NM,SITUS_ZIP_NR"
PAGE_SIZE = 2000
CRS = "EPSG:4326"
UTM = "EPSG:32610"


# ── Fetch ──────────────────────────────────────────────────────────────────────

def _count(where, bbox):
    r = requests.get(
        f"{FEATURE_SERVER}/query",
        params={
            "geometry": json.dumps(bbox),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "where": where,
            "returnCountOnly": "true",
            "f": "json",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("count", 0)


def _fetch_page(where, bbox, offset):
    r = requests.get(
        f"{FEATURE_SERVER}/query",
        params={
            "geometry": json.dumps(bbox),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "where": where,
            "outFields": FIELDS,
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
        },
        timeout=90,
    )
    r.raise_for_status()
    return r.json()


def fetch_parcels():
    if PARCEL_CACHE.exists():
        print(f"  Loading cached parcels from {PARCEL_CACHE.name}...")
        return gpd.read_file(PARCEL_CACHE)

    where = f"Shape__Area >= {ACRES_MIN_SQFT}"
    print(f"  Counting parcels where {where} in Tri-Cities bbox...")
    total = _count(where, BBOX)
    print(f"  {total:,} parcels found — fetching in pages of {PAGE_SIZE}...")

    all_features = []
    offset = 0
    while offset < total:
        page = _fetch_page(where, BBOX, offset)
        feats = page.get("features", [])
        all_features.extend(feats)
        offset += PAGE_SIZE
        print(f"    {min(offset, total):,} / {total:,}", end="\r")
        if len(feats) < PAGE_SIZE:
            break
        time.sleep(0.1)

    print(f"\n  Downloaded {len(all_features):,} features")
    geojson = {"type": "FeatureCollection", "features": all_features}
    gdf = gpd.GeoDataFrame.from_features(geojson, crs=CRS)
    gdf.to_file(PARCEL_CACHE, driver="GeoJSON")
    print(f"  Cached to {PARCEL_CACHE}")
    return gdf


# ── Filter ─────────────────────────────────────────────────────────────────────

def filter_parcels(gdf):
    before = len(gdf)

    # Keep only Benton + Franklin counties
    gdf = gdf[gdf["FIPS_NR"].astype(str).isin(FIPS_KEEP)].copy()
    after_fips = len(gdf)

    # Drop residential DOR codes (11–19)
    landuse_int = pd.to_numeric(gdf["LANDUSE_CD"], errors="coerce").fillna(0).astype(int)
    residential = (landuse_int >= 11) & (landuse_int <= 19)
    gdf = gdf[~residential]
    after_res = len(gdf)

    # Drop null/empty geometries
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]

    # Compute TotalAcres from projected geometry
    gdf_proj = gdf.to_crs(UTM)
    gdf["TotalAcres"] = gdf_proj.geometry.area / 4046.86

    # Re-apply 5-acre threshold from computed area (bbox filter used sq ft approximation)
    gdf = gdf[gdf["TotalAcres"] >= 5.0]

    # Convert LANDUSE_CD to integer string before rename (service returns floats like 83.0)
    gdf["LANDUSE_CD"] = (
        pd.to_numeric(gdf["LANDUSE_CD"], errors="coerce")
        .fillna(0).astype(int).astype(str)
    )

    # Rename fields to match template conventions
    gdf = gdf.rename(columns={
        "PARCEL_ID_NR":  "PARCEL",
        "LANDUSE_CD":    "DepartmentOfRevenueCode",
        "VALUE_LAND":    "LandValue",
        "VALUE_BLDG":    "BldgValue",
        "SITUS_CITY_NM": "IncorporatedCity",
        "SITUS_ZIP_NR":  "ZipCode",
    })

    print(f"  Filtered: {before:,} total in bbox → {after_fips:,} Benton+Franklin "
          f"→ {after_res:,} non-residential → {len(gdf):,} after geo+acreage filter")
    return gdf.reset_index(drop=True)


# ── Score ──────────────────────────────────────────────────────────────────────

def score_parcels(parcels, zcta_gdf, tx_gdf):
    parcels = parcels.copy()

    centroids_ll  = parcels.geometry.centroid
    centroids_utm = parcels.to_crs(UTM).geometry.centroid

    # ── ZCTA score: centroid join ──
    print("  Joining parcels to ZCTAs...")
    pts = gpd.GeoDataFrame(geometry=centroids_ll, crs=CRS)
    zcta_join = gpd.sjoin(
        pts,
        zcta_gdf[["zcta", "water_score", "ej_score", "seismic_score",
                  "flood_score", "aquifer_score", "soil_score", "slope_score",
                  "flatness_score", "protected_score", "geometry"]],
        how="left", predicate="within",
    )
    zcta_join = zcta_join[~zcta_join.index.duplicated(keep="first")]

    parcels["zcta"]           = zcta_join["zcta"].values
    parcels["zcta_flat_gate"] = (zcta_join["flatness_score"].fillna(1).values == 0).astype(int)
    parcels["zcta_prot_gate"] = (zcta_join["protected_score"].fillna(1).values == 0).astype(int)

    # Inherit individual ZCTA scores (unbundled for independent slider weighting)
    for col in ["water_score", "ej_score", "seismic_score", "flood_score",
                "aquifer_score", "soil_score", "slope_score"]:
        parcels[col] = zcta_join[col].fillna(0).values

    # ── Transmission proximity ──
    print("  Computing transmission proximity...")
    tx_proj  = tx_gdf.to_crs(UTM)
    tx_union = tx_proj.geometry.unary_union
    tx_dists = np.array([tx_union.distance(pt) for pt in centroids_utm])
    p95      = np.percentile(tx_dists[tx_dists < 1e9], 95)
    parcels["tx_dist_m"] = tx_dists
    parcels["tx_score"]  = (1.0 - (tx_dists / p95).clip(0, 1))

    # ── Acreage score (log-normalized) ──
    print("  Computing acreage score...")
    acres     = parcels["TotalAcres"].clip(lower=5).fillna(5)
    log_acres = np.log10(acres)
    p95_log   = np.percentile(log_acres, 95)
    parcels["acreage_score"] = (log_acres / p95_log).clip(0, 1)

    # ── Vacant/undeveloped score ──
    print("  Computing vacant score...")
    bldg  = parcels["BldgValue"].fillna(0).clip(lower=0)
    land  = parcels["LandValue"].fillna(0).clip(lower=0)
    total = (bldg + land).clip(lower=1)
    parcels["vacant_score"] = (1.0 - (bldg / total).clip(0, 1))

    # ── Composite (equal weight across 10 dimensions as default balanced) ──
    parcels["composite_score"] = (
        parcels["water_score"]   * 0.10 +
        parcels["ej_score"]      * 0.10 +
        parcels["seismic_score"] * 0.10 +
        parcels["flood_score"]   * 0.10 +
        parcels["aquifer_score"] * 0.10 +
        parcels["soil_score"]    * 0.10 +
        parcels["slope_score"]   * 0.10 +
        parcels["tx_score"]      * 0.10 +
        parcels["acreage_score"] * 0.10 +
        parcels["vacant_score"]  * 0.10
    )

    # ── Hard gates ──
    gated = (parcels["zcta_flat_gate"] == 1) | (parcels["zcta_prot_gate"] == 1)
    parcels.loc[gated, "composite_score"] = 0.0
    parcels["gated"] = gated.astype(int)
    print(f"  {gated.sum():,} parcels inherit ZCTA hard gate (flatness or protected)")

    return parcels


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("\n=== Tri-Cities Parcel Dossier (Benton + Franklin Counties) ===\n")

    print("Loading supporting layers...")
    zcta_gdf = gpd.read_file(DATA_DIR / "zcta" / "grid_scores.geojson")
    tx_gdf   = gpd.read_file(DATA_DIR / "raw" / "transmission.geojson")
    print(f"  ZCTA: {len(zcta_gdf)} ZCTAs")
    print(f"  Transmission: {len(tx_gdf)} segments")

    print("\nFetching Tri-Cities parcels (>= 5 acres, Benton + Franklin counties)...")
    parcels = fetch_parcels()
    print(f"  Raw from cache: {len(parcels):,} parcels")

    print("\nFiltering...")
    parcels = filter_parcels(parcels)

    print("\nScoring...")
    parcels = score_parcels(parcels, zcta_gdf, tx_gdf)

    # ── DOR distribution ──
    print("\nDOR code distribution (top 15 by count, viable parcels):")
    dor_counts = (
        parcels[parcels["gated"] == 0]["DepartmentOfRevenueCode"]
        .astype(str).value_counts().head(15)
    )
    for code, n in dor_counts.items():
        print(f"  {code:>6}  {n:>5} parcels")

    # ── Save full scored layer ──
    out_cols = [
        "PARCEL", "FIPS_NR", "zcta", "TotalAcres", "DepartmentOfRevenueCode",
        "LandValue", "BldgValue", "IncorporatedCity", "ZipCode",
        "water_score", "ej_score", "seismic_score", "flood_score",
        "aquifer_score", "soil_score", "slope_score",
        "tx_score", "acreage_score", "vacant_score",
        "composite_score", "tx_dist_m", "gated",
        "zcta_flat_gate", "zcta_prot_gate", "geometry",
    ]
    out_cols = [c for c in out_cols if c in parcels.columns]
    parcels[out_cols].to_file(OUT_SCORED, driver="GeoJSON")
    print(f"\nSaved {len(parcels):,} parcels to {OUT_SCORED}")

    # ── Top 50 CSV ──
    viable = parcels[parcels["gated"] == 0].sort_values(
        "composite_score", ascending=False
    ).head(50)

    csv_cols = [
        "PARCEL", "FIPS_NR", "zcta", "TotalAcres", "DepartmentOfRevenueCode",
        "IncorporatedCity", "ZipCode",
        "LandValue", "BldgValue",
        "water_score", "ej_score", "seismic_score", "flood_score",
        "aquifer_score", "soil_score", "slope_score",
        "tx_score", "acreage_score", "vacant_score",
        "composite_score", "tx_dist_m",
    ]
    csv_cols = [c for c in csv_cols if c in viable.columns]
    viable[csv_cols].round(3).to_csv(OUT_TOP50, index=False)
    print(f"Saved top 50 to {OUT_TOP50}")

    # ── Web layer (all viable, simplified) ──
    print("\nGenerating web layer...")
    web_cols = [
        "PARCEL", "FIPS_NR", "zcta", "TotalAcres", "DepartmentOfRevenueCode",
        "IncorporatedCity", "ZipCode",
        "water_score", "ej_score", "seismic_score", "flood_score",
        "aquifer_score", "soil_score", "slope_score",
        "tx_score", "acreage_score", "vacant_score",
        "composite_score", "tx_dist_m", "gated", "geometry",
    ]
    web_cols = [c for c in web_cols if c in parcels.columns]
    top_web = parcels[parcels["gated"] == 0].copy()[web_cols]
    for col in ["water_score", "ej_score", "seismic_score", "flood_score",
                "aquifer_score", "soil_score", "slope_score",
                "tx_score", "acreage_score", "vacant_score",
                "composite_score", "tx_dist_m", "TotalAcres"]:
        if col in top_web.columns:
            top_web[col] = top_web[col].round(3)
    top_web.geometry = top_web.geometry.simplify(0.005, preserve_topology=True)
    top_web.to_file(OUT_WEB, driver="GeoJSON")
    sz = OUT_WEB.stat().st_size / 1e6
    print(f"Web layer: {len(top_web):,} parcels → {OUT_WEB.name} ({sz:.1f} MB)")

    print("\n── Top 10 parcels ──────────────────────────────────────────────")
    for _, row in viable.head(10).iterrows():
        city = str(row.get("IncorporatedCity", "")).strip() or "Unincorporated"
        dor  = str(row.get("DepartmentOfRevenueCode", "")).strip()
        fips = row.get("FIPS_NR", "?")
        county = "Benton" if fips == "005" else ("Franklin" if fips == "021" else fips)
        print(
            f"  {str(row['PARCEL']):<22}  {row['TotalAcres']:>7.1f} ac  "
            f"DOR:{dor:<4}  ZCTA:{row.get('zcta','?'):<6}  "
            f"composite:{row['composite_score']:.3f}  "
            f"tx:{row['tx_score']:.3f}  "
            f"{city:<14}  {county}"
        )
    print()


if __name__ == "__main__":
    main()
