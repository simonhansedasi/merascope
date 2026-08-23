"""Water-stress analysis behind /findings/pnw-water-stress and the
datacenter_siting report page.

Reads Aqueduct's own watershed polygons directly (export_pnw_watersheds.py's
output) -- no ZCTA data. Data-center markers come from merascope's tracked
`datacenters.db` (dc_tracker.py), confirmed sites only (2+ independent
sources) -- matched here to the watershed they actually sit in via
point-in-polygon, split into a WA/OR table and a separate Compact-states
table since they're two different comparisons, not one list.

Run: python3 scripts/analysis_pnw_water_stress.py
"""
import json
import os

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "shared")
COMPACT_STATES = ["AZ", "CA", "CO", "NV", "NM", "UT", "WY"]
PNW = ["WA", "OR"]
EXTREME = 4.0


def _load(name):
    with open(os.path.join(BASE, name)) as f:
        return json.load(f)


def _area_share(features, pred=lambda f: True):
    """Area-weighted % of features matching pred that are extremely stressed."""
    sel = [f for f in features if pred(f)]
    total = sum(f["properties"]["area_km2"] for f in sel)
    extreme = sum(f["properties"]["area_km2"] for f in sel if f["properties"]["bws"] >= EXTREME)
    return float(100.0 * extreme / total) if total else 0.0


def _point_in_ring(lon, lat, ring):
    """Classic ray-casting point-in-polygon test -- same approach as
    server.py's _point_in_ring, duplicated here rather than imported since
    importing server.py would pull in the whole Flask app."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geometry(lon, lat, geom):
    gtype = geom.get("type")
    if gtype == "Polygon":
        rings = geom["coordinates"]
        return _point_in_ring(lon, lat, rings[0]) and not any(_point_in_ring(lon, lat, h) for h in rings[1:])
    if gtype == "MultiPolygon":
        for poly in geom["coordinates"]:
            if _point_in_ring(lon, lat, poly[0]) and not any(_point_in_ring(lon, lat, h) for h in poly[1:]):
                return True
    return False


def _centroid(geom):
    gtype = geom.get("type", "")
    if gtype == "Polygon":
        ring = geom["coordinates"][0]
    elif gtype == "MultiPolygon":
        ring = max(geom["coordinates"], key=lambda p: len(p[0]))[0]
    else:
        return None, None
    return sum(c[1] for c in ring) / len(ring), sum(c[0] for c in ring) / len(ring)


def _match_dc_sites(dc_features, watershed_features):
    """Match each confirmed data-center site to the watershed polygon it
    falls inside (point-in-polygon; falls back to nearest centroid if no
    polygon contains it -- coastline/clip-edge cases). Only sites with
    confirmed=True are passed in -- see compute()."""
    rows = []
    for f in dc_features:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        candidates = [w for w in watershed_features if w["properties"]["state"] == p["state"]]
        if not candidates:
            continue
        match = next((w for w in candidates if _point_in_geometry(lon, lat, w["geometry"])), None)
        if match is None:
            match = min(candidates, key=lambda w: sum(
                (a - b) ** 2 for a, b in zip(_centroid(w["geometry"]), (lat, lon))))
        wp = match["properties"]
        rows.append({
            "name": p["name"], "operator": p["operator"], "state": p["state"], "city": p["city"],
            "status": p["status"], "watershed_id": wp["aq30_id"], "bws": wp["bws"], "tag": wp["tag"],
        })
    return sorted(rows, key=lambda r: (r["state"], r["name"]))


def compute():
    """All numbers behind the findings page and the report, in one place so
    script output and the web page can never drift from each other. Returns
    a plain dict of primitives (no numpy types) so it's also directly
    JSON-serializable. All shares are area-weighted (% of km2, not % of
    polygon count) -- polygon count would be an arbitrary GIS artifact of
    how Aqueduct happened to slice a basin, not a meaningful population or
    land measure."""
    pnw = _load("pnw_watersheds.geojson")["features"]
    compact = _load("compact_watersheds.geojson")["features"]
    national = _load("national_watershed_stats.json")

    national_total = sum(r["area_km2"] for r in national)
    national_extreme = sum(r["area_km2"] for r in national if r["bws"] >= EXTREME)
    national_share = float(100.0 * national_extreme / national_total)

    compact_share = _area_share(compact)
    pnw_share = _area_share(pnw)

    per_state_rows = []
    for s in COMPACT_STATES + PNW:
        feats = [f for f in (compact + pnw) if f["properties"]["state"] == s]
        per_state_rows.append({
            "state": s,
            "share": _area_share(feats),
            "n": len(feats),
            "area_km2": round(sum(f["properties"]["area_km2"] for f in feats), 1),
        })

    extreme_watersheds = sorted(
        [f["properties"] for f in pnw if f["properties"]["bws"] >= EXTREME],
        key=lambda p: -p["bws"],
    )
    pnw_total_area = sum(f["properties"]["area_km2"] for f in pnw)
    floor_area = sum(f["properties"]["area_km2"] for f in pnw if f["properties"]["bws"] == 0.0)
    floor_share = float(100.0 * floor_area / pnw_total_area) if pnw_total_area else 0.0

    tracked_path = os.path.join(BASE, "tracked_datacenters.geojson")
    dc_sites_pnw, dc_sites_compact = [], []
    if os.path.exists(tracked_path):
        confirmed = [f for f in _load("tracked_datacenters.geojson")["features"] if f["properties"]["confirmed"]]
        dc_sites_pnw = _match_dc_sites([f for f in confirmed if f["properties"]["state"] in PNW], pnw)
        dc_sites_compact = _match_dc_sites([f for f in confirmed if f["properties"]["state"] in COMPACT_STATES], compact)

    return {
        "n_watersheds_pnw": len(pnw),
        "n_watersheds_compact": len(compact),
        "n_watersheds_national": len(national),
        "national_share": national_share,
        "compact_share": compact_share,
        "pnw_share": pnw_share,
        "per_state": per_state_rows,
        "extreme_watersheds": extreme_watersheds,
        "floor_share": floor_share,
        "dc_sites_pnw": dc_sites_pnw,
        "dc_sites_compact": dc_sites_compact,
        "checks": {
            "compact_gap_holds": compact_share > 5 * pnw_share,
        },
    }


def main():
    r = compute()
    print(f"Watersheds: {r['n_watersheds_pnw']} WA/OR, {r['n_watersheds_compact']} Compact states, "
          f"{r['n_watersheds_national']} national\n")
    print("Area-weighted share of km2 at extremely high baseline water stress (bws >= 4):")
    print(f"  national                    {r['national_share']:5.1f}%")
    print(f"  7 Compact states            {r['compact_share']:5.1f}%")
    print(f"  WA + OR                     {r['pnw_share']:5.1f}%\n")

    print("Per state:")
    for row in r["per_state"]:
        print(f"  {row['state']}  {row['share']:5.1f}%   (n={row['n']}, {row['area_km2']:,.0f} km2)")

    print(f"\nAll {len(r['extreme_watersheds'])} WA/OR watersheds at extremely high stress:")
    for row in r["extreme_watersheds"]:
        print(f"  watershed {row['aq30_id']}  {row['state']}  bws={row['bws']:6.3f}  {row['area_km2']:,.0f} km2")
    print(f"\n{r['floor_share']:.1f}% of WA/OR area sits at the literal floor (bws = 0.000).")

    print(f"\nConfirmed WA/OR data-center sites ({len(r['dc_sites_pnw'])}) vs. their watershed:")
    for row in r["dc_sites_pnw"]:
        print(f"  {row['state']}  {row['name']:42s} watershed {row['watershed_id']}  bws={row['bws']:6.3f}  [{row['tag']}]")

    print(f"\nConfirmed Compact-state data-center sites ({len(r['dc_sites_compact'])}) vs. their watershed:")
    for row in r["dc_sites_compact"]:
        print(f"  {row['state']}  {row['name']:42s} watershed {row['watershed_id']}  bws={row['bws']:6.3f}  [{row['tag']}]")

    c = r["checks"]
    assert c["compact_gap_holds"], "compact/PNW gap collapsed"
    print("\nOK: compact/PNW gap holds.")


if __name__ == "__main__":
    main()
