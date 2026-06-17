"""
grant_county.py — Parcel-level data center siting dossier for Grant County, WA.

Fetches all parcels >= 5 acres from Grant County's ArcGIS Open Data portal,
scores each on four dimensions, and joins with ZCTA study scores.

Scoring dimensions:
  zcta_score    — inherited from ZCTA study (join by centroid)
  tx_score      — proximity to HV transmission line
  acreage_score — log-normalized parcel size (larger = better)
  vacant_score  — 1 - (building value / total value); low building = undeveloped

Hard gates:
  - ZCTA flatness_score == 0 or protected_score == 0 → excluded
  - DOR code starts with '3' (residential) → excluded
  - IsExempt == 'True' (government / nonprofit) → excluded

Output:
  data/WA/parcels/grant_county_parcels.geojson   — all viable scored parcels
  data/WA/parcels/grant_county_top50.csv         — top 50 by composite score

Usage:
  conda activate merascope
  python parcels/grant_county.py
"""

import io
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

PARCEL_CACHE = OUT_DIR / "grant_county_raw.geojson"
OUT_SCORED   = OUT_DIR / "grant_county_parcels.geojson"
OUT_TOP50    = OUT_DIR / "grant_county_top50.csv"
OUT_WEB      = OUT_DIR / "grant_county_web.geojson"

FEATURE_SERVER = (
    "https://services2.arcgis.com/hQZvdtFxRzJpMtdS"
    "/arcgis/rest/services/Parcels/FeatureServer/0"
)
FIELDS = ",".join([
    "PARCEL", "TotalAcres", "DepartmentOfRevenueCode", "PropertyClass",
    "PrimaryLandType", "PrimaryImprovement",
    "MarketLandValue", "MarketBuildingValue", "TotalMarketValue",
    "OwnerCode", "LastName", "FirstName",
    "Situs", "IncorporatedCity", "IsExempt", "ParcelType",
])
PAGE_SIZE = 2000
CRS       = "EPSG:4326"
UTM       = "EPSG:32610"   # WA UTM zone 10N


# ── Fetch ──────────────────────────────────────────────────────────────────────

def _count(where):
    r = requests.get(
        f"{FEATURE_SERVER}/query",
        params={"where": where, "returnCountOnly": "true", "f": "json"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("count", 0)


def _fetch_page(where, offset):
    r = requests.get(
        f"{FEATURE_SERVER}/query",
        params={
            "where": where,
            "outFields": FIELDS,
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def fetch_parcels(where="TotalAcres >= 5"):
    if PARCEL_CACHE.exists():
        print(f"  Loading cached parcels from {PARCEL_CACHE.name}...")
        return gpd.read_file(PARCEL_CACHE)

    print(f"  Counting parcels where {where}...")
    total = _count(where)
    print(f"  {total:,} parcels found — fetching in pages of {PAGE_SIZE}...")

    all_features = []
    offset = 0
    while offset < total:
        page = _fetch_page(where, offset)
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

    # Drop exempt / government
    exempt_mask = gdf["IsExempt"].astype(str).str.upper() == "TRUE"
    gdf = gdf[~exempt_mask]

    # Drop residential DOR codes (codes starting with '3')
    dor = gdf["DepartmentOfRevenueCode"].astype(str).str.strip()
    residential = dor.str.startswith("3")
    gdf = gdf[~residential]

    # Drop null geometries
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]

    print(f"  Filtered {before:,} → {len(gdf):,} parcels "
          f"(removed {before - len(gdf):,} exempt/residential/null)")
    return gdf.reset_index(drop=True)


# ── Score ──────────────────────────────────────────────────────────────────────

def score_parcels(parcels, zcta_gdf, tx_gdf):
    parcels = parcels.copy()
    crs_proj = UTM

    # ── Centroids for spatial ops ──
    centroids = parcels.to_crs(crs_proj).geometry.centroid
    centroids_ll = parcels.geometry.centroid

    # ── ZCTA score: spatial join centroid → ZCTA ──
    print("  Joining parcels to ZCTAs...")
    pts = gpd.GeoDataFrame(geometry=centroids_ll, crs=CRS)
    zcta_join = gpd.sjoin(pts, zcta_gdf[["zcta", "water_score", "ej_score", "seismic_score",
                                          "flood_score", "aquifer_score", "soil_score",
                                          "slope_score", "flatness_score", "protected_score",
                                          "geometry"]],
                          how="left", predicate="within")
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
    tx_proj    = tx_gdf.to_crs(crs_proj)
    tx_union   = tx_proj.geometry.unary_union
    tx_dists   = np.array([tx_union.distance(pt) for pt in centroids])
    p95        = np.percentile(tx_dists[tx_dists < 1e9], 95)
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
    bldg  = parcels["MarketBuildingValue"].fillna(0).clip(lower=0)
    total = parcels["TotalMarketValue"].fillna(0).clip(lower=1)
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

    # ── Apply hard gates ──
    gated = (parcels["zcta_flat_gate"] == 1) | (parcels["zcta_prot_gate"] == 1)
    parcels.loc[gated, "composite_score"] = 0.0
    parcels["gated"] = gated.astype(int)
    print(f"  {gated.sum():,} parcels inherit ZCTA hard gate (flatness or protected)")

    return parcels


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("\n=== Grant County Parcel Dossier ===\n")

    print("Loading supporting layers...")
    zcta_gdf = gpd.read_file(DATA_DIR / "zcta" / "grid_scores.geojson")
    tx_gdf   = gpd.read_file(DATA_DIR / "raw" / "transmission.geojson")
    print(f"  ZCTA: {len(zcta_gdf)} ZCTAs")
    print(f"  Transmission: {len(tx_gdf)} segments")

    print("\nFetching Grant County parcels (TotalAcres >= 5)...")
    parcels = fetch_parcels()
    print(f"  Raw: {len(parcels):,} parcels")

    print("\nFiltering...")
    parcels = filter_parcels(parcels)

    print("\nScoring...")
    parcels = score_parcels(parcels, zcta_gdf, tx_gdf)

    # ── DOR code distribution ──
    print("\nDOR code distribution (top 15 by count):")
    dor_counts = (parcels[parcels["gated"] == 0]["DepartmentOfRevenueCode"]
                  .value_counts().head(15))
    for code, n in dor_counts.items():
        print(f"  {code:>6}  {n:>5} parcels")

    # ── Save full scored layer ──
    out_cols = [
        "PARCEL", "zcta", "TotalAcres", "DepartmentOfRevenueCode",
        "PrimaryLandType", "PropertyClass",
        "MarketLandValue", "MarketBuildingValue", "TotalMarketValue",
        "LastName", "FirstName", "Situs", "IncorporatedCity",
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
        "PARCEL", "zcta", "TotalAcres", "DepartmentOfRevenueCode",
        "PrimaryLandType", "Situs", "IncorporatedCity",
        "LastName", "FirstName",
        "TotalMarketValue", "MarketBuildingValue",
        "water_score", "ej_score", "seismic_score", "flood_score",
        "aquifer_score", "soil_score", "slope_score",
        "tx_score", "acreage_score", "vacant_score",
        "composite_score", "tx_dist_m",
    ]
    csv_cols = [c for c in csv_cols if c in viable.columns]
    viable[csv_cols].round(3).to_csv(OUT_TOP50, index=False)
    print(f"Saved top 50 to {OUT_TOP50}")

    # ── Web layer (top N simplified for map) ──
    print("\nGenerating web layer...")
    web_cols = [
        "PARCEL", "zcta", "TotalAcres", "DepartmentOfRevenueCode",
        "PrimaryLandType", "LastName", "Situs", "IncorporatedCity",
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
    # 0.005 deg (~400m) is fine for large agricultural parcels at county zoom
    top_web.geometry = top_web.geometry.simplify(0.005, preserve_topology=True)
    top_web.to_file(OUT_WEB, driver="GeoJSON")
    sz = OUT_WEB.stat().st_size / 1e6
    print(f"Web layer: {len(top_web):,} parcels → {OUT_WEB.name} ({sz:.1f} MB)")

    print("\n── Top 10 parcels ──────────────────────────────────────────────")
    for _, row in viable.head(10).iterrows():
        owner = str(row.get("LastName", "")).strip() or "Unknown"
        situs = str(row.get("Situs", "")).strip() or "No address"
        city  = str(row.get("IncorporatedCity", "")).strip() or "Unincorporated"
        dor   = str(row.get("DepartmentOfRevenueCode", "")).strip()
        print(
            f"  {row['PARCEL']:<14}  {row['TotalAcres']:>7.1f} ac  "
            f"DOR:{dor:<4}  ZCTA:{row.get('zcta','?'):<6}  "
            f"composite:{row['composite_score']:.3f}  "
            f"tx:{row['tx_score']:.3f}  "
            f"{city:<14}  {owner:<20}  {situs}"
        )
    print()


if __name__ == "__main__":
    main()
