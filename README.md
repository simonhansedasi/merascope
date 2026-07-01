# Merascope

National data center site suitability intelligence and permitting coordination platform.
GIS-MCDA across ZIP code tabulation areas (ZCTAs), 23 scored indicators (16 core + 7 supplemental),
scored at both state and national scale with cross-state `*_nat` normalization.

Built for three audiences:
- **Builders** (developers evaluating sites) — Explorer map, workspace, portfolio screening
- **Stewards** (lead regulatory agencies) — docket, case file, conditions negotiation, co-party coordination, evidentiary record export
- **Co-parties** (invited agencies: tribes, counties, utilities, AG) — filtered docket, propose conditions, transparency into lead's review

Same Score Promise: methodology is public and identical for all users. No party receives a different number.

## Quick start

```bash
# Activate the pipeline environment (Python 3.7 + geopandas 0.10.x — intentionally pinned; see environment.yml)
conda activate merascope
PYTHON=/home/simonhans/anaconda3/envs/merascope/bin/python3

# Run a single state end-to-end (ZCTA pipeline, steps 02-16)
$PYTHON -u scripts/zcta/run_zcta_study.py WA

# Resume at a specific step (e.g. after a failure)
$PYTHON -u scripts/zcta/run_zcta_study.py WA --start 06

# Run all 48 states (outputs to data/{STATE}/zcta/grid_scores.geojson)
bash scripts/run_all_zcta.sh 2>&1 | tee logs/zcta_master.log

# National normalization pass (run once after all 48 states are complete)
$PYTHON -u scripts/normalize_zcta_national.py
```

See [PIPELINE_GUIDE.md](contexts/PIPELINE_GUIDE.md) for full setup, step descriptions, and troubleshooting.

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
All scores normalized 0-1 within state (1 = most favorable for siting). Cross-state `*_nat` columns added by `normalize_zcta_national.py` after all 48 states complete.

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

All 48 states carry the full raw column set in their ZCTA files.

| Column | Units | Added by | In ZCTA? |
|---|---|---|---|
| tx_dist_m | m to nearest HV line | step 02 | yes |
| ann_precip_mm | mm/yr (PRISM 30-yr normal) | step 02 | yes |
| pop_density | persons/km2 | step 02 | no (not stored) |
| seismic_pga_g | PGA (g) | step 03 | yes |
| tri_dist_m | m to nearest TRI facility | step 04 | yes |
| river_dist_m | m to nearest major river | step 04 | yes |
| heatflow_mwm2 | mW/m2 | step 05 | yes |
| flat_frac | fraction with slope < 5 deg | step 06 | yes |
| slope_mean_deg | mean slope in degrees | step 06 | yes |
| protected_frac | fraction covered by protected land | step 07 | yes |
| aquifer_depth_ft | ft to water table (IDW from USGS wells) | step 08 | yes |
| substation_dist_m | m to nearest 345kV+ substation | step 11 | yes |
| superfund_dist_m | m to nearest Superfund site | step 12 | yes |
| rcra_dist_m | m to nearest RCRA site | step 12 | yes |
| ksat_mean_ums | µm/s saturated hydraulic conductivity | step 10 | yes |
| water_stress_raw | WRI Aqueduct bws_score (0-5) | step 15 | yes |
| iso_queue_mw | planned interconnection queue MW | step 16 | yes |

## States completed

All 48 contiguous states complete (AK/HI excluded) as of 2026-06-23.

All 48 contiguous states carry the full 66-column ZCTA dataset (23 scores × 2 normalization windows + raw physical columns).

## Product surfaces

### Builder surface (`#/builder`)
Workspace tab (saved cells, comparison panel), Status tab (CRM tracker per site: contacts/events/notes/pipeline), Portfolio screening (CSV upload of lat/lons, scored results with gate check), My Inquiry tab (submit a site inquiry + case lookup).

**Site inquiry flow:** Builder selects a saved site from a card grid → confirms site name and score → lead agency is auto-detected via Nominatim reverse geocode → fills contact details → submits. Merascope routes the inquiry to the relevant agency; the agency runs their own jurisdiction-specific permitting process from there. Merascope is the first contact point and routing layer, not the permitting system itself.

**Permit justification report** (`/report/<case_id>`): after submission, the case intake view shows a "Download permit justification report" link that opens a printable HTML document in a new tab. The report includes: composite score block, hard gate analysis (PASS/FAIL), 22-indicator scorecard with national percentile bars and H/M/L confidence tiers, strengths/challenges summary, data sources table, and reproducibility block (pipeline version, SHA-256 anchor hash if at Resolution stage, verification URL). Explorer mode also supported: `/report?state=WA&lat=X&lon=Y&name=...` (no case required). Print-to-PDF via the browser "Print / Save PDF" button.

### Steward surface (`#/steward`)
Kanban docket across all stages. Case file: versioned findings, conditions negotiation (propose/accept/reject), co-party coordination, rebuttal clock, document chain, CSV exports. Impasse register (route to mediation). Mandated studies workbench (section checklists, live progress). **Weight templates** (`#/steward/templates`): define named weight profiles and attach them to geographic zones; lock a template to gate builders whose cells score below the minimum threshold.

**Evidence record** (`#/evidence?case=:id`): per-finding cards with score, citation, source, formula. Each card shows whether an independent study has been mandated (green badge + days-to-deadline). Stewards can commission a study directly from the evidence record — study is linked to the specific indicator via the `finding` DB column and appears immediately. Non-stewards see a read-only card. Builders rebut findings; stewards commission independent review.

**Evidentiary record integrity (added 2026-07-01):** At the Resolution stage, the full case record (conditions, rebuttals, co-parties, weights) is serialized to canonical JSON and hashed with SHA-256. The hash is stored in the `case_anchors` table and shown in the case file as a "Record anchored" card. `GET /api/case/<id>/anchor` returns the hash and original payload for independent verification. Scoring weights at submission are also logged in `weights_json` and displayed in the case file (green "Platform defaults" chip or amber "Custom weights" chip).

**EXAMPLE case** (`demo-EX-0001`): fully wired showcase visible to all users on the docket. Shows a complete end-to-end flow: 6 findings (2 contested), 6 conditions (1 countered), 3 mandated studies linked to specific indicators by `finding` key, evidence record with live study badges, workbench entries. Hideable via the docket UI.

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

Two normalization windows live:

1. **National (`*_nat` columns)** — `normalize_zcta_national.py` runs global p01-p99 percentile normalization across all ~33k ZCTAs after all 48 states complete. Binary gates (flood, protected, air quality) are copied directly. Used in Explorer national view.
2. **State** — scores normalized 0-1 within state. Used in Explorer state view (default when a state is selected).

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
# Unit + pipeline tests (200 tests total)
/home/simonhans/anaconda3/envs/merascope/bin/python3 -m pytest tests/ -v

# Browser smoke test (26 checks — starts its own server, headless Chromium)
/home/simonhans/anaconda3/envs/merascope/bin/python3 tests/smoke_test.py

# Deploy (runs lint + tests + build before rsync — aborts on failure)
bash scripts/deploy_hetzner.sh
```

`tests/test_server.py` — 121 tests covering all server API routes including weight logging, cryptographic record anchoring, permit justification report routes, `_build_report_context` and `_load_zcta_feature` unit tests, steward templates/zones CRUD and gate check. Requires PostgreSQL (`TEST_DATABASE_URL`); skips cleanly if unavailable.
`tests/test_config.py`, `test_gates.py`, `test_indicators.py` — 79 pipeline tests (no DB needed).
`tests/smoke_test.py` — Playwright end-to-end: builder submit form, progressive reveal, steward docket, intake case view, case lookup.

## Frontend

React + Leaflet, pre-compiled via Babel CLI. All 16 JSX source files compile to `merascope/dist/bundle.js` — no Babel standalone CDN, no runtime compilation. React, ReactDOM, Leaflet, and fonts (IBM Plex Sans, Source Sans 3, Source Serif 4) are vendored locally in `vendor/`; no external calls on page load.

Build the bundle (runs automatically in `deploy_hetzner.sh`):

```bash
npm install   # first time only
npm run build
```

The map uses ZCTA geography for both national and state views. All 48 states are wired. `GRID_URLS` in `merascope/map.jsx` all point to `data/{STATE}/zcta/grid_scores.geojson`. Fishnet files exist but are not used in the explorer map.

**ZIP code finder:** search input in the Explorer sidebar (5-digit code, Enter or "Find" button). Calls `window.findZip(zip)` which searches `_gridCache.features` by `zcta` property, zooms to the match, and highlights it with a dashed border. Works across all 48 states once data is loaded.

**Lazy loading:** ZCTA files load incrementally via `window._onStateZctaLoaded(stateData)` callback — first state renders in ~1 second; remaining 47 stream in behind it using `L.geoJSON.addData()`.

Dev server: `cd ~/coding/merascope && python3 server.py` (Flask, port 8877 — NOT python3 -m http.server; Flask provides /api routes)

## Repo structure

```
merascope/
  index.html              — frontend entry point
  merascope/              — JSX source files + compiled dist/ (gitignored, built on deploy)
  templates/              — Jinja2 HTML templates (report.html = permit justification report)
  server.py               — Flask app (port 8877)
  package.json            — Babel build config
  babel.config.json       — JSX compile settings (classic runtime)
  scripts/                — pipeline scripts + shell scripts
    deploy_hetzner.sh     — manual deploy (lint + tests + build + rsync)
    fetch_vendor.sh       — download pinned vendor assets (React, Leaflet, fonts)
    setup_pg.sh           — VPS PostgreSQL install + schema bootstrap
    setup_env.sh          — conda environment setup
    sync_data_hetzner.sh  — push GeoJSON data to VPS (run separately from code deploy)
    config.py             — state bboxes, FIPS, UTM zones for all 50 states
    run_pipeline.py       — fishnet orchestrator (legacy; superseded by zcta/run_zcta_study.py)
    run_all_zcta.sh       — full national ZCTA pipeline (all 48 states, steps 02-16)
    01_basemap.py         — state boundary, data centers, transmission, EIA plants
    02_indicators.py      — fishnet grid + tx, water, ej, pop_exposure scores (legacy)
    zcta/                 — ZCTA-specific scripts
      02_zcta_indicators.py — ZCTA grid + tx_score, water_score, ej_score, pop_exposure_score
      run_zcta_study.py   — per-state ZCTA orchestrator (steps 02-16)
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
    normalize_zcta_national.py — cross-state normalization pass (run after all 48 states)
    grade_states.py       — letter grade computation + data.js patcher
    patch_raws.py         — retrofit raw physical columns on completed states
  data/                   — generated GeoJSON + CSVs (gitignored; sync with sync_data_hetzner.sh)
  vendor/                 — React, Leaflet, fonts (gitignored; built by fetch_vendor.sh)
  tests/                  — pytest suite (79 pipeline + 64 server tests)
```

Full developer docs live in `~/coding/contexts/merascope/` (symlinked to repo root):
- `CONTEXT.md` — architecture, server schema, API routes, known limitations
- `CLAUDE.md` — dev environment, gotchas, deploy instructions
- `DOCS.md` — comprehensive technical reference
- `METHODS.md` — indicator methodology with citations
- `PIPELINE_GUIDE.md` — running and troubleshooting the pipeline

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
