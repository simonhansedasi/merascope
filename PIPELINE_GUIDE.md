# Merascope Pipeline — Instructions

This guide covers running the `scripts/` pipeline to produce a siting suitability grid
for any US state. The pipeline downloads all data from public APIs, scores a 0.15-degree
fishnet grid on 16 indicators (plus raw physical values), and writes
`data/{STATE}/grid_scores.geojson` as the output artifact.

---

## Prerequisites

### 1. Python environment

The active environment is `GrapeExpectations` (Python 3.7, geopandas 0.10.x). Use its
absolute Python path directly — **do not use `conda run`** (buffering bug causes output to
appear only after the script exits, making long steps silent):

```bash
# Good
/home/simonhans/anaconda3/envs/GrapeExpectations/bin/python3 -u scripts/02_indicators.py WA

# Bad — output buffered until exit
conda run -n GrapeExpectations python scripts/02_indicators.py WA
```

Set a shell variable for convenience:

```bash
PYTHON=/home/simonhans/anaconda3/envs/GrapeExpectations/bin/python3
```

Note: `environment.yml` in the repo is a stale copy from the predecessor project
(`datacenter_siting`). Do not try to recreate the env from it.

### 2. Census API key (required for step 02)

The EJ burden and population scores pull Census ACS data. Get a free key at
[census.gov/developers](https://api.census.gov/data/key_signup.html) and add it:

```bash
# Add to ~/.env
echo "CENSUS_API_KEY=your_key_here" >> ~/.env

# Or set inline
CENSUS_API_KEY=your_key_here $PYTHON -u scripts/02_indicators.py WA
```

### 3. IHFC heat flow shapefile (required for step 05)

The geothermal score uses the IHFC Global Heat Flow Database 2024. The global shapefile
must be placed at:

```
data/raw/IHFC_2024_GHFDB.shp   (+ .dbf, .prj, .shx, .cpg, .qmd)
```

The `.dbf` companion file is ~1.4 GB and is not committed to the repo. If the shapefile
is missing, step 05 still runs but sets `geothermal_score = 0.5` for all cells with a
warning.

### 4. PRISM precipitation file (required for step 02)

The water score uses a shared PRISM GeoTIFF at `data/prism_ppt_30yr.tif` (2.8 MB,
national 4km grid). Step 02 downloads it automatically on first run. Do not delete it
— it is shared across all states and re-downloading is slow.

---

## Running the pipeline

All commands run from the project root (`~/coding/merascope/`). Set `PYTHON` first.

### Full run via orchestrator

```bash
$PYTHON -u scripts/run_pipeline.py WA
```

Runs all 10 steps in sequence. Stops on the first non-zero exit code. First run for a
new state takes 60-180 minutes depending on state size and API response times.

**Resume from a step:**

```bash
$PYTHON -u scripts/run_pipeline.py WA --start 04
```

**Run only specific steps:**

```bash
$PYTHON -u scripts/run_pipeline.py WA --only 06 07
```

### Running steps individually

All step scripts are standalone and accept the state abbreviation as the only argument:

```bash
$PYTHON -u scripts/01_basemap.py WA
$PYTHON -u scripts/02_indicators.py WA
$PYTHON -u scripts/03_risk.py WA
$PYTHON -u scripts/04_environment.py WA
$PYTHON -u scripts/05_geothermal.py WA
$PYTHON -u scripts/06_terrain.py WA
$PYTHON -u scripts/07_protected.py WA
$PYTHON -u scripts/08_aquifer.py WA
$PYTHON -u scripts/09_soil.py WA
$PYTHON -u scripts/10_soilprofile.py WA
```

### Delete SRTM tiles after step 06

Step 06 downloads SRTM1 elevation tiles (~52 MB each) to `data/{STATE}/raw/srtm_tiles/`.
Delete them after the step completes to free disk:

```bash
rm -rf data/WA/raw/srtm_tiles/
```

Typical sizes: WA ~45 tiles (~2.3 GB), NV ~30 tiles (~1.6 GB), MT ~78 tiles (~4 GB).
TX is the worst at ~168 tiles (~8.7 GB). The tiles are re-downloaded from AWS if you
ever need to re-run step 06.

---

## Output structure

```
data/{STATE}/
    raw/
        state.geojson             — Census TIGER state boundary
        datacenters.geojson       — OSM data centers
        transmission.geojson      — OSM HV transmission lines (>=100kV)
        eia860_plants.geojson     — EIA Form 860 power plants
        acs_demog.csv             — Census ACS demographics
        tracts.geojson            — Census TIGER tract boundaries
        seismic_sample.csv        — USGS ASCE 7-22 sample points
        sfha.geojson              — FEMA NFHL flood zones
        tri_facilities.csv        — EPA TRI facility locations
        rivers.geojson            — OSM major rivers
        heatflow.csv              — IHFC boreholes filtered to bbox
        srtm_tiles/               — SRTM1 HGT elevation tiles (delete after step 06)
        federal_lands.geojson     — Esri Federal Lands
        tribal_tiger.geojson      — TIGER AIANNH tribal areas
        well_depths.csv           — USGS NWIS depth-to-water cache
        soil_mukeys.csv           — SSURGO mukey-hydgrpdcd cache
        soil_coords.csv           — SSURGO representative polygon coords
        soil_profile_horizons.csv — SSURGO chorizon 0-150cm cache
    processed/
        basemap.png
        indicators.png
        risk_modifiers.png
        environmental_risk.png
        geothermal.png
        terrain_flatness.png
        protected_land.png
        aquifer.png
        soil.png
        soil_profile.png
    grid_scores.geojson           — Final scored grid
```

All raw files are treated as permanent cache. To force a re-download of any layer, delete
the corresponding file and re-run from that step.

### grid_scores.geojson columns

**Score columns (all 0-1, state-normalized):**

| Column | Description |
|---|---|
| cell_id | Integer grid cell index |
| tx_score | Proximity to HV transmission (1 = adjacent) |
| water_score | Annual precipitation (1 = highest / least stressed) |
| ej_score | 1 - demographic burden index (1 = least burdened) |
| pop_exposure_score | 1 - population density (1 = sparsest) |
| seismic_score | 1 - PGA (1 = lowest seismic hazard) |
| flood_score | 1.0 outside SFHA, 0.0 inside flood zone |
| contamination_score | Distance to nearest TRI facility (1 = farthest) |
| waterway_score | Distance to nearest major river (1 = farthest) |
| geothermal_score | Heat flow (1 = highest geothermal potential) |
| flatness_score | Terrain flatness — **hard gate: 0.0 if <3% flat area** |
| slope_score | Terrain flatness continuous (same as flatness_score but no gate) |
| protected_score | **Hard gate: 0.0 if >25% protected land**, else 1.0 |
| aquifer_score | Depth to water table (1 = deepest) |
| soil_score | Hydrologic group drainage (1 = tightest/Group D) |
| soil_profile_score | Composite: CaCO3 + ksat + clay across full soil column |
| ksat_score | Saturated hydraulic conductivity (1 = least permeable) |

**Raw physical-value columns (for multi-scale renormalization):**

| Column | Units |
|---|---|
| tx_dist_m | m to nearest HV line |
| ann_precip_mm | mm/yr (PRISM 30-yr normal) |
| pop_density | persons/km2 |
| seismic_pga_g | PGA (g) |
| tri_dist_m | m to nearest TRI facility |
| river_dist_m | m to nearest major river |
| heatflow_mwm2 | mW/m2 |
| flat_frac | fraction of cell pixels with slope < 5 deg (CO onward) |
| slope_mean_deg | mean slope in degrees (CO onward) |
| protected_frac | fraction of cell covered by protected land |
| aquifer_depth_ft | ft to water table |
| ksat_mean_ums | µm/s saturated hydraulic conductivity |

Do not drop raw columns. They enable national and sub-state renormalization without
re-running the pipeline. To retrofit them on an already-completed state:

```bash
$PYTHON -u scripts/patch_raws.py WA OR TX CA NV UT ID MT AZ
```

---

## Step-by-step details

### Step 01 — Basemap

Downloads: Census TIGER state boundary, OSM data centers, OSM HV transmission lines,
EIA Form 860 power plants.

- OSM Overpass queries can take 60-90 seconds for large states (TX, CA). No credentials.
- EIA 860 downloads the national archive (~30 MB zip), extracts plant + generator sheets,
  and filters to the target state. Cached after first run.

### Step 02 — Indicators

Builds the 0.15-degree fishnet grid and computes four scores.

- **tx_score**: inverse distance from each cell centroid to the nearest HV transmission
  line (from transmission.geojson) or EIA plant. IDW, normalized within state.
- **water_score**: nearest-pixel sample from `data/prism_ppt_30yr.tif` at each centroid.
  PRISM 4km 30-yr annual precip normals. Normalized within state using 5th-95th percentile.
  (Previously used Open-Meteo ERA5 IDW — switched to PRISM after IDW artifacts produced
  a spurious water_score=1.0 in sparse-coverage areas of Nevada.)
- **ej_score**: 1 - EJScreen demographic index (mean of poverty rate + minority share
  per Census tract). Requires a Census API key.
- **pop_exposure_score**: 1 - population density per cell (persons/km², capped at 95th
  percentile). High score = low residential density.

### Step 03 — Risk

- **seismic_score**: IDW from ~50 USGS ASCE 7-22 sample points (PGA at 2% in 50yr,
  site class C). Each API call takes 1-3 seconds; ~5 min total. Cached in
  `raw/seismic_sample.csv`.
- **flood_score**: binary gate from FEMA NFHL. State bbox divided into 40 tiles; each
  tile queries the REST API for SFHA polygons. Empty tiles (no flood zones) are normal.
  Cached in `raw/sfha.geojson`. Read via `json.load + from_features` (not fiona, which
  crashes on large files).

### Step 04 — Environment

- **contamination_score**: EPA TRI facility locations from Envirofacts `TRI_FACILITY`
  endpoint. Note: TRI longitude is stored positive in the API — the script negates it.
  If the API returns no results, defaults to 1.0 with a warning.
- **waterway_score**: OSM major rivers (`waterway=river`) via Overpass API. River lines
  segmented at 1 km before IDW. Defaults to 1.0 if OSM returns empty.

### Step 05 — Geothermal

Filters the global IHFC 2024 shapefile to the state bbox, caps at the 95th percentile
(suppresses hydrothermal outliers), then IDW-interpolates to centroids. State-filtered
CSV cached in `raw/heatflow.csv`. If shapefile is missing, score = 0.5 (neutral).

### Step 06 — Terrain

Downloads SRTM1 HGT tiles from AWS S3 and processes them **one tile at a time** (tiled
approach to avoid OOM — do not assemble a full-state DEM mosaic). Slope computed via
`numpy.gradient` with latitude-corrected dx. Two outputs:

- **flatness_score**: 0.0 if flat_frac < 3% (hard gate), else normalized flat_frac.
- **slope_score**: same normalization, no hard gate (for use as weighted slider).

Also writes raw columns `flat_frac` and `slope_mean_deg`. Delete `raw/srtm_tiles/`
after this step.

### Step 07 — Protected land

Fetches protected area boundaries from two sources and computes cell overlap fraction:

- **Esri Federal Lands**: NPS, USFWS, DoD, Forest Service. BLM excluded (leasable).
  Paginated in batches of 1000. Large-federal-land states (AZ, CO, UT, MT) may take 5-10
  minutes. Cached in `raw/federal_lands.geojson`.
- **TIGER AIANNH**: Census tribal areas for the state bbox.

Hard gate: cells with `protected_frac > 25%` receive `protected_score = 0`.

### Step 08 — Aquifer

Fetches discrete depth-to-water measurements (parameter 72019, ft below land surface)
from the USGS Water Data API post-2025 OGC endpoint
(`api.waterdata.usgs.gov/ogcapi/v0/collections/field-measurements/items`).
Computes median depth per monitoring site, then IDW to cell centroids. Normalized
to 95th percentile cap (1 = deepest water table = lowest contamination risk).

Note: the old waterservices.usgs.gov endpoint was decommissioned fall 2025. The
post-2025 API returns 400 errors above ~45k row offset — handled with a graceful break.

### Step 09 — Soil drainage

Queries SSURGO via the Soil Data Access REST API to get hydrologic soil group
(`hydgrpdcd`) per map unit. Score mapping: A=0.00, B=0.33, C=0.67, D=1.00 (high score
= tight drainage = low infiltration risk). IDW from one representative mupolygon
coordinate per mukey to cell centroids.

SDM maintenance window: **12:30-12:45 AM CST (6:30-6:45 AM UTC)**. If steps 09 or 10
fail with empty JSON, wait 15 minutes and retry.

### Step 10 — Soil profile

Queries SSURGO `chorizon` table for all horizons with top depth < 150 cm per map unit.
Requires `raw/soil_coords.csv` from step 09. Computes three indicators:

| Indicator | Column | Direction |
|---|---|---|
| Lime (CaCO3) | `caco3_r` (%) — MAX across horizons | High lime = high risk = low score |
| Hydraulic conductivity | `ksat_r` (µm/s) — thickness-weighted mean | High Ksat = fast permeability = low score |
| Clay (aquitard) | `claytotal_r` (%) — thickness-weighted mean | High clay = barrier = high score |

`soil_profile_score` = 0.40 × CaCO3 score + 0.35 × Ksat score + 0.25 × clay score.
`ksat_score` also written as a standalone column.

---

## Patching existing states

### Update water_score (PRISM)

If an older state was run with the Open-Meteo IDW approach, patch in-place without
re-running all steps:

```bash
$PYTHON -u scripts/patch_water_score.py WA OR TX CA NV UT
```

### Retrofit raw columns

Earlier states (WA through AZ) have 10 raw columns (missing `flat_frac` and
`slope_mean_deg` — SRTM tiles were deleted). To add them, you need to re-run step 06
for those states (re-downloads tiles). For everything else:

```bash
$PYTHON -u scripts/patch_raws.py WA OR TX
```

---

## Adding a completed state to the frontend

After `data/{STATE}/grid_scores.geojson` is generated, add the state to the Leaflet
choropleth map by editing `merascope/map.jsx`:

```js
const GRID_URLS = [
  'data/WA/grid_scores.geojson',
  // ... existing states ...
  'data/WY/grid_scores.geojson',  // add new state
];
```

Then reload the dev server (`python3 -m http.server 8877`) and confirm the state
appears on the national map.

---

## Troubleshooting

### Census API key not found

```
RuntimeError: Census API key not found.
```

```bash
CENSUS_API_KEY=abc123 $PYTHON -u scripts/02_indicators.py WA
```

---

### OSM Overpass timeout (steps 01, 04)

```
requests.exceptions.ReadTimeout
```

Delete the partially written file and retry:

```bash
rm data/WA/raw/transmission.geojson   # or rivers.geojson
$PYTHON -u scripts/01_basemap.py WA
```

---

### FEMA API returns empty (step 03)

Some tiles have no SFHA polygons — normal. If the entire state returns empty (rare),
`flood_score` defaults to 1.0 with a WARNING. The NFHL service may be temporarily down;
delete `raw/sfha.geojson` and retry later.

---

### SRTM tile 404 (step 06)

```
HTTPError: 404 Client Error
```

Ocean tiles and edge tiles sometimes don't exist. The script fills missing tiles with
NaN; those pixels are excluded from flatness calculation. This is expected for coastal
states.

---

### SRTM OOM (step 06)

The tiled approach avoids full-DEM mosaic assembly. If a single tile or the per-cell
stack still OOMs, increase the downsample factor in `06_terrain.py`:

```python
DOWNSAMPLE = 6   # 30m -> ~180m; reduces per-tile RAM ~4x
```

---

### SDM API empty JSON (steps 09, 10)

```
WARNING: empty or non-JSON response from SDM
```

The Soil Data Access service runs maintenance at **12:30-12:45 AM CST**. Wait 15 minutes
and retry. The raw cache files (soil_mukeys.csv, soil_coords.csv,
soil_profile_horizons.csv) are written only on success, so re-running the step is safe.

---

### NWIS aquifer API 400 error (step 08)

The post-2025 OGC API returns HTTP 400 when paging beyond ~45,000 rows (known limit).
The script handles this with a graceful break — results collected to that point are used.
This is normal for large states with many monitoring sites.

---

### Esri protected lands slow or stalled (step 07)

The ArcGIS paginated query fetches in batches of 1000. States with dense federal land
coverage (MT, WY, AZ, CO, NM) may take 5-10 minutes. Progress is printed every 1000
features. Result is cached in `raw/federal_lands.geojson`; the step is idempotent if
re-run.

---

### Step fails mid-run

Scripts do not write `grid_scores.geojson` until the final line of each step. A crash
before that leaves the GeoJSON reflecting the previous step's state. Re-running
`--start NN` from the failed step is safe. If a raw download file was partially written,
delete it:

```bash
rm data/WA/raw/srtm_tiles/N48W122.hgt
$PYTHON -u scripts/06_terrain.py WA
```

---

### Re-downloading a cached layer

All raw files are permanent cache. To force a fresh download:

```bash
# Force fresh transmission fetch
rm data/OR/raw/transmission.geojson
$PYTHON -u scripts/01_basemap.py OR

# Force fresh seismic sample
rm data/OR/raw/seismic_sample.csv
$PYTHON -u scripts/03_risk.py OR
```

---

## Running multiple states in parallel

Each state writes to its own `data/{STATE}/` directory and does not interfere with other
runs. The shared PRISM TIF and IHFC shapefile are read-only. You can run states in
separate terminals:

```bash
# Terminal 1
$PYTHON -u scripts/run_pipeline.py OR

# Terminal 2
$PYTHON -u scripts/run_pipeline.py ID
```

Be cautious about concurrent SRTM downloads — each state downloads its own tiles but
both streams hit the same AWS S3 endpoint. For large states (TX, CA, MT), run them
sequentially.

---

## Deploying data to the production server

After running the pipeline for a state, rsync the data directory to the server. The `--exclude` flag prevents re-uploading multi-GB SRTM tiles if any were not already deleted.

```bash
rsync -avz --exclude='srtm_tiles/' \
  data/{STATE}/ \
  user@<SERVER>:/path/to/merascope/data/{STATE}/
```

Then add the new state's GeoJSON to `merascope/map.jsx` `GRID_URLS` and redeploy the frontend.

For a full batch sync of all states at once:

```bash
rsync -avz --exclude='srtm_tiles/' \
  data/ \
  user@<SERVER>:/path/to/merascope/data/
```
