"""Fire history + risk analysis behind /findings/wa-fire-risk and the
datacenter_siting report page. Mirrors analysis_pnw_water_stress.py's
structure and reasoning: reads the real MTBS burn-perimeter polygons
(export_wa_fire_perimeters.py) and the real USFS WHP hazard raster
(fetch_whp_wa.py) directly -- no derived/invented composite -- matched
against merascope's tracked datacenter sites (dc_tracker.py), confirmed
sites only (2+ independent sources).

Two real layers, not one invented number:
  - history: did a DC site's ground actually burn before, and when
  - risk: USFS's own agency-scored hazard class at that site today

Run: python3 scripts/analysis_wa_fire_risk.py
"""
import json
import os

import geopandas as gpd
import numpy as np
from pyproj import Transformer
from shapely import contains_xy
from shapely.geometry import Point, shape

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "shared")
DATA_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
LARGE_FIRE_ACRES = 50_000
N_SAMPLES = 20_000  # Monte Carlo points for area-share stats -- ~0.7% margin of error
WHP_LABELS = {1: "very low", 2: "low", 3: "moderate", 4: "high", 5: "very high",
              6: "non-burnable", 7: "water", 255: None}


def _load(name):
    with open(os.path.join(BASE, name)) as f:
        return json.load(f)


def _load_whp():
    arr = np.load(os.path.join(BASE, "whp_wa.npy"))
    t = _load("whp_wa_transform.json")
    return arr, t


def _whp_sample(arr, t, to_whp, lon, lat):
    x, y = to_whp.transform(lon, lat)
    col = int(round((x - t["origin_x"]) / t["pixel_x"]))
    row = int(round((t["origin_y"] - y) / -t["pixel_y"]))
    if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]:
        return int(arr[row, col])
    return None


def _nearest_hazard_km(arr, t, to_whp, lon, lat, window_px=40):
    """Distance in km from (lon,lat) to the nearest WHP class 4/5 (high/very
    high) pixel within a window_px*pixel_size radius (40px * 270m = 10.8km).
    On-site WHP class alone is close to constant across DC sites -- they're
    built on developed/agricultural land, which WHP reads as non-burnable by
    definition -- but wildfire threatens built infrastructure via nearby
    wildland fuels (embers, WUI spread), not just the parcel's own land
    cover, so proximity to hazardous land is the more informative number.
    Returns None if no high/very-high pixel exists in the window (i.e. > ~11km away)."""
    x, y = to_whp.transform(lon, lat)
    col = int(round((x - t["origin_x"]) / t["pixel_x"]))
    row = int(round((t["origin_y"] - y) / -t["pixel_y"]))
    r0, r1 = max(0, row - window_px), min(arr.shape[0], row + window_px + 1)
    c0, c1 = max(0, col - window_px), min(arr.shape[1], col + window_px + 1)
    window = arr[r0:r1, c0:c1]
    hazard_rows, hazard_cols = np.where((window == 4) | (window == 5))
    if hazard_rows.size == 0:
        return None
    px_size = abs(t["pixel_x"])
    dist_px = np.sqrt((hazard_rows + r0 - row) ** 2 + (hazard_cols + c0 - col) ** 2)
    return round(float(dist_px.min()) * px_size / 1000.0, 1)


def _nearest_burned_geoms(perimeters):
    """MTBS perimeter geometries reprojected once to EPSG:5070 (metric) for
    real-distance-in-km lookups -- shared setup for _match_dc_sites'
    nearest_burned_km, which patches WHP's biggest documented blind spot:
    WHP's fuel model reads agricultural/CRP grassland as non-burnable, which
    is exactly what carried the 2020 Pearl Hill and Cold Springs fires
    (187k-218k acres) -- but those fires are real rows in MTBS regardless of
    what WHP's land-cover model says, so distance-to-nearest-actual-fire is
    a second, independent signal that doesn't share WHP's blind spot. Two
    real layers patching each other's gaps, not one model papering over the
    other's limitation."""
    gs = gpd.GeoSeries([shape(f["geometry"]) for f in perimeters["features"]], crs="EPSG:4326")
    return gs.to_crs("EPSG:5070")


def _nearest_burned_km(site_5070, burned_5070):
    return round(float(burned_5070.distance(site_5070).min()) / 1000.0, 1)


def _match_dc_sites(dc_features, perimeters, arr, t, to_whp):
    """Each confirmed WA DC site: does it sit inside a real historical burn
    perimeter (point-in-polygon against all 650 MTBS shapes, most recent
    match if more than one fire has reburned the same ground), how far to
    the nearest one if not, and what WHP hazard class reads at that exact
    point today. Point sampling only -- no polygon centroids (a naive
    vertex-average centroid can land outside an irregular fire perimeter or
    on unrepresentative ground; confirmed by spot-check during development,
    see CONTEXT.md)."""
    perim_shapes = [(shape(f["geometry"]), f["properties"]) for f in perimeters["features"]]
    burned_5070 = _nearest_burned_geoms(perimeters)
    to_5070 = Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)
    rows = []
    for f in dc_features:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        pt = Point(lon, lat)
        hits = [props for geom, props in perim_shapes if geom.contains(pt)]
        hits.sort(key=lambda h: h["year"] or 0, reverse=True)
        whp_class = _whp_sample(arr, t, to_whp, lon, lat)
        x5070, y5070 = to_5070.transform(lon, lat)
        rows.append({
            "name": p["name"], "operator": p["operator"], "city": p["city"], "status": p["status"],
            "in_perimeter": bool(hits),
            "perimeter_name": hits[0]["name"] if hits else None,
            "perimeter_year": hits[0]["year"] if hits else None,
            "n_historical_burns": len(hits),
            "nearest_burned_km": 0.0 if hits else _nearest_burned_km(Point(x5070, y5070), burned_5070),
            "whp_class": whp_class,
            "whp_label": WHP_LABELS.get(whp_class),
            "nearest_hazard_km": _nearest_hazard_km(arr, t, to_whp, lon, lat),
        })
    return sorted(rows, key=lambda r: (r["nearest_burned_km"], r["name"]))


def _area_stats(perimeters, arr, t, to_whp):
    """Cached wrapper -- the Monte Carlo estimate below is vectorized but
    still costs ~8s (dissolving 650 perimeters into one union geometry is
    the expensive part), too slow to redo on every /findings/wa-fire-risk
    request. Same warm-cache-after-first-request pattern CONTEXT.md
    documents for _zcta_centroids_cache in server.py: cache to disk once,
    every request after that is a plain JSON read. Delete
    wa_fire_area_stats.json to force a recompute (e.g. after MTBS/WHP data
    changes)."""
    cache_path = os.path.join(BASE, "wa_fire_area_stats.json")
    if os.path.exists(cache_path):
        return json.load(open(cache_path))
    stats = _compute_area_stats(perimeters, arr, t, to_whp)
    with open(cache_path, "w") as f:
        json.dump(stats, f)
    return stats


def _compute_area_stats(perimeters, arr, t, to_whp):
    """Monte Carlo area-weighted shares over WA -- same reasoning as
    _area_share() in analysis_pnw_water_stress.py (real land-area
    percentages, not polygon-count or raw pixel-count, which would
    overweight the padded crop rectangle outside WA's real shape). Fully
    vectorized (shapely.contains_xy + numpy pixel indexing on point arrays)
    rather than a scalar per-point loop -- 20k points in well under a
    second instead of tens of seconds; the remaining cost is the one-time
    650-polygon union, which is why the result is cached (see _area_stats)."""
    wa = gpd.read_file(os.path.join(DATA_ROOT, "WA", "raw", "state.geojson"))
    wa_union = wa.union_all()
    minlon, minlat, maxlon, maxlat = wa.total_bounds
    perim_union = gpd.GeoSeries([shape(f["geometry"]) for f in perimeters["features"]], crs="EPSG:4326").union_all()

    rng = np.random.default_rng(0)
    lons = np.empty(0)
    lats = np.empty(0)
    while lons.size < N_SAMPLES:
        cand_lon = rng.uniform(minlon, maxlon, N_SAMPLES * 2)
        cand_lat = rng.uniform(minlat, maxlat, N_SAMPLES * 2)
        keep = contains_xy(wa_union, cand_lon, cand_lat)
        lons = np.concatenate([lons, cand_lon[keep]])
        lats = np.concatenate([lats, cand_lat[keep]])
    lons, lats = lons[:N_SAMPLES], lats[:N_SAMPLES]

    burned = contains_xy(perim_union, lons, lats)

    xs, ys = to_whp.transform(lons, lats)
    cols = np.round((xs - t["origin_x"]) / t["pixel_x"]).astype(int)
    rows = np.round((t["origin_y"] - ys) / -t["pixel_y"]).astype(int)
    valid = (rows >= 0) & (rows < arr.shape[0]) & (cols >= 0) & (cols < arr.shape[1])
    classes = np.where(valid, arr[np.clip(rows, 0, arr.shape[0] - 1), np.clip(cols, 0, arr.shape[1] - 1)], 255)

    return {
        "n_samples": N_SAMPLES,
        "burned_share_pct": 100.0 * burned.sum() / N_SAMPLES,
        "high_hazard_share_pct": 100.0 * (classes == 4).sum() / N_SAMPLES,
        "very_high_hazard_share_pct": 100.0 * (classes == 5).sum() / N_SAMPLES,
    }


def compute():
    perimeters = _load("wa_fire_perimeters.geojson")
    arr, t = _load_whp()
    to_whp = Transformer.from_crs("EPSG:4326", t["crs"], always_xy=True)

    years = [f["properties"]["year"] for f in perimeters["features"] if f["properties"]["year"]]
    large_fires = sorted(
        [f["properties"] for f in perimeters["features"] if (f["properties"]["acres"] or 0) >= LARGE_FIRE_ACRES],
        key=lambda p: -(p["acres"] or 0),
    )

    dc_sites = []
    tracked_path = os.path.join(BASE, "tracked_datacenters.geojson")
    if os.path.exists(tracked_path):
        confirmed = [f for f in _load("tracked_datacenters.geojson")["features"]
                     if f["properties"]["confirmed"] and f["properties"]["state"] == "WA"]
        dc_sites = _match_dc_sites(confirmed, perimeters, arr, t, to_whp)

    stats = _area_stats(perimeters, arr, t, to_whp)

    return {
        "n_perimeters": len(perimeters["features"]),
        "year_min": min(years) if years else None,
        "year_max": max(years) if years else None,
        "large_fires": large_fires,
        "large_fire_threshold": LARGE_FIRE_ACRES,
        "dc_sites": dc_sites,
        **stats,
        "checks": {
            "has_dc_sites": len(dc_sites) > 0,
            "burned_sites_have_year": all(not r["in_perimeter"] or r["perimeter_year"] for r in dc_sites),
        },
    }


def main():
    r = compute()
    print(f"WA fire perimeters: {r['n_perimeters']} ({r['year_min']}-{r['year_max']})")
    print(f"{r['burned_share_pct']:.1f}% of WA land area has burned at least once since {r['year_min']} "
          f"(Monte Carlo, n={r['n_samples']})")
    print(f"{r['high_hazard_share_pct']:.1f}% of WA reads WHP 'high', "
          f"{r['very_high_hazard_share_pct']:.1f}% reads 'very high' hazard potential\n")

    print(f"{len(r['large_fires'])} fires >= {r['large_fire_threshold']:,} acres:")
    for f in r["large_fires"][:10]:
        print(f"  {f['year']}  {f['name']:25s} {f['acres']:>10,.0f} ac")

    print(f"\nConfirmed WA data-center sites ({len(r['dc_sites'])}):")
    for row in r["dc_sites"]:
        burn = f"burned {row['perimeter_year']} ({row['perimeter_name']})" if row["in_perimeter"] else f"{row['nearest_burned_km']} km to nearest historical burn"
        hazard_dist = f"{row['nearest_hazard_km']} km to nearest high/very-high hazard land" if row["nearest_hazard_km"] is not None else "no high/very-high hazard land within ~11km"
        print(f"  {row['name']:35s} whp={row['whp_label']:>12}  {burn}  |  {hazard_dist}")

    c = r["checks"]
    assert c["has_dc_sites"], "no confirmed WA DC sites matched -- check tracked_datacenters.geojson"
    assert c["burned_sites_have_year"], "a site is flagged in_perimeter but has no perimeter_year"
    print("\nOK: checks passed.")

    out_path = os.path.join(BASE, "..", "reports", "wa_fire_risk.json")
    out_path = os.path.normpath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    from datetime import datetime, timezone
    r["source"] = "MTBS burn perimeters (mtbs.gov) + USFS Wildfire Hazard Potential 2020 (firelab.org)"
    r["generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with open(out_path, "w") as f:
        json.dump(r, f)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
