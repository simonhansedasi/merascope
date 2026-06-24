# Merascope

National data center site suitability intelligence and permitting coordination platform.
GIS-MCDA across 0.15-degree fishnet cells, 23 scored indicators (16 core + 7 supplemental),
raw physical values included in every output for multi-scale renormalization.

Built for three audiences:
- **Builders** (developers evaluating sites) — Explorer map, workspace, portfolio screening
- **Stewards** (lead regulatory agencies) — docket, case file, conditions negotiation, co-party coordination, evidentiary record export
- **Co-parties** (invited agencies: tribes, counties, utilities, AG) — filtered docket, propose conditions, transparency into lead's review

Same Score Promise: methodology is public and identical for all users. No party receives a different number.

## Quick start

```bash
# Activate the pipeline environment (Python 3.7, geopandas 0.10.x)
conda activate merascope
PYTHON=/home/simonhans/anaconda3/envs/merascope/bin/python3

# Run a single state end-to-end (core steps 01-10)
$PYTHON -u scripts/run_pipeline.py WA

# After steps 01-10, run supplemental indicators (VPS has system Python with geopandas)
for SCRIPT in 11_substations 12_superfund 13_air_quality 14_fiber 15_water_stress 16_iso_queue; do
  /usr/bin/python3 -u scripts/${SCRIPT}.py WA
done

# National normalization pass (run once after all 48 states are complete)
$PYTHON -u scripts/normalize_national.py
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

### Supplemental indicators (scripts 11-16, default weight 0)

All 7 supplemental indicators are present in every state's `grid_scores.geojson` as of 2026-06-23. Weights default to 0 in the Explorer; sliders must be turned up to include them in the composite score.

| Script | Score column | Source | Notes |
|---|---|---|---|
| 11 | substation_score | EIA Form 860 power plant locations (capacity proxy for voltage) | KDTree proximity + capacity weighting |
| 12 | superfund_score | EPA Envirofacts NPL Superfund sites | Distance, 1 = farthest |
| 12 | rcra_score | EPA Envirofacts RCRA corrective action sites | Distance, 1 = farthest |
| 13 | air_quality_score | EPA Green Book NAAQS non-attainment areas | 1 = attainment, 0 = non-attainment |
| 14 | fiber_score | PeeringDB carrier hotel/colo facility locations | KDTree proximity |
| 15 | water_stress_score | WRI Aqueduct 3.0 baseline water stress (bws_score 0-5) | Inverted: 1 = low stress |
| 16 | grid_capacity_score | EIA Form 860M planned vs. operating MW ratio per state | 1 = least interconnection queue pressure |

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

All 48 contiguous states complete as of 2026-06-23 with 7 supplemental indicators.

| Raw column coverage | States |
|---|---|
| 10-raw (no flat_frac/slope_mean_deg) | WA OR TX CA NV UT ID MT AZ |
| 12-raw (full set) | CO WY NM ND SD NE KS OK MN IA MO AR LA MI WI IL IN KY TN MS GA OH AL FL SC NC VA WV PA NY NJ CT RI MA VT NH ME DE MD |

All 48 states carry the 7 supplemental score columns added by scripts 11-16. Raw columns are added automatically by `run_pipeline.py` at the end of every full run (`patch_raws.py` is called as a post-processing step). For early states already in the dataset, run once manually: `python scripts/patch_raws.py WA OR TX CA NV UT ID MT AZ`

## Product surfaces

### Builder surface (`#/builder`)
Workspace tab (saved cells, comparison panel), Status tab (CRM tracker per site: contacts/events/notes/pipeline), Portfolio screening (CSV upload of lat/lons, scored results with gate check), My Inquiry tab (submit a site inquiry + case lookup).

**Site inquiry flow:** Builder selects a saved site from a card grid → confirms site name and score → lead agency is auto-detected via Nominatim reverse geocode → fills contact details → submits. Merascope routes the inquiry to the relevant agency; the agency runs their own jurisdiction-specific permitting process from there. Merascope is the first contact point and routing layer, not the permitting system itself.

### Steward surface (`#/steward`)
Kanban docket across all stages. Case file: versioned findings, conditions negotiation (propose/accept/reject), co-party coordination, rebuttal clock, document chain, CSV exports. Impasse register (route to mediation). Mandated studies workbench (section checklists, live progress). **Weight templates** (`#/steward/templates`): define named weight profiles and attach them to geographic zones; lock a template to gate builders whose cells score below the minimum threshold.

### Co-party surface (`#/co-party`)
Filtered docket — only shows cases where the agency is invited. Same case file as steward, propose-only permissions. Co-party conditions show as "Pending lead approval" until lead approves.

### Agency directory
95 pre-registered WA state agencies (39 counties, 31 tribes, 12 utilities, 8 state agencies, 5 federal) in `AGENCY_DIRECTORY` (`data.js`). Lead agency invites from searchable directory modal with type filters. Email fallback for unregistered agencies.

### Multi-party permission model
| Action | Lead (steward) | Co-party | Builder |
|---|---|---|---|
| Submit site inquiry | no | no | yes |
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

## Server setup

`server.py` requires PostgreSQL. For a fresh VPS:

```bash
sudo bash setup_pg.sh          # installs Postgres, creates role+DB, applies schema.sql
```

Add to `/etc/merascope.env`:

```
DATABASE_URL=postgresql://merascope:PASS@localhost/merascope
S3_ENDPOINT=https://<region>.your-objectstorage.com
S3_ACCESS_KEY=<key>
S3_SECRET_KEY=<secret>
S3_BUCKET=merascope-docs
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.<sendgrid-api-key>
FROM_EMAIL=noreply@merascope.com
APP_URL=https://merascope.com
APP_ENV=production
```

Pre-seed the lead steward before the pilot:

```sql
INSERT INTO users (email) VALUES ('name@seattle.gov') ON CONFLICT DO NOTHING;
INSERT INTO user_roles (email, role, agency_key) VALUES ('name@seattle.gov', 'steward', 'OPCD');
```

The systemd service file must include `EnvironmentFile=/etc/merascope.env` under `[Service]`. Also add `listen 80 default_server` to the nginx block if you need IP-based access during testing.

In local dev, omit `S3_ENDPOINT` (falls back to disk) and omit SMTP vars (magic link printed to journal — `journalctl -u merascope | grep "Magic link"`). Use `APP_ENV=development` while testing over HTTP — the `Secure` cookie flag is tied to `APP_ENV`, not `APP_URL`, so `APP_ENV=production` with an HTTP connection will silently drop the auth cookie.

**S3 bucket name**: `merascopedocs` (no hyphen — that's what was created in Hetzner HEL1).

**SSL note**: Namecheap PositiveSSL + APISIX handle SSL termination at the edge. The Hetzner nginx must stay HTTP-only (port 80 proxy to gunicorn). Do NOT run certbot — it adds an HTTPS redirect that breaks the APISIX proxy chain.

**Go-live checklist**: Tom adds SendGrid CNAMEs (DKIM + domain auth) to Namecheap → verify sender domain in SendGrid dashboard → seed steward emails in `user_roles`.

## Testing and deploy

```bash
# Unit + pipeline tests (143 tests)
/home/simonhans/anaconda3/envs/merascope/bin/python3 -m pytest tests/ -v

# Browser smoke test (26 checks — starts its own server, headless Chromium)
/home/simonhans/anaconda3/envs/merascope/bin/python3 tests/smoke_test.py

# Deploy (runs lint + tests + build before rsync — aborts on failure)
bash scripts/deploy_hetzner.sh
```

`tests/test_server.py` — 64 tests covering all server API routes including steward templates/zones CRUD and gate check. Requires PostgreSQL (`TEST_DATABASE_URL`); skips cleanly if unavailable.
`tests/test_config.py`, `test_gates.py`, `test_indicators.py` — 79 pipeline tests (no DB needed).
`tests/smoke_test.py` — Playwright end-to-end: builder submit form, progressive reveal, steward docket, intake case view, case lookup.

## Frontend

React + Leaflet, pre-compiled via Babel CLI. All 16 JSX source files compile to `merascope/dist/bundle.js` — no Babel standalone CDN, no runtime compilation. React, ReactDOM, Leaflet, and fonts (IBM Plex Sans, Source Sans 3, Source Serif 4) are vendored locally in `vendor/`; no external calls on page load.

Build the bundle (runs automatically in `deploy_hetzner.sh`):

```bash
npm install   # first time only
npm run build
```

Add a completed state to `merascope/map.jsx`:

```js
const GRID_URLS = [
  // existing states ...
  'data/WY/grid_scores.geojson',  // add new state here
];
```

Dev server: `cd ~/coding/merascope && python3 server.py` (Flask, port 8877 — NOT python3 -m http.server; Flask provides /api routes)

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
    11_substations.py     — substation/grid-node proximity score (EIA Form 860)
    12_superfund.py       — Superfund NPL + RCRA corrective action distance scores
    13_air_quality.py     — NAAQS attainment score (EPA Green Book)
    14_fiber.py           — carrier-hotel/colo proximity score (PeeringDB)
    15_water_stress.py    — watershed water stress score (WRI Aqueduct 3.0)
    16_iso_queue.py       — grid interconnection queue capacity score (EIA 860M)
    normalize_national.py — cross-state *_nat normalization pass (run after all 48)
    grade_states.py       — relative letter grade computation + data.js patcher
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
| EPA Envirofacts REST API (SEMS NPL) | Superfund site proximity |
| EPA Envirofacts REST API (RCRAInfo) | RCRA corrective action site proximity |
| EPA Green Book GIS shapefiles | NAAQS non-attainment areas (air quality gate) |
| IHFC GHFDB 2024 | Geothermal heat flow boreholes |
| NASA SRTM1 (AWS S3) | 30m digital elevation model |
| Esri USA Federal Lands | NPS, USFWS, DoD, Forest Service boundaries |
| Census TIGER AIANNH | Tribal land boundaries |
| USGS NWIS (post-2025 OGC API) | Depth to water table |
| USDA NRCS SSURGO (SDM REST API) | Soil drainage class, horizon properties |
| EIA Form 860M Monthly (Planned sheet) | State-level interconnection queue pressure |
| WRI Aqueduct Water Risk Atlas 3.0 | Baseline water stress by watershed |
| PeeringDB /api/fac | Carrier hotel and colo facility proximity (fiber) |
