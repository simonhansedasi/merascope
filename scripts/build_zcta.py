"""
build_zcta.py — First step of the ZCTA study variant: clip the national Census
ZCTA (ZIP Code Tabulation Area) shapefile down to per-state ZCTA boundary sets.

Output: data/{STATE}/zcta/zcta.geojson with features: {properties: {zcta: "XXXXX"}, geometry: ...}
Downstream: build_fishnet_from_zcta.py turns these polygons into the ZCTA-based
scoring geometry (replacing the 0.15deg fishnet grid used by the main pipeline),
and scripts/zcta/02_zcta_indicators.py scores them.

Run: /home/simonhans/anaconda3/envs/merascope/bin/python3 scripts/build_zcta.py
"""
import os
import geopandas as gpd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHP  = os.path.join(ROOT, 'data', 'raw', 'zcta_cb', 'cb_2020_us_zcta520_500k.shp')
DATA = os.path.join(ROOT, 'data')

# Discover states from data/ subdirectories rather than a hardcoded list —
# picks up whichever states already have raw/state.geojson from the main
# pipeline (2-letter uppercase dirs only; 'raw'/'processed' are non-state dirs
# at this same level and must be excluded).
STATES = [
    d for d in os.listdir(DATA)
    if os.path.isdir(os.path.join(DATA, d))
    and len(d) == 2
    and d.upper() == d
    and d not in ('raw', 'processed')
]
STATES.sort()

print(f'Loading national ZCTA shapefile ({SHP})...')
zctas = gpd.read_file(SHP)[['ZCTA5CE20', 'geometry']]
zctas = zctas.to_crs('EPSG:4326')
print(f'  {len(zctas)} ZCTAs loaded, reprojected to EPSG:4326')

for state in STATES:
    state_path  = os.path.join(DATA, state, 'raw', 'state.geojson')
    out_dir     = os.path.join(DATA, state, 'zcta')
    out_path    = os.path.join(out_dir, 'zcta.geojson')

    if not os.path.exists(state_path):
        print(f'{state}: no state.geojson — skipping')
        continue

    state_gdf = gpd.read_file(state_path)[['geometry']]
    if state_gdf.crs and state_gdf.crs.to_epsg() != 4326:
        state_gdf = state_gdf.to_crs('EPSG:4326')

    # 'intersects' (not 'within') so ZCTAs straddling a state line are kept for
    # both states — each state's ZCTA set can include boundary-crossing ZIPs
    # whose polygon geometry extends slightly beyond the state border.
    joined = gpd.sjoin(zctas, state_gdf, how='inner', predicate='intersects')
    joined = joined.drop_duplicates(subset='ZCTA5CE20')[['ZCTA5CE20', 'geometry']]
    joined = joined.rename(columns={'ZCTA5CE20': 'zcta'})

    os.makedirs(out_dir, exist_ok=True)
    joined.to_file(out_path, driver='GeoJSON')
    print(f'{state}: {len(joined)} ZCTAs → {out_path}')

print('Done.')
