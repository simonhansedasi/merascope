import json
import numpy as np, pandas as pd
import geopandas as gpd
from shapely.geometry import Point, Polygon, LineString

data = json.load(open("cache/osm_datacenters_raw.json"))
els = data["elements"]

rows = []
for el in els:
    t = el.get("type"); tags = el.get("tags", {}) or {}
    geom = None
    if t == "node":
        if el.get("lat") is None: continue
        geom = Point(el["lon"], el["lat"])
    elif t in ("way", "relation"):
        coords = None
        if "geometry" in el:
            coords = [(n["lon"], n["lat"]) for n in el["geometry"] if n.get("lon")]
        elif "members" in el:
            pts = []
            for m in el["members"]:
                if "geometry" in m:
                    pts += [(n["lon"], n["lat"]) for n in m["geometry"] if n.get("lon")]
            coords = pts or None
        if not coords: continue
        if len(coords) >= 4 and coords[0] == coords[-1]:
            try: geom = Polygon(coords)
            except Exception: geom = LineString(coords)
        elif len(coords) >= 3:
            try: geom = Polygon(coords + [coords[0]])
            except Exception: geom = LineString(coords)
        elif len(coords) == 2:
            geom = LineString(coords)
        else:
            geom = Point(coords[0])
    if geom is None or geom.is_empty: continue
    rows.append({
        "osm_id": el.get("id"), "osm_type": t,
        "name": tags.get("name", ""), "operator": tags.get("operator", ""),
        "building": tags.get("building", ""), "start_date": tags.get("start_date", ""),
        "geometry": geom,
    })

gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
gdf["is_poly"] = gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])
# area in m^2 via equal-area projection
ea = gdf.to_crs("EPSG:5070")
gdf["area_m2"] = np.where(gdf["is_poly"], ea.geometry.area, np.nan)
gdf["lon"] = gdf.to_crs(4326).geometry.representative_point().x
gdf["lat"] = gdf.to_crs(4326).geometry.representative_point().y

print(f"total features: {len(gdf)}")
print(gdf["osm_type"].value_counts().to_string())
print(f"\npolygons with area: {gdf['area_m2'].notna().sum()}   nodes/lines (no area): {gdf['area_m2'].isna().sum()}")
a = gdf["area_m2"].dropna()
print("\nfootprint area (m2) percentiles:")
for q in [1,5,10,25,50,75,90,95,99]:
    print(f"  p{q:<3} {np.percentile(a,q):>12,.0f}")
print(f"  max  {a.max():>12,.0f}")
print(f"\n>= 10,000 m2 (~2.5 acres):  {(a>=1e4).sum()}")
print(f">= 46,450 m2 (~500k sqft):  {(a>=46450).sum()}")
print(f">= 100,000 m2 (~25 acres):  {(a>=1e5).sum()}")
print("\nnamed share: %.1f%%" % (100*(gdf['name'].str.len()>0).mean()))
print("with start_date: %d" % (gdf['start_date'].str.len()>0).sum())
print("\nTop 15 by footprint:")
print(gdf.nlargest(15, "area_m2")[["name","operator","area_m2","lat","lon"]].to_string(index=False))
gdf.to_file("cache/osm_datacenters.geojson", driver="GeoJSON")
gdf.drop(columns="geometry").to_csv("cache/osm_datacenters.csv", index=False)
print("\nsaved cache/osm_datacenters.{geojson,csv}")
