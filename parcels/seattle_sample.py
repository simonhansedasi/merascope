"""
seattle_sample.py -- Parcel-level battery-storage (BESS) screening sample, Seattle.

A proof-of-concept chunk, not a product feature: fetches the King County parcels
inside one bounding box (default: the Duwamish industrial area, SODO to South
Park), joins Seattle zoning, hazard, building and receptor layers, and writes a
CSV + GeoJSON.

v2 (2026-10-29) design: the free ZCTA map already carries the area-level signal,
so the parcel score ranks ONLY on things that vary parcel to parcel. ZCTA-inherited
numbers are kept as "area context" columns and are NOT in the ranking.
v3 (2026-10-29): scales recalibrated to published references (see REFERENCES below),
usable-area replaces the neighbour-building distance, and a zoning use-status column
is added. Weights are still illustrative and NOT validated against permitting outcomes.

Parcel evidence components (0-1, higher = better):
  res_setback      20  distance from the parcel to the nearest residentially zoned land
  receptor         10  distance to the nearest school, hospital or community center
  usable_area      15  parcel area left after a 10 ft inset from lot lines and 10 ft
                       around buildings on the parcel (model fire code exposure spacing)
  transmission     15  distance to the nearest mapped transmission line
  flood            15  share of the parcel outside the ECA flood-prone area
  liquefaction     10  share outside the ECA liquefaction-prone area
  site_hazard      15  share outside ECA steep slope / known slide / wetland / landfill
The substation proxy (EIA plants) is dropped from the ranking: it is not real
substation data. Mapped OSM substations (if the fetch succeeds) are context only.

REFERENCES for the scales (draft, model or peer rules -- none is Seattle law):
  * IFC 1207.8.3 / NFPA 855: outdoor ESS >= 10 ft from lot lines, public ways,
    buildings and other exposures (3 ft with a fire barrier); "remote" if > 100 ft.
  * Thurston County WA model recommendation (Tier 2): 100 ft to adjacent residential
    property, 20 ft to adjacent commercial/industrial property.
  * Whitman County WA draft Ch. 19.66: Tier 3 systems 500 ft from residentially zoned
    property; peer rural counties 200-600 ft to residences / occupied buildings.
  Source for the last two: Whitman County "BESS Ordinance Comparison Table" (2026-04-01).

Candidates are filtered by county use code (EXCLUDE_USES), residential zoning and
a minimum footprint; each exclusion is counted in the meta file.

Polite and resumable: every layer is cached to data/WA/parcels/seattle_<area>_<layer>.geojson
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
from shapely.geometry import MultiPoint

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
WA = ROOT / "data" / "WA"
OUT = WA / "parcels"
OUT.mkdir(parents=True, exist_ok=True)

# Duwamish industrial chunk (lon_min, lat_min, lon_max, lat_max)
BBOX = (-122.360, 47.535, -122.310, 47.585)
PAD = 0.01   # context layers are fetched over a padded box so edge parcels see their neighbours
PBBOX = (BBOX[0] - PAD, BBOX[1] - PAD, BBOX[2] + PAD, BBOX[3] + PAD)
AREA = "duwamish"

UA = {"User-Agent": "Mozilla/5.0 (merascope research; simonhans@merascope.com)"}
DELAY = 2.5
SEA = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/"

# name -> (url, outFields, padded?)
LAYERS = {
    "parcels": (
        "https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_PropertyInfo/MapServer/2",
        "PIN,ADDR_FULL,ZIP5,CTYNAME,LOTSQFT,APPRLNDVAL,APPR_IMPR,PROPTYPE,KCA_ZONING,KCA_ACRES,PREUSE_CODE,PREUSE_DESC",
        False),
    "zoning": (SEA + "Current_Land_Use_Zoning_Detail_2/FeatureServer/0", "ZONING", True),
    "eca_flood": (SEA + "ECA_Flood_Prone_Areas/FeatureServer/0", "FLOOD", False),
    "eca_liquefaction": (SEA + "ECA_Liquefaction_Prone_Areas/FeatureServer/5", "*", False),
    "eca_steep": (SEA + "Environmentally_Critical_Areas_Steep_Slope/FeatureServer/9", "*", False),
    "eca_slide": (SEA + "Environmentally_Critical_Areas_Known_Slides/FeatureServer/1", "*", False),
    "eca_wetland": (SEA + "Environmentally_Critical_Areas_Wetlands/FeatureServer/10", "*", False),
    "eca_landfill": (SEA + "ECA_Landfills_Historical/FeatureServer/4", "*", False),
    "buildings": (SEA + "Building_Outlines_2023/FeatureServer/0", "PIN", True),
    "fire_stations": (SEA + "Fire_Stations/FeatureServer/0", "STNID", True),
    "hospital": (SEA + "Hospital/FeatureServer/0", "FACILITY", True),
    "school_public": (SEA + "Public_School/FeatureServer/0", "NAME", True),
    "school_private": (SEA + "Private_School/FeatureServer/0", "NAME", True),
    "community_centers": (SEA + "Community_Centers/FeatureServer/0", "NAME", True),
    "low_fire_flow": (SEA + "Low_Fire_Flow_Areas/FeatureServer/0", "LOW_FIRE_FLOW", False),
    "ej_priority": (SEA + "Environmental_Justice_Priority_Areas_Based_on_2020_Composite_Index/FeatureServer/104", "Name", False),
}

# Illustrative parcel-evidence weights (sum 100) -- NOT validated.
WEIGHTS = {"res_setback": 20, "receptor": 10, "usable_area": 15, "transmission": 15,
           "flood": 15, "liquefaction": 10, "site_hazard": 15}

FT = 0.3048
# Distance (m) at which each distance component reaches a score of 1.0 (see REFERENCES).
RES_FULL_M = 500 * FT         # 500 ft: top of the published WA/peer range for residential setbacks
RECEPTOR_FULL_M = 500 * FT    # same basis (Whitman draft: 500 ft from occupied structures)
LOT_INSET_M = 10 * FT         # IFC 1207.8.3 / NFPA 855 exposure spacing
USABLE_FULL_M2 = 4047.0       # 1 acre of usable area scores 1.0 -- an assumption, not a code value
BLDG_CAP_M = 100              # cap for the neighbour-building flag distance

MIN_ACRES = 0.5            # assumption: smallest parcel worth screening for BESS
FLOOD_GATE_FRAC = 0.5      # gate out parcels >50% inside the ECA flood-prone area
UTM = "EPSG:32610"
RESIDENTIAL_ZONE_PREFIX = ("NR", "RSL", "SF", "LR", "MR", "HR", "RM", "R")

# County use descriptions that are not realistically available to a developer.
EXCLUDE_USES = {
    "right of way / public utility": ["Right of Way/Utility", "Utility, Public"],
    "water / tideland": ["Tideland", "River/Creek/Stream", "Marina"],
    "park / open space": ["Park, Public"],
    "public institution": ["School", "Governmental Service", "Post Office", "Hospital", "Church", "Library"],
    "residential / lodging": ["Apartment", "Hotel/Motel", "Residential", "Condominium", "Mobile Home"],
    "operating terminal": ["Terminal(", "Air Terminal"],
    "parking structure": ["Parking(Garage)"],
}


# ── fetch (count first, then paged, cached, resumable) ────────────────────────

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
    url, fields, padded = LAYERS[name]
    box = PBBOX if padded else BBOX
    base = {"where": "1=1", "geometry": ",".join(map(str, box)),
            "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects"}
    total = _get(url + "/query", {**base, "returnCountOnly": "true", "f": "json"})["count"]
    print(f"  {name}: {total:,} features in {'padded ' if padded else ''}bbox", flush=True)
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
        if len(feats) % 5000 < page or offset >= total:
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


def dist_to(parcels_utm, layer_gdf):
    """Distance (m) from each parcel boundary to the nearest feature of a layer (inf if empty)."""
    if layer_gdf is None or len(layer_gdf) == 0:
        return np.full(len(parcels_utm), np.inf)
    union = layer_gdf.to_crs(UTM).geometry.unary_union
    return parcels_utm.geometry.distance(union).values


def building_exposure(parcels_utm, bldg_utm):
    """Distance (m, capped) from each parcel to the nearest building whose centroid
    lies on a DIFFERENT parcel. Buildings on the parcel itself do not count."""
    cents = bldg_utm.geometry.centroid
    sindex = bldg_utm.sindex
    out = np.full(len(parcels_utm), float(BLDG_CAP_M))
    for i, geom in enumerate(parcels_utm.geometry):
        cand = sindex.query(geom.buffer(BLDG_CAP_M), predicate="intersects")
        if len(cand) == 0:
            continue
        mine = cents.iloc[cand].within(geom).values
        others = bldg_utm.geometry.iloc[cand[~mine]]
        if len(others):
            out[i] = min(BLDG_CAP_M, float(others.distance(geom).min()))
    return out


def osm_substations():
    """Mapped substations (OSM power=substation, minus 'transition' stations) over the padded
    box, cached to JSON. Coverage is partial (Seattle City Light has ~16 major substations),
    so the distance is a context column, not part of the ranking. Returns a GeoDataFrame."""
    cache = OUT / f"seattle_{AREA}_osm_substations.json"
    if not cache.exists():
        q = ('[out:json][timeout:60];nwr["power"="substation"](%s,%s,%s,%s);out center tags;'
             % (PBBOX[1], PBBOX[0], PBBOX[3], PBBOX[2]))
        for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
            for attempt in range(3):
                try:
                    r = requests.post(url, data={"data": q}, headers={**UA, "Accept": "*/*"}, timeout=120)
                    if r.ok:
                        cache.write_text(r.text)
                        break
                    print(f"    overpass {r.status_code}, retrying", flush=True)
                except Exception as e:  # noqa: BLE001
                    print(f"    overpass error: {e}", flush=True)
                time.sleep(20 * (attempt + 1))
            if cache.exists():
                break
    if not cache.exists():
        print("  OSM substations unavailable; context column left empty", flush=True)
        return None
    pts = []
    for e in json.loads(cache.read_text()).get("elements", []):
        t = e.get("tags", {})
        c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        if t.get("substation") == "transition" or c.get("lat") is None:
            continue
        pts.append({"name": t.get("name", ""), "voltage": t.get("voltage", ""), "operator": t.get("operator", ""),
                    "geometry": gpd.points_from_xy([c["lon"]], [c["lat"]])[0]})
    print(f"  OSM substations used (excluding transition stations): {len(pts)}", flush=True)
    return gpd.GeoDataFrame(pts, crs="EPSG:4326") if pts else None


def usable_area(parcels_utm, bldg_utm):
    """Area (m2) of each parcel left after a LOT_INSET_M inset from the lot lines and a
    LOT_INSET_M buffer around every building whose centroid lies on the parcel."""
    cents = bldg_utm.geometry.centroid
    sindex = bldg_utm.sindex
    out = np.zeros(len(parcels_utm))
    for i, geom in enumerate(parcels_utm.geometry):
        free = geom.buffer(-LOT_INSET_M)
        if free.is_empty:
            continue
        cand = sindex.query(geom, predicate="intersects")
        if len(cand):
            mine = cents.iloc[cand].within(geom).values
            on_site = bldg_utm.geometry.iloc[cand[mine]]
            if len(on_site):
                free = free.difference(on_site.buffer(LOT_INSET_M).unary_union)
        out[i] = free.area
    return out


# Zone families in the sample -> what the City's 23.50A.004 use table (OPCD draft, adopted
# 2023; confirm against the codified text) says for "Utility services uses". Battery storage
# is not named in the table; whether it is a "utility services use" is a City interpretation.
UTILITY_SERVICES_P = ("MML", "II", "UI", "IC")


def use_status(zone):
    z = str(zone or "").upper()
    fam = "".join(ch for ch in z.split(" ")[0] if ch.isalpha())
    if fam in UTILITY_SERVICES_P:
        return "utility services use = P in this zone (23.50A.004 draft); BESS classification unconfirmed"
    return "not checked"


def main():
    print(f"\n=== Seattle BESS screening sample v3: {AREA} {BBOX} ===\n", flush=True)
    print("Fetching layers (cached layers are skipped)...", flush=True)
    raw = {n: fetch(n) for n in LAYERS}
    parcels = raw["parcels"]
    print(f"\nParcels fetched: {len(parcels):,}")
    funnel = {"fetched": int(len(parcels))}

    # ── candidate filter ──
    parcels = parcels[parcels.geometry.notna() & ~parcels.geometry.is_empty].copy()
    parcels = parcels.drop_duplicates("PIN")
    parcels["acres"] = parcels["LOTSQFT"].fillna(0) / 43560.0
    parcels = parcels[parcels["acres"] >= MIN_ACRES].reset_index(drop=True)
    funnel["min_acres"] = int(len(parcels))

    use = parcels["PREUSE_DESC"].fillna("").str.strip()
    excluded = {}
    drop = pd.Series(False, index=parcels.index)
    for cat, needles in EXCLUDE_USES.items():
        m = use.apply(lambda u: any(u.startswith(n) or n in u for n in needles)) & ~drop
        excluded[cat] = int(m.sum())
        drop |= m
    parcels = parcels[~drop].reset_index(drop=True)
    funnel["use_filtered"] = int(len(parcels))
    print(f"After >= {MIN_ACRES} acre filter: {funnel['min_acres']:,}; after use-code exclusions: {len(parcels):,}")
    for cat, n in excluded.items():
        print(f"    excluded {n:>4}  {cat}")

    p_utm = parcels.to_crs(UTM)
    cent_ll = parcels.geometry.centroid

    # ── zoning: parcel centroid -> zone; residential zones also drive the setback ──
    z = raw["zoning"][["ZONING", "geometry"]]
    zj = gpd.sjoin(gpd.GeoDataFrame(geometry=cent_ll, crs="EPSG:4326"), z, how="left", predicate="within")
    zj = zj[~zj.index.duplicated(keep="first")]
    parcels["zoning"] = zj["ZONING"].values
    zone_up = parcels["zoning"].fillna("").astype(str).str.upper()
    in_res = zone_up.str.startswith(RESIDENTIAL_ZONE_PREFIX).values
    funnel["residential_zoned_removed"] = int(in_res.sum())
    res_zones = z[z["ZONING"].fillna("").str.upper().str.startswith(RESIDENTIAL_ZONE_PREFIX)]
    parcels = parcels[~in_res].reset_index(drop=True)
    funnel["screened"] = int(len(parcels))
    p_utm = parcels.to_crs(UTM)
    cent_ll = parcels.geometry.centroid
    print(f"Removed {funnel['residential_zoned_removed']:,} residentially zoned; {len(parcels):,} parcels screened")

    # ── hazards (share of parcel area) ──
    for key, col in [("eca_flood", "flood_frac"), ("eca_liquefaction", "liquefaction_frac"),
                     ("eca_steep", "steep_frac"), ("eca_slide", "slide_frac"),
                     ("eca_wetland", "wetland_frac"), ("eca_landfill", "landfill_frac"),
                     ("low_fire_flow", "low_fire_flow_frac"), ("ej_priority", "ej_priority_frac")]:
        parcels[col] = overlap_frac(p_utm, raw[key])
    print("Hazard overlaps computed", flush=True)

    # ── setbacks and exposure ──
    parcels["res_dist_m"] = dist_to(p_utm, res_zones)
    receptors = pd.concat([raw[k][["geometry"]] for k in ("hospital", "school_public", "school_private", "community_centers")])
    parcels["receptor_dist_m"] = dist_to(p_utm, gpd.GeoDataFrame(receptors, crs="EPSG:4326"))
    bldg_utm = raw["buildings"].to_crs(UTM)
    parcels["bldg_dist_m"] = building_exposure(p_utm, bldg_utm)
    parcels["usable_area_m2"] = usable_area(p_utm, bldg_utm)
    parcels["fire_station_m"] = dist_to(p_utm, raw["fire_stations"])
    subs = osm_substations()
    parcels["ctx_substation_osm_m"] = dist_to(p_utm, subs) if subs is not None else np.nan
    print("Setbacks and building exposure computed", flush=True)

    tx = gpd.read_file(WA / "raw" / "transmission.geojson").to_crs(UTM)
    parcels["tx_dist_m"] = p_utm.geometry.distance(tx.geometry.unary_union).values

    # ── area context (inherited from the free ZCTA map; NOT in the ranking) ──
    zc = gpd.read_file(WA / "zcta" / "grid_scores.geojson")
    inh = ["zcta", "grid_capacity_score", "seismic_score", "ej_score", "tx_dist_m"]
    zj = gpd.sjoin(gpd.GeoDataFrame(geometry=cent_ll, crs="EPSG:4326"), zc[inh + ["geometry"]],
                   how="left", predicate="within")
    zj = zj[~zj.index.duplicated(keep="first")]
    for c in ["zcta", "grid_capacity_score", "seismic_score", "ej_score"]:
        parcels["ctx_" + c] = zj[c].values
    tx_lo, tx_hi = np.percentile(zc["tx_dist_m"].dropna(), [1, 99])

    # ── parcel-evidence components ──
    parcels["res_setback_score"] = np.clip(parcels["res_dist_m"] / RES_FULL_M, 0, 1)
    parcels["receptor_score"] = np.clip(parcels["receptor_dist_m"] / RECEPTOR_FULL_M, 0, 1)
    parcels["usable_area_score"] = np.clip(parcels["usable_area_m2"] / USABLE_FULL_M2, 0, 1)
    parcels["transmission_score"] = inv_minmax(parcels["tx_dist_m"].values, tx_lo, tx_hi)
    parcels["flood_score"] = 1.0 - parcels["flood_frac"]
    parcels["liquefaction_score"] = 1.0 - parcels["liquefaction_frac"]
    parcels["site_hazard_score"] = 1.0 - parcels[["steep_frac", "slide_frac", "wetland_frac", "landfill_frac"]].max(axis=1)

    comp = {"res_setback": "res_setback_score", "receptor": "receptor_score",
            "usable_area": "usable_area_score", "transmission": "transmission_score",
            "flood": "flood_score", "liquefaction": "liquefaction_score", "site_hazard": "site_hazard_score"}
    wsum = sum(WEIGHTS.values())
    parcels["parcel_score"] = sum(parcels[col] * WEIGHTS[k] for k, col in comp.items()) / wsum

    # ── gates and flags ──
    parcels["gate_flood"] = parcels["flood_frac"] > FLOOD_GATE_FRAC
    parcels["gated"] = parcels["gate_flood"]
    parcels["flag_res_within_100ft"] = parcels["res_dist_m"] < 100 * FT
    parcels["flag_receptor_within_100ft"] = parcels["receptor_dist_m"] < 100 * FT
    parcels["flag_res_within_500ft"] = parcels["res_dist_m"] < RES_FULL_M
    parcels["flag_neighbor_bldg_within_10ft"] = parcels["bldg_dist_m"] < LOT_INSET_M
    parcels["use_status"] = parcels["zoning"].map(use_status)
    parcels["flag_wetland"] = parcels["wetland_frac"] > 0
    parcels["flag_landfill"] = parcels["landfill_frac"] > 0
    parcels["flag_slide"] = parcels["slide_frac"] > 0
    parcels["flag_low_fire_flow"] = parcels["low_fire_flow_frac"] > 0
    parcels["ctx_ej_priority_area"] = parcels["ej_priority_frac"] > 0.5
    parcels["vacant_ratio"] = 1.0 - (parcels["APPR_IMPR"].fillna(0) /
                                     (parcels["APPR_IMPR"].fillna(0) + parcels["APPRLNDVAL"].fillna(0)).clip(lower=1))
    parcels["rank"] = parcels.loc[~parcels["gated"], "parcel_score"].rank(ascending=False, method="first")

    keep = ["PIN", "ADDR_FULL", "zoning", "PREUSE_DESC", "acres", "vacant_ratio", "parcel_score", "rank",
            "res_dist_m", "receptor_dist_m", "bldg_dist_m", "usable_area_m2", "tx_dist_m", "fire_station_m",
            "res_setback_score", "receptor_score", "usable_area_score", "transmission_score",
            "flood_score", "liquefaction_score", "site_hazard_score",
            "flood_frac", "liquefaction_frac", "steep_frac", "slide_frac", "wetland_frac", "landfill_frac",
            "gate_flood", "flag_res_within_100ft", "flag_res_within_500ft", "flag_receptor_within_100ft", "flag_neighbor_bldg_within_10ft",
            "flag_wetland", "flag_landfill", "flag_slide", "flag_low_fire_flow", "gated",
            "use_status", "ctx_substation_osm_m", "ctx_zcta", "ctx_grid_capacity_score", "ctx_seismic_score", "ctx_ej_score", "ctx_ej_priority_area"]
    out = parcels[keep + ["geometry"]]
    csv_path = OUT / f"seattle_{AREA}_scored.csv"
    out.drop(columns="geometry").round(4).to_csv(csv_path, index=False)
    gj = out.copy()
    gj.geometry = gj.geometry.simplify(0.00002, preserve_topology=True)
    gj.round(4).to_file(OUT / f"seattle_{AREA}_scored.geojson", driver="GeoJSON")
    meta = {"version": 3, "bbox": BBOX, "padded_bbox": PBBOX, "min_acres": MIN_ACRES,
            "flood_gate_frac": FLOOD_GATE_FRAC, "weights": WEIGHTS,
            "distance_full_m": {"res_setback": RES_FULL_M, "receptor": RECEPTOR_FULL_M},
            "lot_inset_m": LOT_INSET_M, "usable_full_m2": USABLE_FULL_M2,
            "tx_scale_m": [float(tx_lo), float(tx_hi)], "funnel": funnel, "excluded_by_use": excluded,
            "n_gated": int(parcels["gated"].sum())}
    (OUT / f"seattle_{AREA}_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"\nScreened {len(parcels):,}; gated (flood) {int(parcels['gated'].sum()):,}")
    print(f"Wrote {csv_path.name}")
    top = out[~out["gated"]].sort_values("parcel_score", ascending=False).head(10)
    print(top[["PIN", "ADDR_FULL", "zoning", "acres", "parcel_score", "res_dist_m", "receptor_dist_m", "usable_area_m2"]].round(3).to_string(index=False))


if __name__ == "__main__":
    sys.exit(main())
