# Merascope Pipeline — Instructions

This guide covers running the `scripts/` pipeline to produce a siting suitability grid
for any US state. The pipeline downloads all data from public APIs, scores a 0.15-degree
fishnet grid on 23 indicators (16 core + 7 supplemental), and writes
`data/{STATE}/grid_scores.geojson` as the output artifact. Raw physical-value columns are
included in every output to support national and sub-state renormalization without re-running
the pipeline.

---

## Prerequisites

### 1. Python environment

The active environment is `merascope` (Python 3.7, geopandas 0.10.x). Use its
absolute Python path directly — **do not use `conda run`** (buffering bug causes output to
appear only after the script exits, making long steps silent):

```bash
# Good
/home/simonhans/anaconda3/envs/merascope/bin/python3 -u scripts/02_indicators.py WA

# Bad — output buffered until exit
conda run -n merascope python scripts/02_indicators.py WA
```

Set a shell variable for convenience:

```bash
PYTHON=/home/simonhans/anaconda3/envs/merascope/bin/python3
```

To create the environment on a new machine, use `setup_env.sh` rather than `conda env create` directly:

```bash
bash setup_env.sh
```

`conda env create -f environment.yml` fails on conda <= 4.8.x due to a bug in the conflict resolver (`TypeError: sequence item 0: expected str instance, Channel found` in `match_spec.py`). This was fixed in conda 4.9.0. The setup script works around this by cloning an existing working environment when available. If no clone source exists and you are on conda <= 4.8.x, upgrade first: `conda update -n base conda`.

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

Runs the 10 core steps in sequence. Stops on the first non-zero exit code. First run for a
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

### Supplemental steps (scripts 11-16)

The supplemental indicators run after the 10 core steps. They are idempotent (skip columns
that already exist) and can run in any order. On the Hetzner VPS, use system Python:

```bash
VPS_PYTHON=/usr/bin/python3
for SCRIPT in 11_substations 12_superfund 13_air_quality 14_fiber 15_water_stress 16_iso_queue; do
  $VPS_PYTHON -u scripts/${SCRIPT}.py WA
done
```

Shared data downloads (PeeringDB, WRI Aqueduct, EPA Green Book, EIA 860M) land in
`data/shared/` on first run and are reused for all states.

**Memory note for `15_water_stress.py`:** The WRI Aqueduct ZIP is 614 MB. The script
streams it to disk, never to RAM. Do not revert to in-memory download — it OOMs on any
host with under 2 GB free.

| Script | Adds | Shared cache |
|---|---|---|
| `11_substations.py` | `substation_dist_m`, `substation_score` | `data/shared/substations.csv` |
| `12_superfund.py` | `superfund_dist_m`, `superfund_score`, `rcra_dist_m`, `rcra_score` | per-state raw/ |
| `13_air_quality.py` | `naaqs_nonattainment`, `air_quality_score` | `data/shared/naaqs_nonattainment.geojson` |
| `14_fiber.py` | `fac_dist_m`, `fiber_score` | `data/shared/peeringdb_fac.csv` |
| `15_water_stress.py` | `water_stress_raw`, `water_stress_score` | `data/shared/aqueduct_watersheds.gpkg` |
| `16_iso_queue.py` | `iso_queue_mw`, `grid_capacity_score` | `data/shared/eia860m_state_capacity.csv` |

### National normalization

After all 48 states are processed, run the cross-state normalization pass to add `*_nat`
columns for national comparisons:

```bash
$PYTHON -u scripts/normalize_national.py
```

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
        soil_cell_mukeys.csv      — per-cell mukey cache (point-in-polygon lookup; keyed by lon,lat; shared by 09 and 10; replaces soil_coords.csv as of 2026-07-20)
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
    grid_scores.geojson           — Final scored grid (core + supplemental columns)
data/shared/                      — Shared downloads reused across all states
    substations.csv               — EIA Form 860 plant locations (substation proxies)
    naaqs_nonattainment.geojson   — EPA Green Book non-attainment areas (national)
    peeringdb_fac.csv             — PeeringDB carrier hotel/colo facilities
    aqueduct_watersheds.gpkg      — WRI Aqueduct CONUS watershed clip (~27 MB)
    eia860m_state_capacity.csv    — EIA 860M state-level queue capacity ratios
    transmission_national.geojson — 345kV+ lines for map overlay (built by build_transmission_national.py)
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

**Supplemental score columns (scripts 11-16, all 48 states as of 2026-06-23):**

| Column | Description |
|---|---|
| substation_dist_m | Distance to nearest EIA Form 860 power plant (m) |
| substation_score | Proximity + capacity composite (1 = nearest high-capacity node) |
| superfund_dist_m | Distance to nearest EPA NPL Superfund site (m) |
| superfund_score | Inverted distance (1 = farthest from NPL site) |
| rcra_dist_m | Distance to nearest RCRA corrective action site (m) |
| rcra_score | Inverted distance (1 = farthest from RCRA site) |
| naaqs_nonattainment | 1 = non-attainment county, 0 = attainment |
| air_quality_score | 1 = attainment, 0 = non-attainment (inverted binary) |
| fac_dist_m | Distance to nearest PeeringDB carrier hotel/colo facility (m) |
| fiber_score | Inverted proximity to fiber exchange point (1 = nearest) |
| water_stress_raw | WRI Aqueduct baseline water stress (0 = low, 5 = high) |
| water_stress_score | Inverted stress (1 = low stress = better for long-term use) |
| iso_queue_mw | State total planned/proposed MW in EIA 860M (state-level, same per cell) |
| grid_capacity_score | Inverse queue pressure (1 = least interconnection congestion) |

National `*_nat` variants of all supplemental scores are added by `normalize_national.py`.

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
= tight drainage = low infiltration risk). **Fixed 2026-07-20:** exact per-cell mukey
via SDA's point-in-polygon spatial function `SDA_Get_Mukey_from_intersection_with_WktWgs84`
— one call per grid-cell centroid, cached/resumable in `raw/soil_cell_mukeys.csv`.
Previously IDW'd from one representative mupolygon coordinate per mukey, which blended
scores across real hydrologic-group boundaries. `SDA_WORKERS = 8` concurrent lookups;
~0.5s/call means a full 48-state run takes ~30-45 min. Do not batch multiple points into
one MULTIPOINT call — verified live that it silently reorders results with no way to
match a mukey back to the point that produced it.

SDM maintenance window: **12:30-12:45 AM CST (6:30-6:45 AM UTC)**. If steps 09 or 10
fail with empty JSON, wait 15 minutes and retry. The per-cell cache must not record a
failed lookup as resolved — it needs to look like "not yet attempted" so it retries on
the next run, or every cell touched during the outage gets permanently stuck at the
neutral 0.5 fallback (this happened to 802 WA cells on 2026-07-20; fixed in the cache
loader, see CONTEXT.md).

### Step 10 — Soil profile

Queries SSURGO `chorizon` table for all horizons with top depth < 150 cm per map unit.
Requires `raw/soil_cell_mukeys.csv` from step 09 (per-cell mukey lookup, not the old
`soil_coords.csv`) — a plain dict lookup, no IDW, no additional network calls. Computes
three indicators:

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

Then reload the dev server (`python3 server.py`) and confirm the state appears on the
national map. Use `server.py` (Flask), not `python3 -m http.server` — the Flask server
provides the `/api/log` and other API routes the frontend depends on.

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
and retry. The batch-fetch cache files (soil_mukeys.csv, soil_profile_horizons.csv) are
written only on success, so re-running the step is safe. `soil_cell_mukeys.csv` (the
per-cell point-in-polygon cache, as of 2026-07-20) is also safe to resume from — as long
as `09_soil.py` is at or after the 2026-07-20 fix, which treats a failed lookup as
unresolved rather than caching it as permanently done. An older copy of the script would
silently poison every cell touched during the outage window; if in doubt, `git pull`
before rerunning a state that hit this.

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
