"""
17_datacenter_labels.py — Build the multi-source data center label database.

Why this exists: the ZCTA targeting model was badly calibrated at the top of its
score range (predicted 0.347 vs observed 0.148). That turned out to be a LABEL
problem, not a model problem — among ZCTAs OSM calls empty, 1.33% contain a
PeeringDB facility, but among high-scoring ones 13.25% do, a 10x enrichment.
Counting one extra source moved the top bin to 0.333, essentially calibrated.

So the ground truth gets rebuilt from several sources, each keeping its provenance,
and a facility asserted by three sources outranks one asserted by a single scrape.

Sources and licences (attribution is required — see README):
  osm           Overpass man_made=data_centre / telecom=data_center     ODbL
  peeringdb     https://www.peeringdb.com/api/fac                       open API
  im3           IMMM-SFA/datacenter-atlas GeoPackage                    ODbL (OSM-derived)
  compute_atlas ek33450505/compute-atlas data/facilities.json           CC BY 4.0
                (c) 2026 Edward Kubiak — code MIT, data CC BY 4.0

NOTE on compute-atlas.com: the website's robots.txt disallows ClaudeBot and sets
Content-Signal ai-train=no. We do not crawl the site. The GitHub repository is the
author's own distribution channel under an explicit licence; that is what we read.

Do NOT add Baxtel, DataCenterMap or Cloudscene by scraping. Those are commercial
database products where the compilation is the business; database rights and ToS
make that a legal exposure, not a technical one. Licence them if needed.

Usage:
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -u scripts/17_datacenter_labels.py
  ... --refresh          re-download every source instead of using the cache
  ... --zcta-geom PATH   ZCTA polygons for the per-ZCTA rollup
"""

import argparse
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

ROOT = Path(__file__).parent.parent
CACHE = ROOT / "notebooks" / "cache" / "labels"
OUT_DIR = ROOT / "data" / "datacenters"
EQUAL_AREA = "EPSG:5070"

# Two records merge into one facility if their representative points are within
# this distance. Big enough to unify the buildings of one hyperscale campus,
# small enough to keep distinct carrier hotels apart in a dense downtown.
MERGE_RADIUS_M = 300

# Normalized status vocabulary. Sources that only map things that already exist
# (OSM, PeeringDB, IM3) are assumed operational.
BUILT = {"operational", "under_construction"}
FORWARD = {"proposed", "permitted", "under_construction"}

ATTRIBUTION = [
    "(c) OpenStreetMap contributors, ODbL",
    "PeeringDB",
    "IM3 Open Source Data Center Atlas — Battelle Memorial Institute, ODbL (OSM-derived)",
    "Compute Atlas — (c) 2026 Edward Kubiak, CC BY 4.0",
]

COLS = ["source", "source_id", "name", "operator", "status", "facility_type",
        "capacity_mw", "area_m2", "url", "lat", "lon", "geometry"]


def _empty():
    return gpd.GeoDataFrame(columns=COLS, geometry="geometry", crs="EPSG:4326")


def load_osm(refresh=False):
    """OSM data centers with footprint geometry (built by notebooks/cache/build_dc_table.py)."""
    path = ROOT / "notebooks" / "cache" / "osm_datacenters.geojson"
    if not path.exists():
        print("  osm: no cached file — run notebooks/cache/fetch_osm_dc.py first")
        return _empty()
    g = gpd.read_file(path)
    out = gpd.GeoDataFrame({
        "source": "osm",
        "source_id": g["osm_type"].astype(str) + "/" + g["osm_id"].astype(str),
        "name": g.get("name", ""),
        "operator": g.get("operator", ""),
        "status": "operational",
        "facility_type": "data_center",
        "capacity_mw": np.nan,
        "area_m2": pd.to_numeric(g.get("area_m2"), errors="coerce"),
        "url": "",
        "lat": g["lat"], "lon": g["lon"],
        "geometry": g.geometry,
    }, crs="EPSG:4326")
    print(f"  osm: {len(out)} records")
    return out


def load_peeringdb(refresh=False):
    """PeeringDB carrier hotels / colo facilities. Urban-heavy by construction."""
    path = CACHE / "peeringdb_fac.csv"
    if refresh or not path.exists():
        r = requests.get("https://www.peeringdb.com/api/fac?depth=0", timeout=180,
                         headers={"User-Agent": "merascope-research/1.0"})
        r.raise_for_status()
        d = pd.DataFrame(r.json()["data"])
        d = d[(d["country"] == "US") & d["latitude"].notna() & d["longitude"].notna()]
        d[["id", "name", "latitude", "longitude", "city", "state"]].to_csv(path, index=False)
    d = pd.read_csv(path)
    out = gpd.GeoDataFrame({
        "source": "peeringdb", "source_id": d["id"].astype(str),
        "name": d["name"], "operator": "", "status": "operational",
        "facility_type": "colo", "capacity_mw": np.nan, "area_m2": np.nan, "url": "",
        "lat": d["latitude"], "lon": d["longitude"],
        "geometry": gpd.points_from_xy(d["longitude"], d["latitude"]),
    }, crs="EPSG:4326")
    print(f"  peeringdb: {len(out)} records")
    return out


def load_im3(refresh=False):
    """IM3 Atlas. OSM-derived, so it adds no new coverage — but its campus layer
    resolves the campus-vs-single-building conflation our raw OSM footprints have,
    and its operator field is cleaned."""
    path = CACHE / "im3_us_data_center_locations.gpkg"
    if refresh or not path.exists():
        url = ("https://raw.githubusercontent.com/IMMM-SFA/datacenter-atlas/main/"
               "data_center_database/im3_us_data_center_locations.gpkg")
        r = requests.get(url, timeout=300); r.raise_for_status()
        path.write_bytes(r.content)
    frames = []
    for layer in ("point", "building", "campus"):
        try:
            g = gpd.read_file(path, layer=layer)
        except Exception as e:
            print(f"  im3: layer {layer} unreadable ({e})"); continue
        g = g[g.geometry.notna() & ~g.geometry.is_empty]
        sqft = pd.to_numeric(g.get("sqft"), errors="coerce")
        frames.append(gpd.GeoDataFrame({
            "source": f"im3_{layer}", "source_id": g["id"].astype(str),
            "name": g.get("name", ""), "operator": g.get("operator", ""),
            "status": "operational", "facility_type": "data_center",
            "capacity_mw": np.nan,
            "area_m2": sqft * 0.09290304,  # sqft -> m2
            "url": "", "lat": g["lat"], "lon": g["lon"], "geometry": g.geometry,
        }, crs="EPSG:4326"))
    out = pd.concat(frames, ignore_index=True) if frames else _empty()
    print(f"  im3: {len(out)} records ({', '.join(f'{f.iloc[0].source}={len(f)}' for f in frames)})")
    return gpd.GeoDataFrame(out, geometry="geometry", crs="EPSG:4326")


def load_compute_atlas(refresh=False):
    """Compute Atlas — the only source carrying forward-looking status, capacity in
    MW, dated status history and per-record source citations. CC BY 4.0."""
    path = CACHE / "ca_facilities.json"
    if refresh or not path.exists():
        url = ("https://raw.githubusercontent.com/ek33450505/compute-atlas/main/"
               "data/facilities.json")
        r = requests.get(url, timeout=180); r.raise_for_status()
        path.write_bytes(r.content)
    recs = json.loads(path.read_text())
    rows = []
    for r in recs:
        loc = r.get("location") or {}
        if loc.get("lat") is None:
            continue
        cap = r.get("capacityMw") or {}
        srcs = r.get("sources") or []
        rows.append({
            "source": "compute_atlas", "source_id": r.get("id"),
            "name": r.get("name", ""), "operator": r.get("operator", ""),
            "status": r.get("status", ""), "facility_type": r.get("facilityType", ""),
            "capacity_mw": cap.get("operational") or cap.get("planned") or np.nan,
            "area_m2": np.nan,
            "url": (srcs[0].get("url", "") if srcs else ""),
            "lat": loc["lat"], "lon": loc["lon"],
        })
    d = pd.DataFrame(rows)
    out = gpd.GeoDataFrame(d, geometry=gpd.points_from_xy(d["lon"], d["lat"]),
                           crs="EPSG:4326")
    print(f"  compute_atlas: {len(out)} records "
          f"({(out.status == 'operational').sum()} operational, "
          f"{out.status.isin(FORWARD).sum()} forward-looking, "
          f"{(out.status == 'cancelled').sum()} cancelled)")
    return out


def resolve_entities(gdf, radius_m=MERGE_RADIUS_M):
    """Assign a facility_id by merging records that are the same physical site.

    Two records join if their representative points are within `radius_m`. That
    unifies the several buildings of one hyperscale campus while keeping distinct
    carrier hotels apart. IM3 in particular keeps overlapping campus and building
    rows for the same facility and splits rows at county lines, so counting
    records without this step double-counts badly.
    """
    proj = gdf.to_crs(EQUAL_AREA)
    pts = proj.geometry.representative_point()
    xy = np.c_[pts.x, pts.y]
    tree = cKDTree(xy)
    pairs = tree.query_pairs(radius_m, output_type="ndarray")
    n = len(gdf)
    if len(pairs):
        adj = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n))
    else:
        adj = coo_matrix((n, n))
    _, labels = connected_components(adj, directed=False)
    out = gdf.copy()
    out["facility_id"] = labels
    print(f"  {n} records -> {len(set(labels))} distinct facilities "
          f"(merge radius {radius_m} m)")
    return out


def summarize_facilities(gdf):
    """One row per resolved facility, carrying provenance and the best status."""
    def pick_status(s):
        for k in ("operational", "under_construction", "permitted", "proposed", "cancelled"):
            if (s == k).any():
                return k
        return s.iloc[0] if len(s) else ""

    g = gdf.groupby("facility_id")
    out = pd.DataFrame({
        "n_sources": g["source"].apply(lambda s: s.str.split("_").str[0].nunique()),
        "sources": g["source"].apply(lambda s: ",".join(sorted(set(s)))),
        "name": g["name"].apply(lambda s: next((x for x in s if isinstance(x, str) and x), "")),
        "operator": g["operator"].apply(lambda s: next((x for x in s if isinstance(x, str) and x), "")),
        "status": g["status"].apply(pick_status),
        "facility_type": g["facility_type"].apply(lambda s: next((x for x in s if x), "")),
        "capacity_mw": g["capacity_mw"].max(),
        "area_m2": g["area_m2"].max(),
        "url": g["url"].apply(lambda s: next((x for x in s if x), "")),
        "lat": g["lat"].mean(), "lon": g["lon"].mean(),
    }).reset_index()
    return gpd.GeoDataFrame(out, geometry=gpd.points_from_xy(out["lon"], out["lat"]),
                            crs="EPSG:4326")


def rollup_to_zcta(fac, zcta_path):
    """Per-ZCTA label rollup with confidence and both built and forward variants."""
    z = gpd.read_file(zcta_path)[["zcta", "geometry"]]
    z["zcta"] = z["zcta"].astype(str).str.zfill(5)
    j = gpd.sjoin(fac, z, how="inner", predicate="within")
    print(f"  {len(j)}/{len(fac)} facilities fell inside a ZCTA")

    built = j[j["status"].isin(BUILT)]
    fwd = j[j["status"].isin({"proposed", "permitted"})]
    agg = pd.DataFrame({
        "n_facilities": j.groupby("zcta").size(),
        "max_sources": j.groupby("zcta")["n_sources"].max(),
        "capacity_mw": j.groupby("zcta")["capacity_mw"].sum(min_count=1),
        "max_area_m2": j.groupby("zcta")["area_m2"].max(),
        "n_built": built.groupby("zcta").size(),
        "n_forward": fwd.groupby("zcta").size(),
    })
    out = z[["zcta"]].merge(agg, on="zcta", how="left")
    for c in ["n_facilities", "n_built", "n_forward"]:
        out[c] = out[c].fillna(0).astype(int)
    out["max_sources"] = out["max_sources"].fillna(0).astype(int)
    out["has_dc"] = (out["n_built"] > 0).astype(int)
    out["has_dc_multi"] = ((out["n_built"] > 0) & (out["max_sources"] >= 2)).astype(int)
    out["has_dc_forward"] = (out["n_forward"] > 0).astype(int)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--zcta-geom", default=str(ROOT / "notebooks" / "cache" / "zcta_geom.geojson"))
    args = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading sources...")
    parts = [load_osm(args.refresh), load_peeringdb(args.refresh),
             load_im3(args.refresh), load_compute_atlas(args.refresh)]
    gdf = gpd.GeoDataFrame(pd.concat([p for p in parts if len(p)], ignore_index=True),
                           geometry="geometry", crs="EPSG:4326")
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].reset_index(drop=True)
    print(f"\n{len(gdf)} raw records across {gdf['source'].nunique()} source layers")

    print("\nResolving entities...")
    gdf = resolve_entities(gdf)
    fac = summarize_facilities(gdf)

    print("\nFacilities by source count:")
    print(fac["n_sources"].value_counts().sort_index().to_string())
    print("\nFacilities by status:")
    print(fac["status"].value_counts().to_string())

    gdf.drop(columns="geometry").to_csv(OUT_DIR / "records.csv", index=False)
    fac.to_file(OUT_DIR / "facilities.geojson", driver="GeoJSON")
    # ODbL and CC BY both require attribution to travel with the data, and this
    # file is reachable over HTTP from the public site — so the notice is written
    # into the GeoJSON itself rather than left in a README nobody fetches.
    gj = json.loads((OUT_DIR / "facilities.geojson").read_text())
    gj["attribution"] = ATTRIBUTION
    gj["license"] = ("Derived database. Contains OpenStreetMap and IM3 Atlas data "
                     "(ODbL), PeeringDB data, and Compute Atlas data (CC BY 4.0). "
                     "Share-alike applies to the ODbL-derived portions.")
    (OUT_DIR / "facilities.geojson").write_text(json.dumps(gj))
    print(f"\nwrote {OUT_DIR/'facilities.geojson'} ({len(fac)} facilities)")

    zpath = Path(args.zcta_geom)
    if zpath.exists():
        print("\nRolling up to ZCTA...")
        roll = rollup_to_zcta(fac, zpath)
        roll.to_csv(OUT_DIR / "zcta_labels.csv", index=False)
        print(f"  has_dc          {roll['has_dc'].sum():>5}  ({100*roll['has_dc'].mean():.2f}%)")
        print(f"  has_dc_multi    {roll['has_dc_multi'].sum():>5}  ({100*roll['has_dc_multi'].mean():.2f}%)")
        print(f"  has_dc_forward  {roll['has_dc_forward'].sum():>5}  ({100*roll['has_dc_forward'].mean():.2f}%)")
        print(f"wrote {OUT_DIR/'zcta_labels.csv'}")
    else:
        print(f"\nskipping ZCTA rollup — {zpath} not found")


if __name__ == "__main__":
    main()
