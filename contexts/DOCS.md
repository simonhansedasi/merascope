# Merascope — Technical Documentation

## System Overview

Merascope is a data-center site-suitability platform. It has two major components:

1. **Data Pipeline** — 16 core scripts (01-10 + 11-16 supplemental) that pull public data, score each ~14-km grid cell across 48 contiguous US states on 23 indicators, and emit a `grid_scores.geojson` per state.
2. **Web Application** — a Flask server (`server.py`) backed by PostgreSQL that serves the Leaflet map, handles user sessions (magic-link auth), and manages a permitting-workflow database (cases, conditions, documents, stage tracking, rebuttals).

---

## Repository Layout

```
merascope/
├── scripts/
│   ├── config.py               — state lookup table + path helpers
│   ├── 01_basemap.py           — download base layers
│   ├── 02_indicators.py        — fishnet grid + core indicators
│   ├── 03_risk.py              — seismic + flood scores
│   ├── 04_environment.py       — contamination + waterway scores
│   ├── 05_geothermal.py        — geothermal heat-flow score
│   ├── 06_terrain.py           — SRTM terrain flatness score
│   ├── 07_protected.py         — federal + tribal land hard gate
│   ├── 08_aquifer.py           — groundwater depth score
│   ├── 09_soil.py              — SSURGO hydrologic group score
│   ├── 10_soilprofile.py       — SSURGO full-column contamination pathway score
│   ├── 11_substations.py       — substation/grid-node proximity score (EIA 860)
│   ├── 12_superfund.py         — Superfund NPL + RCRA corrective action scores
│   ├── 13_air_quality.py       — NAAQS attainment score (EPA Green Book)
│   ├── 14_fiber.py             — carrier-hotel proximity score (PeeringDB)
│   ├── 15_water_stress.py      — watershed water stress score (WRI Aqueduct 3.0)
│   ├── 16_iso_queue.py         — grid interconnection queue capacity score (EIA 860M)
│   ├── run_pipeline.py         — orchestrates core scripts 01-10 in sequence
│   ├── normalize_national.py   — cross-state *_nat normalization pass (run after all 48)
│   ├── grade_states.py         — relative letter grade computation + data.js patcher
│   ├── patch_raws.py           — retrofit raw physical-value columns
│   ├── patch_aquifer_invert.py — one-off aquifer score sign fix
│   └── patch_water_score.py    — one-off PRISM water score retrofit
├── tests/
│   ├── conftest.py             — shared pytest fixtures
│   ├── test_config.py          — unit tests for config.py
│   ├── test_indicators.py      — pipeline output validation
│   ├── test_gates.py           — hard-gate invariant tests
│   ├── test_server.py          — Flask route integration tests (needs PostgreSQL)
│   └── smoke_test.py           — headless Playwright browser test (26 checks)
├── data/
│   └── {STATE}/
│       ├── raw/                — downloaded source files (cached; never re-fetched)
│       ├── processed/          — PNG map outputs from each script
│       └── grid_scores.geojson — scored fishnet (pipeline output; served to frontend)
├── merascope/
│   └── data.js                 — frontend JS: session, workspace, scoring, Leaflet glue
├── server.py                   — Flask app (PostgreSQL backend)
├── manage_survey.py            — CLI for indicator-weight survey management
├── index.html                  — SPA shell (loads data.js + inline JSX via Babel CDN)
├── deploy_hetzner.sh           — rsync + systemctl restart deploy script
├── setup_pg.sh                 — first-run PostgreSQL setup
├── environment.yml             — conda env definition (Python 3.7, no GDAL)
└── CLAUDE.md                   — operator notes (read before touching anything)
```

---

## Pipeline: `scripts/`

### `config.py` — State Registry + Path Helpers

**`STATES`** — dict keyed by two-letter abbreviation. Each entry has `name`, `fips` (Census FIPS code), and `bbox` (west, south, east, north in WGS84).

**`utm_epsg(bbox)`** — computes the UTM zone EPSG code for the center longitude of a bounding box. Used by every script when re-projecting for distance calculations.

**`get_state(abbr)`** — looks up a state by abbreviation (case-insensitive), raises `ValueError` for unknowns. Returns a copy of the STATES entry with three added keys: `abbr`, `utm_epsg` (string like `"EPSG:32610"`), and `bbox_str` (comma-joined for ArcGIS REST queries).

**`get_paths(abbr)`** — returns `(project_root, raw_dir, processed_dir, grid_path)` as `Path` objects. Creates directories if needed. Respects the `DC_SUBDIR` environment variable: if set (e.g. `"zcta"`), `grid_scores.geojson` is written to `data/{STATE}/{DC_SUBDIR}/` instead of `data/{STATE}/`, allowing the same scripts to serve both fishnet and ZCTA study variants.

---

### `run_pipeline.py` — Pipeline Orchestrator

Runs all ten scripts in sequence for one state. Delegates to `subprocess.run` so each script gets its own Python interpreter process (avoids GeoPandas memory accumulation across steps).

**Arguments:**
- `state` — two-letter abbreviation
- `--start NN` — resume from step NN (e.g. `--start 03` skips steps 01-02)
- `--only NN [NN ...]` — run only specific steps
- `--deploy` — print rsync reminder after completion

After a full run (`--only` and `--start` not set), automatically calls `patch_raws.py` to backfill raw physical-value columns.

---

### `01_basemap.py` — Base Layer Download

**Purpose:** Fetches the four geographic reference layers that all downstream scripts depend on.

**Outputs** (all in `data/{STATE}/raw/`, all cached — only downloaded once):
- `state.geojson` — Census TIGER 2022 state boundary polygon
- `datacenters.geojson` — existing data centers from OpenStreetMap (`man_made=data_centre`)
- `transmission.geojson` — high-voltage power lines from OSM (`power=line`, voltage ≥ 100 kV)
- `eia860_plants.geojson` — EIA Form 860 (2023) power plants with fuel type and capacity

**Key functions:**

`fetch_state_boundary(abbr, fips, raw)` — downloads the nationwide TIGER shapefile zip (~100 MB), extracts it, filters to the target state, saves as GeoJSON. Skip if already cached.

`fetch_osm_datacenters(bbox, state_union)` — Overpass API query for `man_made=data_centre` nodes/ways/relations inside the state bbox. Returns a GeoDataFrame clipped to the state polygon (to exclude cross-border results).

`fetch_osm_transmission(bbox)` — Overpass API query for HV lines with voltage matching 6-digit regex (≥ 100,000 V). Returns LineString GeoDataFrame. Voltage is parsed later for cartographic styling.

`fetch_eia860(abbr, raw)` — downloads the EIA 860 zip, joins the plant-level sheet (`2___Plant.xlsx`) to the generator-level sheet (`3_1_Generator.xlsx`) to aggregate capacity and dominant fuel per plant, filters to the target state, saves GeoJSON.

`plot_basemap(...)` — produces `processed/basemap.png`: dark background, transmission lines styled by voltage tier (≥230kV vs <230kV), plants sized and colored by fuel type, data centers as diamond markers.

---

### `02_indicators.py` — Fishnet Grid + Core Stress Indicators

**Purpose:** Builds the fishnet grid (the spatial scaffold that all subsequent scripts score into) and computes the four baseline indicators.

**Constants:**
- `CELL_SIZE = 0.15` degrees (~14 km at mid-latitudes)
- `PRISM_WEST`, `PRISM_NORTH`, `PRISM_PIXEL` — pixel origin and resolution of the PRISM TIF (stored at `data/prism_ppt_30yr.tif`; one shared file for all states)

**Grid construction:**

`create_fishnet(state_gdf, cell_size)` — generates a rectangular grid of `box()` polygons covering the state bbox, then keeps only cells whose centroid falls within the state boundary. Assigns a sequential `cell_id`. This grid is written as `grid_scores.geojson` and each subsequent script reads+extends it in place.

**Indicator functions:**

`load_census_key()` — reads `CENSUS_API_KEY` from environment, or falls back to parsing `.env` files at known paths. Raises if not found.

`fetch_tracts(state_fips, raw)` — downloads Census TIGER 2022 tract boundaries for the state from the federal TIGER server. Implements 4-attempt exponential-backoff retry. Cached as `tracts.geojson`.

`fetch_acs(state_fips, raw)` — Census ACS 5-year API call for variables: total population (`B01003_001E`), poverty population (`B17001_002E`, `B17001_001E`), White/total race (`B02001_002E`, `B02001_001E`). Computes `poverty_rate`, `minority_rate`, and `demog_index = (poverty_rate + minority_rate) / 2`. Cached as `acs_demog.csv`.

`fetch_prism_ppt(data_dir)` — downloads the PRISM 30-year 4km annual precip normals zip (~2.7 MB), extracts the `.tif`, opens it with PIL as a float32 numpy array. The array is reused for all states (stored at the project root, not per-state).

`sample_prism(arr, lons, lats)` — nearest-pixel sampling of the PRISM array at arbitrary lon/lat coordinates. Converts geographic coordinates to pixel indices via the known origin and pixel size. NoData values (< −9000) become NaN.

**Scoring logic per indicator:**

- **`tx_score`** — each cell centroid's Euclidean distance to the unioned transmission geometry in projected coordinates. Normalized `1 - (dist / max_dist)`. If no transmission data: `0.5` (neutral).
- **`water_score`** — PRISM annual precip sampled at each centroid. Scaled from p05–p95 within the state.
- **`ej_score`** — spatial join of grid centroids to tracts, then `1 - normalized demog_index` (q01–q99). High score = low demographic burden.
- **`pop_exposure_score`** — spatial join to tract population density. `1 - (density / p95_density)`. High score = sparsely populated.

---

### `03_risk.py` — Seismic and Flood Scores

**Purpose:** Adds two risk indicators derived from federal hazard databases.

**`seismic_score`:**

`fetch_seismic(state_gdf, raw)` — samples a 6×10 lat/lon grid inside the state, querying the USGS ASCE 7-22 Design Maps API at each point for PGAM (maximum considered earthquake ground motion, 2% in 50 years, site class C). Waits 0.3s between calls. Saves as `seismic_sample.csv`.

`idw_k(src_pts, src_vals, tgt_pts, k=8, power=2)` — inverse distance weighting with k-nearest neighbors (scipy cKDTree). Used to interpolate the sparse USGS sample points to every grid cell centroid. Grid score = `1 - (pgam / p99_pgam)`, so low seismic hazard cells score high.

**`flood_score`:**

`fetch_flood(state_gdf, raw)` — tiles the state bbox into a 5×8 grid and queries the FEMA NFHL ArcGIS REST API (MapServer layer 28: Special Flood Hazard Areas). Filters for zone codes A, AE, AH, AO, AR, A99, VE, V (1% annual chance). Merges all tile results into `sfha.geojson`.

Scoring: centroid-in-SFHA spatial join. Cells with centroids inside any SFHA polygon receive `flood_score = 0.0`; all others get `1.0`. Binary — no continuous normalization.

---

### `04_environment.py` — Contamination and Waterway Scores

**Purpose:** Two distance-based environmental sensitivity scores.

**`contamination_score`:**

`fetch_tri_facilities(abbr, raw)` — EPA Toxics Release Inventory via the Envirofacts REST API (`/TRI_FACILITY/STATE_ABBR/{abbr}/JSON`). Handles two coordinate formats: `pref_latitude`/`pref_longitude` (decimal degrees, with longitude stored positive → negated for West hemisphere) and `fac_latitude`/`fac_longitude` (DDMMSS integers, decoded by `_ddmmss_to_dec()`). Cached as `tri_facilities.csv`.

`_ddmmss_to_dec(v)` — converts an integer like `474520` (47°45'20") to decimal degrees `47.755...`. Also detects field swaps by checking which field falls in the CONUS latitude range (24–50°N).

Score = `distance_to_nearest_TRI / max_distance`. High score = far from industrial sites.

**`waterway_score`:**

`fetch_osm_rivers(bbox, raw)` — Overpass query for `waterway=river` ways inside the state bbox. Cached as `rivers.geojson`.

Score = `distance_to_nearest_river / max_distance` (projected coordinates). High score = far from regulated waterways.

---

### `05_geothermal.py` — Geothermal Heat-Flow Score

**Purpose:** Scores cells by proximity to high geothermal heat flow (opportunity for geothermal cooling or co-located energy).

**Data source:** IHFC 2024 Global Heat Flow Database shapefile (`data/raw/IHFC_2024_GHFDB.shp`), filtered to the state bbox. Falls back to `data/{STATE}/raw/heatflow.csv` if the global file is present from a prior run.

`load_heatflow(abbr, bbox, raw)` — reads the global IHFC shapefile, extracts point geometries and the `q` column (heat flow in mW/m²), filters to the state bbox, drops nulls and non-positives, caches to `heatflow.csv`. Returns neutral `0.5` if the shapefile is missing.

`idw_k(...)` — same IDW interpolation pattern as script 03, here using geographic (lat/lon) coordinates in projected space.

Score = `q_interp / max_q_interp` after capping at p95 to suppress outliers. High score = high heat flow.

---

### `06_terrain.py` — Terrain Flatness Score

**Purpose:** Computes slope statistics from SRTM1 (1 arc-second / ~30 m) elevation data. Applies a hard gate: cells with less than 3% flat area (slope < 5°) are ineligible.

**Constants:**
- `TILE_SIZE = 3601` — SRTM1 tile dimension
- `DOWNSAMPLE = 3` — reduces to ~90 m resolution (9× fewer pixels)
- `FLAT_GATE = 0.03` — minimum flat fraction for eligibility
- `SLOPE_THRESHOLD = 5.0` degrees — threshold for "flat" pixel classification

**`srtm_tile_range(bbox)`** — computes which N??W??? SRTM tiles cover the state bbox. Returns (lat_tiles, lon_tiles) lists for nested iteration.

**`download_tile(lat, lon, tile_dir)`** — fetches gzipped HGT tiles from AWS S3 (`s3.amazonaws.com/elevation-tiles-prod/skadi/`), decompresses in-memory, writes raw HGT to `raw/srtm_tiles/`. Tiles are large (1–4 GB per state for TX); CLAUDE.md says to delete them after step 06.

**`load_tile(path)`** — reads the HGT binary format (big-endian signed 16-bit integers), reshapes to 3601×3601, replaces NoData (−32768) with NaN.

**`score_cells_tiled(grid, lat_tiles, lon_tiles, tile_dir)`** — main workhorse. Processes one SRTM tile at a time to avoid OOM (each tile is ~100 MB before downsampling). For each tile: downsamples, fills NaN with median, computes slope via `np.gradient`, finds grid cells whose centroids fall in the tile, extracts the slope patch covering each cell bounds, computes `flat_frac` (fraction of pixels with slope < threshold) and `slope_mean_deg`.

**Scoring:**
- `flatness_score = 0.0` for cells below `FLAT_GATE`; otherwise `flat_frac / p95_flat_frac` (capped at 1.0).
- `slope_score` = same formula without zeroing gated cells (used as a continuous slider in the frontend).

---

### `07_protected.py` — Protected Land Hard Gate

**Purpose:** Applies a binary gate to cells with >25% overlap with federal or tribal protected lands.

**`PROT_GATE = 0.25`** — 25% overlap threshold.

**Sources:**
- Esri USA Federal Lands API (`services.arcgis.com`) — NPS, Fish & Wildlife, DoD, Forest Service (BLM excluded). Paginates at 1,000 records with offset. 4-attempt retry with exponential backoff.
- Census TIGER AIANNH (American Indian / Alaska Native / Native Hawaiian Areas) via TIGERweb REST.

`fetch_federal_lands(bbox_str, cache_path)` — queries the Esri feature service with bbox filter, collects all pages, saves as `federal_lands.geojson`.

`fetch_tribal_lands(bbox_str, cache_path)` — single-page query to Census TIGERweb AIANNHA layer. Saves as `tribal_tiger.geojson`.

**Overlap computation:** Concatenates federal and tribal GDFs, dissolves to a single polygon, reprojects to UTM, runs `gpd.overlay(grid_proj, prot_dissolved, how="intersection")` to get per-cell intersection areas. `protected_frac = prot_area / cell_area`. `protected_score = 0.0` if `protected_frac > PROT_GATE`, else `1.0`.

---

### `08_aquifer.py` — Groundwater Depth Score

**Purpose:** Uses USGS NWIS discrete depth-to-water measurements to score cells by water table depth. Deep water tables reduce contamination risk (spills take longer to reach groundwater).

**API:** `https://api.waterdata.usgs.gov/ogcapi/v0/collections/field-measurements/items`, parameter code `72019` (depth to water level, ft below land surface), paginated at 5,000 records per page. Stops on HTTP 400 (API offset limit).

`fetch_well_depths(bbox, cache_path)` — iterates pages, collects point geometries and depth values, skips negative depths (water above surface). Cached as `well_depths.csv`.

`median_per_site(df)` — collapses multiple measurements per well to median depth; requires ≥2 measurements for inclusion (filters out one-off readings).

`idw_k(...)` — IDW interpolation (k=8, power=2) to all grid centroids. Handles exact-hit case (distance=0) by assigning the source value directly.

**Score:** `1 - clip(depth / p95_depth, 0, 1)`. High score = deep water table = lower contamination risk.

---

### `09_soil.py` — Soil Permeability Score

**Purpose:** Maps SSURGO hydrologic soil group (A/B/C/D) to a contamination permeability risk score via IDW from map-unit representative polygon locations.

**Data source:** SSURGO Soil Data Mart (SDM) tabular REST API at `SDMDataAccess.sc.egov.usda.gov`.

**Hydrologic group to score mapping:**
- A (high permeability, fast infiltration) → 0.00
- B → 0.33
- C → 0.67
- D (low permeability, slow infiltration) → 1.00
- A/D, B/D, C/D (split-class dual drainage) → midpoints

`sdm_query(q, timeout, retries)` — posts SQL to the SDM tabular service as JSON, returns `Table` array. 4-attempt exponential-backoff retry.

`fetch_mukey_hydgrp(state_abbr, cache_path)` — queries `mapunit JOIN muaggatt JOIN legend JOIN mupolygon` to get one representative `mupolygonkey` per map unit, along with `hydgrpdcd`. Cached as `soil_mukeys.csv`.

`fetch_poly_coords(df_mukeys, cache_path)` — fetches full mupolygon WKT records in batches of 100. Parses the first lon/lat coordinate pair from WKT column 6 via regex. Cached as `soil_coords.csv`.

IDW from map unit representative points to grid centroids. Merged scores averaged per mukey when a mukey appears multiple times.

---

### `10_soilprofile.py` — Soil Profile Contamination Pathway Score

**Purpose:** A more detailed soil risk score that looks at the full 0–150 cm profile using three soil chemical/physical properties.

**Sub-scores and weights:**
- `caco3_score` (weight 0.40) — `1 - min(max_CaCO3_across_horizons / 15%, 1)`. High CaCO3 = lime mobilization risk.
- `ksat_score` (weight 0.35) — `1 - clip(log1p(thickness_weighted_ksat) / log1p(100 µm/s), 0, 1)`. Fast hydraulic conductivity = quick percolation.
- `clay_score` (weight 0.25) — `clip(thickness_weighted_clay / 35%, 0, 1)`. High clay = aquitard protection.

`fetch_chorizon(state_abbr, cache_path)` — queries the SSURGO `chorizon` table via SDM, selecting horizons between 0–150 cm depth (`hzdept_r < 150`). Splits the query by area symbol (survey area) because a full state query exceeds the 100K-row limit. Cached as `soil_profile_horizons.csv`.

`aggregate_per_mukey(df)` — clips bottom depth at 150 cm, computes thickness-weighted means for K-sat and clay, MAX for CaCO3 (any single high-lime horizon = flag). Fills NaN sub-scores with state medians.

`score_mukeys(df_agg)` — applies the three sub-score formulas and computes the weighted composite. Also writes intermediate sub-score columns (`caco3_score`, `ksat_score`, `clay_score`).

Reuses `soil_coords.csv` from script 09 for representative polygon locations (step 09 must run first). IDW to grid centroids for both `soil_profile_score` and `ksat_score` (plotted separately). Also writes `ksat_mean_ums` as a raw column.

---

### `11_substations.py` — Substation / Grid Node Proximity Score

**Purpose:** Scores cells by proximity to the nearest high-capacity grid interconnection point. Power plants from EIA Form 860 are used as grid-node proxies (each plant is substation-connected); plant capacity (MW) serves as a voltage-class proxy.

**Adds to `grid_scores.geojson`:** `substation_dist_m`, `substation_voltage_kv` (effective MW weight), `substation_score`

**Source:** EIA Form 860 Annual Electric Generator Report (plant-level file, 2024 with 2023 fallback). Cached in `data/shared/substations.csv`. Each plant's `Latitude`, `Longitude`, and rated capacity are kept.

**Scoring:** KDTree nearest-neighbor lookup. `proximity_component = 1 - (dist / max_dist)`. `capacity_component = capacity_weight(mw)` (0.10 for <1 MW → 1.0 for ≥500 MW). `substation_score = 0.6 * proximity + 0.4 * capacity`.

---

### `12_superfund.py` — Superfund NPL and RCRA Site Proximity Scores

**Purpose:** Adds two contamination-distance indicators derived from EPA's comprehensive cleanup databases. TRI (from script 04) covers active reporting facilities; NPL and RCRA cover sites with documented contamination and active cleanup orders — the first indicators regulators check in NEPA and EJ review.

**Adds to `grid_scores.geojson`:** `superfund_dist_m`, `rcra_dist_m`, `superfund_score`, `rcra_score`

**Source:** EPA Envirofacts REST API, same pattern as `04_environment.py`. NPL sites from `SEMS.SEMS_SITES_VIEW`; RCRA corrective action sites from `RCRAINFO.BR_REPORTING`. Cached in `data/{STATE}/raw/superfund_sites.csv` and `rcra_sites.csv`.

**Scoring:** KDTree proximity, p01-p99 normalized, inverted (1 = farthest from site = better).

---

### `13_air_quality.py` — EPA NAAQS Non-Attainment Score

**Purpose:** Flags cells in counties that fail federal air quality standards. Non-attainment for PM2.5, PM10, or Ozone creates backup diesel generator permitting risk and signals higher community health burden.

**Adds to `grid_scores.geojson`:** `naaqs_nonattainment`, `air_quality_score`

**Source:** EPA Green Book GIS non-attainment area shapefile (national). Cached in `data/shared/naaqs_nonattainment.geojson`. One-time download on first state run.

**Scoring:** Binary. Spatial join of cell centroids to non-attainment polygons. `air_quality_score = 1.0` (attainment) or `0.0` (non-attainment).

---

### `14_fiber.py` — Fiber Infrastructure Proximity Score

**Purpose:** Scores cells by proximity to carrier-neutral colocation facilities — the physical points where long-haul fiber routes terminate and interconnect. Critical for latency-sensitive workloads, edge deployments, and financial services.

**Adds to `grid_scores.geojson`:** `fac_dist_m`, `fiber_score`

**Source:** PeeringDB `/api/fac` (free JSON, no auth required). Each record includes facility lat/lon. Cached in `data/shared/peeringdb_fac.csv`.

**Scoring:** KDTree proximity, p01-p99 normalized. `fiber_score = 1 - (dist / p99_dist)`.

---

### `15_water_stress.py` — WRI Aqueduct Watershed Water Stress Score

**Purpose:** Augments `water_score` (PRISM precipitation proxy) with a rights-and-consumption-based stress metric. Aqueduct captures drought curtailment risk, withdrawal competition, and regulatory restriction — none of which correlate reliably with precipitation.

**Adds to `grid_scores.geojson`:** `water_stress_raw`, `water_stress_score`

**Does NOT modify `water_score`** (PRISM precipitation stays, per CLAUDE.md).

**Source:** WRI Aqueduct Water Risk Atlas 3.0, `bws_score` column (0-5 scale, -1 = no data). Global dataset (~614 MB ZIP). Cached in `data/shared/aqueduct_watersheds.gpkg` as a CONUS-clipped subset (~27 MB).

**Memory safety:** The ZIP is streamed to disk (never held in RAM), extracted to disk, read with a CONUS bbox filter, then the 614 MB source and temp directory are deleted. Only the ~27 MB CONUS clip is cached. This prevents the OOM that occurs when holding 614 MB in memory on constrained hosts.

**Scoring:** Spatial join of cell centroids to Aqueduct watershed polygons. Cells with no watershed match get the state median. Score inverted: `1 - (stress - min) / (max - min)` so low-stress cells score high.

---

### `16_iso_queue.py` — Grid Capacity / Interconnection Queue Score

**Purpose:** Estimates interconnection queue pressure per state. States with a high ratio of planned/proposed capacity to existing operating capacity face more competition for grid access and higher probability of curtailment delays for new large loads.

**Adds to `grid_scores.geojson`:** `iso_queue_mw`, `grid_capacity_score`

**Source:** EIA Form 860M (Monthly Electric Generator Report), Planned sheet. `iso_queue_mw` = total MW in planned/proposed status for the state. `operating_mw` = sum of operating capacity. Cached in `data/shared/eia860m_state_capacity.csv`.

**Scoring:** `queue_ratio = planned_mw / max(operating_mw, 1)`. `grid_capacity_score = 1 - clip(queue_ratio / p75_ratio, 0, 1)`. All cells in a state receive the same value (state-level metric).

---

### `normalize_national.py` — Cross-State Normalization

**Purpose:** After all 48 states have been scored, this script adds `*_nat` columns so cells can be compared across state lines. State-normalized scores use within-state p-ranges; national scores use global p01–p99.

**Score map (`SCORE_MAP`):** 14 entries, each as `(nat_col, raw_col, direction)`. `direction='invert'` means lower raw value = higher score (e.g. distance to TRI facilities: farther = better). `raw_col=None` means no single physical raw exists — the script re-ranks the state-normalized score itself.

`collect_global(all_gj, col)` — pulls all non-null values of a column across all states, returning the value array and a `(state, feature_idx)` index list.

`minmax_nat(raw_vals, direction, p_lo=1, p_hi=99)` — clips to global p01/p99 and scales 0–1. If `direction='invert'`, flips `1 - normed`.

Binary scores (`flood_score`, `protected_score`) are copied directly as `flood_score_nat` and `protected_score_nat` without re-ranking.

States missing a raw column get their state-normalized score copied as-is (early 9 states lack `flat_frac`, for example).

Writes back all `*_nat` columns in-place to each state's GeoJSON.

---

### `patch_raws.py` — Raw Column Backfill

**Purpose:** Retrofits the raw physical-value columns (meters, mm/yr, ft, etc.) to states that were processed before the raw-column requirement was added. Run automatically at the end of a full pipeline run.

Each `patch_stepNN()` function is idempotent: it checks whether the column already exists before computing it. Reads only from already-cached files — no network calls.

| Function | Columns added |
|---|---|
| `patch_step02` | `tx_dist_m`, `ann_precip_mm`, `pop_density` |
| `patch_step03` | `seismic_pga_g` |
| `patch_step04` | `tri_dist_m`, `river_dist_m` |
| `patch_step05` | `heatflow_mwm2` |
| `patch_step07` | `protected_frac` |
| `patch_step08` | `aquifer_depth_ft` |
| `patch_step10` | `ksat_mean_ums` |

`flat_frac` and `slope_mean_deg` cannot be backfilled (require SRTM tiles, which are deleted after step 06).

---

## Grid Score Column Reference

Each `grid_scores.geojson` feature carries these property columns after a complete pipeline run:

| Column | Type | Range | Meaning |
|---|---|---|---|
| `cell_id` | int | 0..N | Sequential cell index within state |
| `tx_score` | float | 0-1 | Proximity to HV transmission (state-normalized) |
| `water_score` | float | 0-1 | Annual precipitation (PRISM, state p05-p95) |
| `ej_score` | float | 0-1 | Inverse demographic burden (ACS poverty + minority) |
| `pop_exposure_score` | float | 0-1 | Inverse population density |
| `seismic_score` | float | 0-1 | Inverse PGA (USGS ASCE 7-22) |
| `flood_score` | 0 or 1 | binary | 0 = inside SFHA (FEMA) |
| `contamination_score` | float | 0-1 | Distance to EPA TRI facility |
| `waterway_score` | float | 0-1 | Distance to major rivers (OSM) |
| `geothermal_score` | float | 0-1 | Heat flow (IHFC GHFDB 2024) |
| `flatness_score` | float | 0-1 | Flat fraction (SRTM1); 0 if gated |
| `slope_score` | float | 0-1 | Flat fraction (continuous, no gate) |
| `protected_score` | 0 or 1 | binary | 0 if >25% protected land overlap |
| `aquifer_score` | float | 0-1 | Inverse depth-to-water (shallow = better cooling) |
| `soil_score` | float | 0-1 | SSURGO hydrologic group (D=low perm=high score) |
| `soil_profile_score` | float | 0-1 | Weighted composite: CaCO3 + K-sat + clay |
| `ksat_score` | float | 0-1 | Inverse K-sat sub-score |
| `*_nat` | float | 0-1 | National re-normalization of each above |
| `tx_dist_m` | float | meters | Raw distance to nearest HV line |
| `ann_precip_mm` | float | mm/yr | PRISM annual precip |
| `pop_density` | float | /km² | Census tract population density |
| `seismic_pga_g` | float | g | Interpolated PGA |
| `tri_dist_m` | float | meters | Distance to nearest TRI facility |
| `river_dist_m` | float | meters | Distance to nearest major river |
| `heatflow_mwm2` | float | mW/m² | Interpolated geothermal heat flow |
| `flat_frac` | float | 0-1 | Fraction of pixels with slope < 5° |
| `slope_mean_deg` | float | degrees | Mean slope across cell |
| `protected_frac` | float | 0-1 | Fraction overlapping protected land |
| `aquifer_depth_ft` | float | feet | Interpolated depth to water table |
| `ksat_mean_ums` | float | µm/s | Thickness-weighted mean hydraulic conductivity |

**Supplemental columns (scripts 11-16, all 48 states as of 2026-06-23):**

| Column | Type | Range | Meaning |
|---|---|---|---|
| `substation_dist_m` | float | meters | Distance to nearest EIA Form 860 power plant |
| `substation_score` | float | 0-1 | Proximity + capacity composite |
| `superfund_dist_m` | float | meters | Distance to nearest EPA NPL Superfund site |
| `superfund_score` | float | 0-1 | Inverted distance (1 = farthest) |
| `rcra_dist_m` | float | meters | Distance to nearest RCRA corrective action site |
| `rcra_score` | float | 0-1 | Inverted distance |
| `naaqs_nonattainment` | 0 or 1 | binary | 1 = non-attainment county |
| `air_quality_score` | float | 0-1 | 1 = attainment, 0 = non-attainment |
| `fac_dist_m` | float | meters | Distance to nearest PeeringDB carrier hotel/colo |
| `fiber_score` | float | 0-1 | Inverted proximity to fiber exchange point |
| `water_stress_raw` | float | 0-5 | Aqueduct baseline water stress (0=low, 5=high) |
| `water_stress_score` | float | 0-1 | Inverted stress (1 = low stress = better) |
| `iso_queue_mw` | float | MW | State total planned/proposed capacity in EIA 860M |
| `grid_capacity_score` | float | 0-1 | Inverse queue pressure (1 = less congested grid) |

---

## Server: `server.py`

Flask application backed by PostgreSQL. Serves the SPA (`index.html`, `merascope/data.js`, all state GeoJSON files) and provides the REST API for the permitting workflow.

### Database Connection

**`_get_pool()`** — singleton `ThreadedConnectionPool(1, 10)` using `DATABASE_URL` env var (default: `postgresql://merascope:merascope@localhost/merascope`). Lazy-initialized on first call.

**`get_db()`** — context manager. Checks out a connection from the pool, yields a `_DB` wrapper, commits on clean exit, rolls back on exception, always returns the connection to the pool.

**`_DB`** — thin psycopg2 cursor wrapper that:
- Converts `?` placeholders to `%s` (write `?` everywhere in SQL, never `%s`)
- Returns rows as dicts via `RealDictCursor`
- Serializes `datetime` and `date` values to ISO strings via `_coerce()`
- Exposes `.execute()`, `.fetchone()`, `.fetchall()`, and `.lastrowid`
- **Important:** always capture `.lastrowid` inside the `with get_db() as db:` block; the cursor is closed on exit

**`init_db()`** — creates all tables with `IF NOT EXISTS`. Called at module load. Idempotent. Wrapped in try/except so the server still imports if the database is unreachable (tests patch `_pool` before calling `init_db` themselves).

### Database Schema

| Table | Primary Key | Purpose |
|---|---|---|
| `event_log` | `id` SERIAL | Raw analytics — every user action logged |
| `cases` | `case_id` TEXT | Permit applications |
| `case_meta` | `case_id` TEXT | Rebuttal deadline tracking |
| `case_stage_overrides` | `case_id` TEXT | Explicit stage transitions |
| `case_conditions` | `id` SERIAL | Permit conditions (proposed/approved) |
| `case_docs` | `id` SERIAL | Uploaded document metadata |
| `case_invites` | `(case_id, agency_key)` | Co-party access grants |
| `case_rebuttals` | `id` SERIAL | Written rebuttals to conditions |
| `case_impasse_routes` | `item_key` TEXT | Impasse resolution tracking |
| `study_checks` | `(study_name, section_idx)` | Mandated study section checkboxes |
| `crm_state` | `fid` TEXT | Builder CRM state blob (JSON) per grid cell |
| `users` | `email` TEXT | Registered users |
| `sessions` | `token` TEXT | Magic-link auth sessions (30-day TTL) |
| `user_roles` | `(email, role)` | Role assignments (builder/steward/co-party) + agency key |
| `steward_templates` | `id` SERIAL | Custom indicator weighting templates |
| `steward_zones` | `id` SERIAL | Geographic zones tied to templates |

### Auth System

**Magic-link flow:**
1. `POST /api/auth/request` — client sends `{"email": "..."}`. Server upserts user, deletes expired sessions, creates a new session token (32-byte URL-safe random), emails a link to `/verify?token=X` via SMTP. In dev mode (no `APP_ENV=production`), prints the link to stdout/journal instead of failing.
2. `GET /verify?token=X` — validates token, extends session TTL to 30 days, sets `mera_sess` HTTP-only cookie, redirects to `/#/steward` or `/#/builder` based on role.
3. `GET /api/auth/me` — returns `{email, role, agency_key}` from cookie, or 401.
4. `POST /api/auth/logout` — deletes session row, clears cookie.

**Session cookie:** `mera_sess`, HTTP-only, SameSite=Lax. `Secure` flag set only in production (`APP_ENV=production`).

**`_session_user()`** — reads `mera_sess` cookie without requiring authentication. Returns `{email, role, agency_key}` or `None`. Used for optional auth (unauthenticated demo users still get access).

**`require_auth`** decorator — hard-requires a valid session. Sets `g.user_email`, `g.user_role`, `g.agency_key`. Returns 401 if missing or expired.

**`require_steward`** decorator — requires a valid steward session: returns 401 if no session cookie, 403 if authenticated but not a steward. (The former "no cookie → demo steward" backdoor was removed 2026-06-24.)

**`_can_access_case(user, case_row)`** — row-level read access for REAL case rows (demo/fixture ids are handled by the callers, e.g. the `is_demo` branch in `report_case`). Governs the three single-case read routes: `GET /api/builder/case/<id>`, `GET /api/case/<id>/anchor`, `GET /report/<id>`. **Hardened 2026-07-04** — previously granted `None` users and all co-parties unconditionally, which let anyone read any real case by its enumerable `YY-NNNN` id (full applicant PII) and let any co-party read non-invited cases. Now:
- `None` user (unauthenticated) → **deny** (was allow — the bug)
- `steward` / `admin` → allow
- `co-party` → allow **only if their `agency_key` has a `case_invites` row for this `case_id`** (was a blanket allow; now a DB check, matching `_case_write_guard`)
- `builder` → allow only if `case_row.owner_email == user.email` (the old `owner_email IS NULL` escape hatch was removed — `create_case` now always stamps an owner)

Regression tests: `TestGetBuilderCase::test_anonymous_cannot_read_real_case`, `test_other_builder_cannot_read_case`, `test_uninvited_coparty_cannot_read_case`, `test_invited_coparty_can_read_case`.

**`_can_access_case` vs `_case_write_guard`** — read and write authorization now agree; keep them in sync when changing either.

**`_case_write_guard(case_id)`** (replaced `_check_case_access`, 2026-07-02) — the access guard used by every case read, write, and document route. Demo (`demo-*`) and unknown case ids stay open (the public demo needs it); a real case row requires the owner, a steward/admin, or an invited co-party. Returns an error `(response, status)` tuple to abort, or `None` to allow.

### Object Storage

`_USE_S3 = bool(os.environ.get('S3_ENDPOINT'))`. When enabled, documents are stored in an S3-compatible bucket (Hetzner Object Storage). When disabled, they're stored on disk under `data/docs/{case_id}/`.

`_get_s3()` — lazy singleton boto3 client using `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` env vars. Boto3 is optional (import wrapped in try/except).

`upload_doc` — generates a collision-resistant filename as `{8-char hex}-{safe_name}` (no DB lookup needed for uniqueness). When S3 is active, uploads via `s3.upload_fileobj()` with appropriate `ContentType` and `ContentDisposition`. S3 key = `{case_id}/{stored_filename}`.

`serve_doc` — when S3 is active, generates a 15-minute presigned URL and redirects. When local, `send_from_directory`.

### API Routes Reference

#### Event Log

| Method | Route | Description |
|---|---|---|
| POST | `/api/log` | Write an event to `event_log`. Requires `event_type`; `session_id` and `fid` optional. |
| GET | `/api/export/workspace` | CSV of all `save_cell` events (one row per unique `fid`). Includes composite scores, state rank, and all 22 national indicator columns. |
| GET | `/api/export/status` | CSV of status changes, activity logs, contact events, notes. |
| GET | `/api/admin/log` | Returns up to 500 raw event rows. Requires `?key=MERA_ADMIN_KEY`. **Fails closed (2026-07-04):** if `MERA_ADMIN_KEY` is unset the route is disabled entirely (no `devonly` default); key compared with `secrets.compare_digest`. |

#### Lead Capture

| Method | Route | Description |
|---|---|---|
| POST | `/api/lead` | Pricing-page inquiry (added 2026-07-06). Body: `{email (required), name, org, note, workspace, tier, session_id}` — all optional fields length-capped server-side. Stores into the `leads` table and notifies `LEAD_NOTIFY_EMAIL` (fallback `FROM_EMAIL`/`SMTP_USER`) via `_send_notification()` when `NOTIFY_ENABLED=1`. Rate-limited 5 / 15 min per IP with its own limiter store. Frontend: `LeadModal` in `misc.jsx` — all six sales-touch pricing CTAs open it; the Builder Individual tier links to `#/login` instead. |

#### Cases

| Method | Route | Description |
|---|---|---|
| GET | `/api/cases` | Paginated case list (`?limit`, `?offset`). Filtered by role: builder sees own cases, co-party sees invited cases, steward/admin see all. **Anonymous or incomplete-role callers get an empty list** — no leak. Returns `{cases, total, limit, offset}`. |
| POST | `/api/cases` | Create a case (minimal: `site`, `applicant`). **Steward/admin only.** `case_id` minted from the `case_seq` Postgres sequence (was `{YY}-{1000+count}`, which collided on deletes/races). |
| POST | `/api/builder/submit` | Full builder case submission with lat/lon, contact info, lead agency, external permit ID. Sets `owner_email` from session. |
| GET | `/api/builder/case/<case_id>` | Fetch one case; respects row-level access control. |
| PATCH | `/api/builder/case/<case_id>/confirm` | Agency confirms receipt; sets `agency_tracking_id`, `confirmed_at`, advances stage to `Intake`. |

#### Stage Tracking

| Method | Route | Description |
|---|---|---|
| GET | `/api/case/<case_id>/stage` | Get current override stage. |
| PATCH | `/api/case/<case_id>/stage` | Set stage in both `case_stage_overrides` and `cases.stage`. |

#### Conditions

| Method | Route | Description |
|---|---|---|
| GET | `/api/case/<case_id>/conditions` | List all conditions ordered by id. |
| POST | `/api/case/<case_id>/conditions` | Add condition (text, by, type, status, pending_approval, submitted_by_role). Returns new `id`. |
| PATCH | `/api/case/<case_id>/conditions/<id>` | Approve (clears `pending_approval`, sets status=Proposed) or update `status`. |
| DELETE | `/api/case/<case_id>/conditions/<id>` | Remove condition. |

#### Documents

| Method | Route | Description |
|---|---|---|
| GET | `/api/case/<case_id>/docs` | List docs (id, name, filename, date, label, doc_status). Access-controlled. |
| POST | `/api/case/<case_id>/docs` | Upload file (multipart). `label` and `doc_status` from form fields. Access-controlled. |
| GET | `/api/case/<case_id>/docs/<filename>` | Serve/redirect to doc. Access-controlled. |

#### Invites

| Method | Route | Description |
|---|---|---|
| GET | `/api/case/<case_id>/invites` | List agency keys with access to this case. |
| POST | `/api/case/<case_id>/invite` | Grant co-party access by `agency_key`. Upserts (no duplicate error). |

#### Rebuttal Deadline

| Method | Route | Description |
|---|---|---|
| GET | `/api/case/<case_id>/deadline` | Returns `{days, cycle, max_cycles}` computed from `rebuttal_due_date`. Returns null if unset. |
| POST | `/api/case/<case_id>/deadline` | Set `due_date`, `cycle`, `max_cycles` (upsert). |

#### Rebuttals

| Method | Route | Description |
|---|---|---|
| GET | `/api/case/<case_id>/rebuttals` | List rebuttal texts ordered by id. |
| POST | `/api/case/<case_id>/rebuttal` | Append a rebuttal text. Returns new `id`. |

#### Study Checks

| Method | Route | Description |
|---|---|---|
| GET | `/api/studies/checks` | All checked `(study_name, section_idx)` pairs. |
| POST | `/api/studies/check` | Toggle a section: `{study_name, section_idx, checked}`. Upserts or deletes. |

#### Impasse Routing

| Method | Route | Description |
|---|---|---|
| GET | `/api/impasse/routes` | List all item keys marked as impasse-routed. |
| POST | `/api/impasse/route` | Add an item key (upserts). |

#### CRM State

| Method | Route | Description |
|---|---|---|
| GET | `/api/crm/<fid>` | Get JSON blob for a grid cell (free-form CRM state). |
| POST | `/api/crm/<fid>` | Save/overwrite JSON blob. |

#### Auth

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/request` | Send magic link to email. |
| GET | `/verify` | Validate token, set cookie, redirect. |
| GET | `/api/auth/me` | Return current user or 401. |
| POST | `/api/auth/logout` | Delete session and cookie. |

#### Steward Templates (require steward role)

| Method | Route | Description |
|---|---|---|
| GET | `/api/steward/presets` | Return 5 built-in preset templates (not stored in DB). |
| GET | `/api/steward/templates` | List templates for the authenticated agency. |
| POST | `/api/steward/templates` | Create template (name, weights dict, min_score). Missing indicator keys default to 0. |
| PATCH | `/api/steward/templates/<id>` | Partial update (name, weights, min_score, locked). Ownership enforced by `agency_key`. |
| DELETE | `/api/steward/templates/<id>` | Delete template; NULLs `template_id` on any linked zones. |

**Indicator key list** (`_IND_KEYS`): `transmission`, `water`, `community`, `seismic`, `flood`, `contamination`, `waterway`, `geothermal`, `flatness`, `aquifer`, `soil`, `slope`, `pop_exposure`, `soil_profile`, `ksat`, `substation`, `superfund`, `rcra`, `air_quality`, `fiber`, `water_stress`, `grid_capacity`.

**Preset templates** (`PRESET_TEMPLATES`): `balanced`, `grid_complete`, `water_durability`, `contamination_screen`, `ej_forward`. Stored as Python constants, returned by `/api/steward/presets`, never in the DB.

#### Steward Zones (require steward role)

| Method | Route | Description |
|---|---|---|
| GET | `/api/steward/zones` | List zones with joined template data. |
| POST | `/api/steward/zones` | Create zone (name, zone_type, state_code, bbox, county_fips, zcta_code, template_id). |
| PATCH | `/api/steward/zones/<id>` | Partial update. |
| DELETE | `/api/steward/zones/<id>` | Delete zone. |

**Zone types:** `state` (match by state_code), `bbox` (bounding box, client-side check), `county` (3-digit COUNTYFP, server-side PIP), `zcta` (5-digit ZCTA, server-side PIP).

#### Public Zone/Gate Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/zones/active` | All zones with locked templates (used to populate `window.ACTIVE_ZONES` on app mount). |
| GET | `/api/gate_check?lat=X&lon=Y&state=S` | Server-side point-in-polygon check for county/ZCTA zones. Returns matched gate records with weights and min_score. |

### Point-in-Polygon (`_point_in_ring`, `_point_in_geometry`, etc.)

Pure-Python ray-casting implementation (no GDAL).

**`_point_in_ring(lon, lat, ring)`** — ray-casting algorithm. Iterates polygon ring edges, counts crossings with a horizontal ray from the test point. Returns True if inside.

**`_point_in_geometry(lon, lat, geom)`** — handles both Polygon (outer ring + holes) and MultiPolygon. For MultiPolygon, tests each sub-polygon's outer ring and subtracts holes.

**`_point_in_county(lon, lat, state_code, county_fips)`** — loads `data/{STATE}/raw/tracts.geojson` (cached in `_geo_cache`), finds features matching `COUNTYFP`, calls `_point_in_geometry`.

**`_point_in_zcta(lon, lat, state_code, zcta_code)`** — loads `data/{STATE}/zcta/zcta.geojson`, matches on `zcta` property.

**`_geo_cache`** — module-level dict keyed by file path. Prevents re-reading GeoJSON on every `/api/gate_check` call.

---

## Frontend: `merascope/data.js`

JavaScript module loaded by `index.html`. Sets up global functions used by the Leaflet map and the React-style UI components inlined in `index.html`.

### Session Management

**`window.MERA_SESSION`** — unique session ID stored in `localStorage` (`mera_session_v1`). Generated as `Date.now().toString(36) + random`. Sent with every `/api/log` call to associate events.

**`window.serverLog(eventType, fid, payload)`** — fire-and-forget `POST /api/log`. Swallows errors silently so map interactions never break due to logging failures.

### Workspace (Saved Cells)

LocalStorage keys: `mera_saved_v1` (array of saved cell objects), `mera_geo_v1` (Nominatim reverse-geocode cache).

**`window.saveCellToBuilder(feat)`** — saves a grid cell feature to the builder workspace. Computes centroid lat/lon from polygon coordinates, calls `window.computeCellRank` and `window.MERA.composite` for state rank and composite scores, logs a `save_cell` event. Calls `window.fetchMunicipality` for the human-readable location and includes it in the log payload.

**`window.removeSavedCell(fid)`** / **`window.isCellSaved(fid)`** — workspace membership checks.

**`window.fetchMunicipality(fid, lat, lon)`** — Nominatim reverse-geocode (`/reverse?zoom=10`). Returns a `{county, city, state, display}` object. Cached in `mera_geo_v1` by fid. Uses `User-Agent: Merascope/1.0` to comply with Nominatim policy.

**`window.getCachedMunicipality(fid)`** — synchronous cache read (no network).

---

## `manage_survey.py` — Indicator Weight Survey CLI

Standalone script for managing the indicator-ranking survey stored in a SQLite database (`data/survey.db`).

**`SURVEY_INDICATORS`** — the 12 indicators that survey respondents rank: `tx`, `water`, `ej`, `seismic`, `flood`, `contam`, `waterway`, `geo`, `flat`, `pop`, `aquifer`, `soil`.

**`compute_weights(rows)`** — converts rank responses to weights:
1. Borda count: `points = (N + 1 - rank)` per indicator per respondent.
2. Variance-penalized mean: `raw = mean / (1 + stdev)` (penalizes disagreement).
3. Normalize to sum to 1.

**Commands:**

`snapshot <state> <region> "<label>"` — computes weights from all responses for a state/region combination and saves a snapshot to `survey_snapshots`. Prints the resulting weight distribution.

`count <state> <region>` — prints number of responses.

`export <state> <region>` — dumps raw responses as CSV.

---

## Tests: `tests/`

**79 pipeline tests** (no server required):

- `test_config.py` — unit tests for `get_state()` (valid/invalid abbreviations, bbox format, UTM EPSG computation).
- `test_indicators.py` — loads `data/WA/grid_scores.geojson` and validates: all score columns present, all values in [0, 1], binary scores only 0/1, `cell_id` unique, `_nat` columns present after normalization.
- `test_gates.py` — validates hard gate invariants: cells with `protected_score=0` have `protected_frac > 0`, cells with `flatness_score=0` have `flat_frac < 0.03` (or flat_frac missing for early states).

**132 server tests** (`test_server.py`): Flask route integration tests via `app.test_client()`. Requires PostgreSQL (`TEST_DATABASE_URL` or `DATABASE_URL`). Skips cleanly if PostgreSQL is unavailable. Tests cover: case CRUD, case access control (anon/owner/steward/co-party read+write+doc guards), stage transitions, conditions, invites, rebuttals, deadlines, study checks, CRM, impasse routing, steward templates, steward zones, gate_check, record anchoring, weight logging, report context, and auth flow (login, verify, me, logout). Auth in tests uses `client.set_cookie` (a `Cookie:` header is ignored by the werkzeug 3.x test client). A sibling `test_static_guard.py` covers the serving allowlist (no DB).

**26 smoke checks** (`smoke_test.py`): Playwright headless Chromium browser test. Starts its own Flask server on a free port. Checks: page loads, map renders, at least one polygon visible, score panels respond to click, export links work.

**Shared fixture** (`conftest.py`):
- `wa_props` (session-scoped) — loads Washington's `grid_scores.geojson` and returns all feature property dicts. Skips if the file doesn't exist.

---

## Deploy: `deploy_hetzner.sh`

Rsyncs code (excluding `.git/`, `__pycache__/`, `data/`, SQLite files) to Hetzner VPS at `root@204.168.182.60:/home/simonhans/coding/merascope/`, then runs `systemctl restart merascope`.

Data files (`data/`) are synced separately via `sync_data_hetzner.sh` (not part of code deploy) to avoid re-transferring multi-GB GeoJSON files on every push.

**Environment variables required on server:** `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `APP_URL=https://merascope.com`, `APP_ENV=production`, `MERA_ADMIN_KEY`. Optional: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`.

---

## IDW Pattern

Five scripts (03, 04, 05, 08, 09, 10, and patch_raws) use inverse-distance weighting with a nearly identical `idw_k` implementation:

```
k = min(k, len(src_pts))
tree = cKDTree(src_pts)
dists, idxs = tree.query(tgt_pts, k=k)
weights = 1 / max(dist, 1e-10) ** power
weights /= weights.sum(per-row)
result = (weights * src_vals[idxs]).sum(per-row)
```

Default k=8, power=2. Exact hits (distance=0) are handled by clamping the denominator to 1e-10 and assigning the source value directly. Script 03 uses a simpler variant without the exact-hit guard.

---

## Indicator → Pillar Mapping (Frontend)

The frontend groups indicator scores into three primary suitability pillars for default display. All 22 configurable indicator keys are available to steward templates via weight sliders (the 23rd, `protected_score`, is a hard gate with no weight).

| Pillar | Default display | Key |
|---|---|---|
| Transmission | Primary pillar | `transmission` (tx_score) |
| Water | Primary pillar | `water` (water_score) |
| Community | Primary pillar | `community` (ej_score) |

Extended core indicators (0 default weight, available via sliders): `seismic`, `flood`, `contamination`, `waterway`, `geothermal`, `flatness`, `aquifer`, `soil`, `slope`, `pop_exposure`, `soil_profile`, `ksat`.

Supplemental indicators (0 default weight, sliders enabled, all 48 states as of 2026-06-23): `substation`, `superfund`, `rcra`, `air_quality`, `fiber`, `water_stress`, `grid_capacity`.

Composite score = weighted sum of selected indicator scores. Weights are set by the steward template in effect for the zone, or by the user's manual slider configuration. Hard-gated cells (`protected_score = 0` or `flood_score = 0`) receive composite = 0 regardless of weight configuration.
