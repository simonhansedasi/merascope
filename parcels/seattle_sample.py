"""
seattle_sample.py -- Parcel-level battery-storage (BESS) screening sample, Seattle.

A proof-of-concept chunk, not a product feature: fetches the King County parcels
inside one bounding box (default: the Duwamish industrial area, SODO to South
Park), joins Seattle zoning and Environmentally Critical Area (ECA) layers,
scores each parcel with the BESS weight vector, and writes a CSV + GeoJSON.

Scoring (all components 0-1, higher = better; weights = server.py _SITE_TYPES['bess']):
  parcel-level:   transmission (25), substation (20), flood (10), slope (10)
  ZCTA-inherited: grid_capacity (20), seismic (10), community/ej (5)
Parcel distances are put on the same scale as the WA ZCTA scores: inverted,
min-max between the p01 and p99 of WA ZCTA tx_dist_m / substation_dist_m.
"Substation" is the EIA-860 plant proxy used by the main pipeline (data/shared/
substations.csv), not real substation locations.

Polite and resumable: every layer is cached to data/WA/parcels/seattle_<layer>.geojson
and skipped on re-run; 2.5 s between requests; retries with backoff.

Usage:
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -u parcels/seattle_sample.py
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

ROOT = Path(__file__).resolve().parent.parent
WA = ROOT / "data" / "WA"
OUT = WA / "parcels"
OUT.mkdir(parents=True, exist_ok=True)

# Duwamish industrial chunk (lon_min, lat_min, lon_max, lat_max)
BBOX = (-122.360, 47.535, -122.310, 47.585)
AREA = "duwamish"

UA = {"User-Agent": "Mozilla/5.0 (merascope research; simonhans@merascope.com)"}
DELAY = 2.5
SEA = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/"

# name -> (url, outFields)
LAYERS = {
    "parcels": (
        "https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_PropertyInfo/MapServer/2",
        "PIN,ADDR_FULL,ZIP5,CTYNAME,LOTSQFT,APPRLNDVAL,APPR_IMPR,PROPTYPE,KCA_ZONING,KCA_ACRES,PREUSE_CODE,PREUSE_DESC",
    ),
    "zoning": (SEA + "Current_Land_Use_Zoning_Detail_2/FeatureServer/0", "ZONING"),
    "eca_flood": (SEA + "ECA_Flood_Prone_Areas/FeatureServer/0", "FLOOD"),
    "eca_liquefaction": (SEA + "ECA_Liquefaction_Prone_Areas/FeatureServer/5", "*"),
    "eca_steep": (SEA + "Environmentally_Critical_Areas_Steep_Slope/FeatureServer/9", "*"),
    "eca_slide": (SEA + "Environmentally_Critical_Areas_Known_Slides/FeatureServer/1", "*"),
    "eca_wetland": (SEA + "Environmentally_Critical_Areas_Wetlands/FeatureServer/10", "*"),
    "eca_landfill": (SEA + "ECA_Landfills_Historical/FeatureServer/4", "*"),
}

# server.py _SITE_TYPES['bess']['weights'] -- keep in sync (first-cut, unvalidated)
BESS_WEIGHTS = {"transmission": 25, "substation": 20, "grid_capacity": 20,
                "flood": 10, "seismic": 10, "slope": 10, "community": 5}

MIN_ACRES = 0.5            # assumption: smallest parcel worth screening for BESS
FLOOD_GATE_FRAC = 0.5      # gate out parcels >50% inside the ECA flood-prone area
UTM = "EPSG:32610"
RESIDENTIAL_ZONE_PREFIX = ("NR", "RSL", "SF", "LR", "MR", "HR", "RM", "R")


# ── fetch (index count first, then paged, cached, resumable) ──────────────────

def _get(url, params, tries=5):
    for attempt in range(1, tries + 1):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=90)
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 60 * attempt))
                print(f"    429, sleeping {wait}s", flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(data["error"])
            return data
        except Exception as e:  # noqa: BLE001 -- log and retry any transient failure
            print(f"    attempt {attempt}/{tries} failed: {e}", flush=True)
            time.sleep(10 * attempt)
    raise RuntimeError(f"giving up on {url}")


def fetch(name):
    cache = OUT / f"seattle_{AREA}_{name}.geojson"
    if cache.exists():
        print(f"  {name}: cached", flush=True)
        return gpd.read_file(cache)
    url, fields = LAYERS[name]
    base = {"where": "1=1", "geometry": ",".join(map(str, BBOX)),
            "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects"}
    total = _get(url + "/query", {**base, "returnCountOnly": "true", "f": "json"})["count"]
    print(f"  {name}: {total:,} features in bbox", flush=True)
    feats, offset, page = [], 0, 1000
    while offset < total:
        d = _get(url + "/query", {**base, "outFields": fields, "returnGeometry": "true",
                                  "outSR": 4326, "f": "geojson",
                                  "resultOffset": offset, "resultRecordCount": page})
        got = d.get("features", [])
        if not got:
            break
        feats += got
        offset += page
        print(f"    {len(feats):,}/{total:,}", flush=True)
        time.sleep(DELAY)
    time.sleep(DELAY)
    gdf = gpd.GeoDataFrame.from_features({"type": "FeatureCollection", "features": feats}, crs="EPSG:4326")
    gdf.to_file(cache, driver="GeoJSON")
    return gdf


# ── scoring helpers ───────────────────────────────────────────────────────────

def inv_minmax(d, p01, p99):
    return 1.0 - np.clip((d - p01) / (p99 - p01), 0, 1)


def overlap_frac(parcels_utm, layer_gdf):
    """Share of each parcel's area inside a hazard layer (0 if the layer is empty)."""
    if layer_gdf is None or len(layer_gdf) == 0:
        return np.zeros(len(parcels_utm))
    union = layer_gdf.to_crs(UTM).geometry.unary_union
    inter = parcels_utm.geometry.intersection(union).area
    return (inter / parcels_utm.geometry.area).clip(0, 1).values


def main():
    print(f"\n=== Seattle BESS screening sample: {AREA} {BBOX} ===\n", flush=True)
    print("Fetching layers (cached layers are skipped)...", flush=True)
    raw = {n: fetch(n) for n in LAYERS}
    parcels = raw["parcels"]
    print(f"\nParcels fetched: {len(parcels):,}")

    # ── eligibility filter ──
    before = len(parcels)
    parcels = parcels[parcels.geometry.notna() & ~parcels.geometry.is_empty].copy()
    parcels = parcels.drop_duplicates("PIN")
    parcels["acres"] = parcels["LOTSQFT"].fillna(0) / 43560.0
    parcels = parcels[parcels["acres"] >= MIN_ACRES].reset_index(drop=True)
    p_utm = parcels.to_crs(UTM)
    cent_ll = parcels.geometry.centroid
    cent = p_utm.geometry.centroid
    print(f"After dedupe + >= {MIN_ACRES} acre filter: {len(parcels):,} (from {before:,})")

    # ── zoning (parcel centroid -> Seattle zoning polygon) ──
    z = raw["zoning"][["ZONING", "geometry"]]
    zj = gpd.sjoin(gpd.GeoDataFrame(geometry=cent_ll, crs="EPSG:4326"), z, how="left", predicate="within")
    zj = zj[~zj.index.duplicated(keep="first")]
    parcels["zoning"] = zj["ZONING"].values
    zone = parcels["zoning"].fillna("").astype(str)
    parcels["residential_zone"] = zone.str.upper().str.startswith(RESIDENTIAL_ZONE_PREFIX).values
    n_res = int(parcels["residential_zone"].sum())
    parcels = parcels[~parcels["residential_zone"]].reset_index(drop=True)
    p_utm = parcels.to_crs(UTM)
    cent_ll = parcels.geometry.centroid
    cent = p_utm.geometry.centroid
    print(f"Removed {n_res:,} residentially zoned; {len(parcels):,} parcels remain")

    # ── ECA hazard overlap (share of parcel area) ──
    for key, col in [("eca_flood", "flood_frac"), ("eca_liquefaction", "liquefaction_frac"),
                     ("eca_steep", "steep_frac"), ("eca_slide", "slide_frac"),
                     ("eca_wetland", "wetland_frac"), ("eca_landfill", "landfill_frac")]:
        parcels[col] = overlap_frac(p_utm, raw[key])
    print("ECA overlap computed")

    # ── ZCTA-inherited scores ──
    zc = gpd.read_file(WA / "zcta" / "grid_scores.geojson")
    inh = ["zcta", "grid_capacity_score", "seismic_score", "ej_score", "tx_dist_m", "substation_dist_m"]
    zj = gpd.sjoin(gpd.GeoDataFrame(geometry=cent_ll, crs="EPSG:4326"), zc[inh + ["geometry"]],
                   how="left", predicate="within")
    zj = zj[~zj.index.duplicated(keep="first")]
    for c in ["zcta", "grid_capacity_score", "seismic_score", "ej_score"]:
        parcels[c] = zj[c].values
    parcels["grid_capacity_score"] = parcels["grid_capacity_score"].astype(float)

    # ── parcel-level distances ──
    tx = gpd.read_file(WA / "raw" / "transmission.geojson").to_crs(UTM)
    tx_union = tx.geometry.unary_union
    parcels["tx_dist_m"] = [tx_union.distance(pt) for pt in cent]
    sub = pd.read_csv(ROOT / "data" / "shared" / "substations.csv")
    sub = gpd.GeoDataFrame(geometry=gpd.points_from_xy(sub["lon"], sub["lat"]), crs="EPSG:4326").to_crs(UTM)
    sub_union = sub.geometry.unary_union
    parcels["substation_dist_m"] = [sub_union.distance(pt) for pt in cent]

    tx_lo, tx_hi = np.percentile(zc["tx_dist_m"].dropna(), [1, 99])
    sb_lo, sb_hi = np.percentile(zc["substation_dist_m"].dropna(), [1, 99])
    parcels["transmission_score"] = inv_minmax(parcels["tx_dist_m"].values, tx_lo, tx_hi)
    parcels["substation_score"] = inv_minmax(parcels["substation_dist_m"].values, sb_lo, sb_hi)

    # ── parcel hazard components ──
    parcels["flood_score"] = 1.0 - parcels["flood_frac"]
    parcels["slope_score"] = 1.0 - np.maximum(parcels["steep_frac"], parcels["slide_frac"])
    parcels["community_score"] = parcels["ej_score"]
    parcels["seismic_score"] = parcels["seismic_score"].astype(float)

    comp = {"transmission": "transmission_score", "substation": "substation_score",
            "grid_capacity": "grid_capacity_score", "flood": "flood_score",
            "seismic": "seismic_score", "slope": "slope_score", "community": "community_score"}
    wsum = sum(BESS_WEIGHTS.values())
    parcels["composite"] = sum(parcels[col].fillna(0.5) * BESS_WEIGHTS[k] for k, col in comp.items()) / wsum

    # ── gates and flags ──
    parcels["gate_flood"] = parcels["flood_frac"] > FLOOD_GATE_FRAC
    parcels["flag_liquefaction"] = parcels["liquefaction_frac"] > 0.5
    parcels["flag_wetland"] = parcels["wetland_frac"] > 0
    parcels["flag_landfill"] = parcels["landfill_frac"] > 0
    parcels["flag_slide"] = parcels["slide_frac"] > 0
    parcels["gated"] = parcels["gate_flood"]
    parcels["vacant_ratio"] = 1.0 - (parcels["APPR_IMPR"].fillna(0) /
                                     (parcels["APPR_IMPR"].fillna(0) + parcels["APPRLNDVAL"].fillna(0)).clip(lower=1))
    parcels["rank"] = parcels.loc[~parcels["gated"], "composite"].rank(ascending=False, method="first")

    keep = ["PIN", "ADDR_FULL", "zcta", "zoning", "PREUSE_DESC", "acres", "vacant_ratio",
            "tx_dist_m", "substation_dist_m",
            "transmission_score", "substation_score", "grid_capacity_score", "flood_score",
            "seismic_score", "slope_score", "community_score", "composite",
            "flood_frac", "liquefaction_frac", "steep_frac", "slide_frac", "wetland_frac", "landfill_frac",
            "gate_flood", "flag_liquefaction", "flag_wetland", "flag_landfill", "flag_slide", "gated", "rank"]
    out = parcels[keep + ["geometry"]]
    csv_path = OUT / f"seattle_{AREA}_scored.csv"
    out.drop(columns="geometry").round(4).to_csv(csv_path, index=False)
    gj = out.copy()
    gj.geometry = gj.geometry.simplify(0.00002, preserve_topology=True)
    gj.round(4).to_file(OUT / f"seattle_{AREA}_scored.geojson", driver="GeoJSON")
    meta = {"bbox": BBOX, "min_acres": MIN_ACRES, "flood_gate_frac": FLOOD_GATE_FRAC,
            "weights": BESS_WEIGHTS, "tx_scale_m": [float(tx_lo), float(tx_hi)],
            "substation_scale_m": [float(sb_lo), float(sb_hi)],
            "n_fetched": int(before), "n_screened": int(len(parcels)),
            "n_gated": int(parcels["gated"].sum())}
    (OUT / f"seattle_{AREA}_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"\nScreened {len(parcels):,}; gated (flood) {int(parcels['gated'].sum()):,}")
    print(f"Wrote {csv_path.name}")
    top = out[~out["gated"]].sort_values("composite", ascending=False).head(10)
    print(top[["PIN", "ADDR_FULL", "zoning", "acres", "composite", "tx_dist_m", "substation_dist_m"]].round(3).to_string(index=False))


if __name__ == "__main__":
    sys.exit(main())
