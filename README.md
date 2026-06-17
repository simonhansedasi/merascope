# Merascope

National data center site suitability intelligence and permitting coordination platform.
GIS-MCDA across 0.15-degree fishnet cells, 16 scored indicators, raw physical values
included in every output for multi-scale renormalization.

Built for three audiences:
- **Builders** (developers evaluating sites) — Explorer map, workspace, portfolio screening
- **Stewards** (lead regulatory agencies) — docket, case file, conditions negotiation, co-party coordination, evidentiary record export
- **Co-parties** (invited agencies: tribes, counties, utilities, AG) — filtered docket, propose conditions, transparency into lead's review

Same Score Promise: methodology is public and identical for all users. No party receives a different number.

## Quick start

```bash
# Activate the pipeline environment (Python 3.7, geopandas 0.10.x)
conda activate merascope

# Run a single state end-to-end
python -u scripts/run_pipeline.py WA

# Or run steps individually
python -u scripts/01_basemap.py WA
python -u scripts/02_indicators.py WA
# ... through 10_soilprofile.py
```

See [PIPELINE_GUIDE.md](PIPELINE_GUIDE.md) for full setup, step descriptions, and troubleshooting.

## Indicators

| # | Score | Source | Step |
|---|---|---|---|
| 1 | tx_score | OSM HV transmission lines (>=100kV) + EIA Form 860 plants | 02 |
| 2 | water_score | PRISM 4km 30-yr annual precip normals (1991-2020) | 02 |
| 3 | ej_score | Census ACS poverty + minority rate (EJScreen method) | 02 |
| 4 | pop_exposure_score | Census ACS population density (1 = sparsest) | 02 |
| 5 | seismic_score | USGS ASCE 7-22 PGA (1 = lowest hazard) | 03 |
| 6 | flood_score | FEMA NFHL SFHA zones (binary: 1 = outside flood zone) | 03 |
| 7 | contamination_score | EPA TRI facility proximity (1 = farthest) | 04 |
| 8 | waterway_score | OSM major rivers proximity (1 = farthest) | 04 |
| 9 | geothermal_score | IHFC GHFDB 2024 heat flow (1 = highest) | 05 |
| 10 | flatness_score | SRTM1 flat fraction **[hard gate: <3% flat = 0]** | 06 |
| 11 | slope_score | SRTM1 flat fraction continuous (no gate) | 06 |
| 12 | protected_score | Esri Federal Lands + TIGER tribal **[hard gate: >25% = 0]** | 07 |
| 13 | aquifer_score | USGS NWIS depth-to-water-table (1 = deepest) | 08 |
| 14 | soil_score | SSURGO hydrologic group A-D (1 = tightest/lowest infiltration) | 09 |
| 15 | soil_profile_score | SSURGO horizon composite: CaCO3 + ksat + clay | 10 |
| 16 | ksat_score | SSURGO saturated hydraulic conductivity (1 = least permeable) | 10 |

Hard gates: only two remain.
- **protected_score**: protected_frac > 0.25 sets score to 0; cell grayed on map
- **flood_score**: flood_score = 0 blocks portfolio PASS

Terrain (flatness_score, slope_score) is a scoring penalty, not a hard gate.
All scores normalized 0-1 within state (1 = most favorable for siting).

### Raw columns

Every output GeoJSON also carries raw physical-value columns for multi-scale
renormalization without re-running the pipeline:

| Column | Units | Added by |
|---|---|---|
| tx_dist_m | m to nearest HV line | step 02 |
| ann_precip_mm | mm/yr (PRISM 30-yr normal) | step 02 |
| pop_density | persons/km2 | step 02 |
| seismic_pga_g | PGA (g) | step 03 |
| tri_dist_m | m to nearest TRI facility | step 04 |
| river_dist_m | m to nearest major river | step 04 |
| heatflow_mwm2 | mW/m2 | step 05 |
| flat_frac | fraction of cell pixels with slope < 5 deg | step 06 |
| slope_mean_deg | mean slope in degrees | step 06 |
| protected_frac | fraction of cell covered by protected land | step 07 |
| aquifer_depth_ft | ft to water table (IDW from USGS wells) | step 08 |
| ksat_mean_ums | µm/s saturated hydraulic conductivity | step 10 |

## States completed

All 48 contiguous states complete (AK/HI excluded).

| Schema | States | Raws |
|---|---|---|
| 10-raw (early) | WA OR TX CA NV UT ID MT AZ | no flat_frac/slope_mean_deg |
| 12-raw (full) | CO WY NM ND SD NE KS OK MN IA MO AR LA MI WI IL IN KY TN MS GA OH AL FL SC NC VA WV PA NY NJ CT RI MA VT NH ME DE MD | full set |

Raw columns are now added automatically by `run_pipeline.py` at the end of every full run (`patch_raws.py` is called as a post-processing step). For early states already in the dataset, run once manually: `python scripts/patch_raws.py WA OR TX CA NV UT ID MT AZ`

## Product surfaces

### Builder surface (`#/builder`)
Workspace tab (saved cells, comparison panel), Status tab (CRM tracker per site: contacts/events/notes/pipeline), Portfolio screening (CSV upload of lat/lons, scored results with gate check). Builder can look up their case ID under "My Application" to see read-only case file with full transparency into conditions being negotiated.

### Steward surface (`#/steward`)
Kanban docket across all stages. Case file: versioned findings, conditions negotiation (propose/accept/reject), co-party coordination, rebuttal clock, document chain, CSV exports. Impasse register (route to mediation). Mandated studies workbench (section checklists, live progress).

### Co-party surface (`#/co-party`)
Filtered docket — only shows cases where the agency is invited. Same case file as steward, propose-only permissions. Co-party conditions show as "Pending lead approval" until lead approves.

### Agency directory
95 pre-registered WA state agencies (39 counties, 31 tribes, 12 utilities, 8 state agencies, 5 federal) in `AGENCY_DIRECTORY` (`data.js`). Lead agency invites from searchable directory modal with type filters. Email fallback for unregistered agencies.

### Multi-party permission model
| Action | Lead (steward) | Co-party | Builder |
|---|---|---|---|
| See findings + conditions | yes | yes | yes |
| Propose condition | yes | yes (pending lead approval) | no |
| Approve/reject condition | yes | no | no |
| Invite co-parties | yes | no | no |
| Change stage | yes | no | no |
| Export CSV | yes | yes | no |
| File rebuttal | no | no | yes (Rebuttal Cycle stage only) |

## Multi-scale architecture

Three normalization windows are planned:

1. **National** — one-time post-processing pass after all states complete; re-ranks every
   cell using raw values against the national distribution.
2. **State** — current output (0-1, within-state). Default view.
3. **County / ZCTA / parcel** — dynamic re-ranking in the frontend using raw values; no
   new pipeline work needed. Raw columns in every GeoJSON enable arbitrary re-normalization.

## Frontend

React + Leaflet, served statically. Add a completed state to `merascope/map.jsx`:

```js
const GRID_URLS = [
  // existing states ...
  'data/WY/grid_scores.geojson',  // add new state here
];
```

Dev server: `cd ~/coding/merascope && python3 server.py` (Flask, port 8877 — NOT python3 -m http.server; Flask provides /api/log and /api/export/* routes)

## Repo structure

```
merascope/
  index.html              — React frontend entry point (Tom)
  merascope/              — JSX, CSS, JS components
  scripts/                — 10-step pipeline + patch scripts
    config.py             — State bboxes, FIPS, UTM zones for all 50 states
    run_pipeline.py       — Orchestrator (calls steps 01-10 in sequence)
    01_basemap.py         — State boundary, data centers, transmission, EIA plants
    02_indicators.py      — Fishnet grid + tx, water, ej, pop_exposure scores
    03_risk.py            — seismic, flood scores
    04_environment.py     — contamination, waterway scores
    05_geothermal.py      — geothermal score (IHFC heat flow)
    06_terrain.py         — flatness, slope scores (SRTM1, tiled processing)
    07_protected.py       — protected score (federal + tribal hard gate)
    08_aquifer.py         — aquifer score (USGS NWIS depth to water)
    09_soil.py            — soil score (SSURGO hydrologic group)
    10_soilprofile.py     — soil_profile, ksat scores (SSURGO horizons)
    patch_water_score.py  — retrofit PRISM water_score in-place
    patch_raws.py         — retrofit raw physical columns on completed states
  data/                   — generated GeoJSON + CSVs (not in git; rsync separately)
  METHODS.md              — full indicator methodology with citations
  PIPELINE_GUIDE.md       — running and troubleshooting the pipeline
```

## Data sources

All publicly available.

| Source | Used for |
|---|---|
| Census TIGER 2022 | State boundaries, census tracts |
| OSM Overpass API | Data centers, HV transmission lines, major rivers |
| EIA Form 860 (2023) | Power plant locations |
| Census ACS 5-yr 2022 | Demographic burden (poverty + minority rate), population |
| PRISM Climate Group 4km 30-yr normals | Annual precipitation |
| USGS ASCE 7-22 API | Seismic hazard (PGA) |
| FEMA NFHL REST API | Special Flood Hazard Areas |
| EPA Envirofacts REST API (TRI_FACILITY) | Industrial facility proximity |
| IHFC GHFDB 2024 | Geothermal heat flow boreholes |
| NASA SRTM1 (AWS S3) | 30m digital elevation model |
| Esri USA Federal Lands | NPS, USFWS, DoD, Forest Service boundaries |
| Census TIGER AIANNH | Tribal land boundaries |
| USGS NWIS (post-2025 OGC API) | Depth to water table |
| USDA NRCS SSURGO (SDM REST API) | Soil drainage class, horizon properties |
