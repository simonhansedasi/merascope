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
# Activate the pipeline environment (Python 3.11+, geopandas 1.x; see environment.yml)
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

**Streamlined flow (added 2026-07-03):** signed-in builders see a **My cases** list on the lookup tab (`/api/cases` already owner-filters — no more typing case IDs); every saved-cell card and the Explorer report card carry a **Submit inquiry** deep link (`#/builder/case/?submit=<fid>`) that lands on the submit form with the cell pre-selected; contact email prefills from the signed-in account; and the submission carries the builder's **actual tuned Explorer weights** (persisted to localStorage `mera_weights_v1` via `window.setCurrentWeights`/`getCurrentWeights` in `data.js`) instead of silently substituting platform defaults — so the "Custom weights" badge on the case file now reflects reality and the submitted score matches the submitted weights.

**Permit justification report** (`/report/<case_id>`): after submission, the case intake view shows a "Download permit justification report" link that opens a printable HTML document in a new tab. The report includes: composite score block, hard gate analysis (PASS/FAIL), 22-indicator scorecard with national percentile bars and H/M/L confidence tiers, strengths/challenges summary, data sources table, and reproducibility block (pipeline version, SHA-256 anchor hash if at Resolution stage, verification URL). Explorer mode also supported: `/report?state=WA&lat=X&lon=Y&name=...` (no case required). Print-to-PDF via the browser "Print / Save PDF" button.

### Steward surface (`#/steward`)
Kanban docket across all stages. Case file: versioned findings, conditions negotiation (propose/accept/reject), co-party coordination, rebuttal clock, document chain, CSV exports. Impasse register (route to mediation). Mandated studies workbench (section checklists, live progress). **Weight templates** (`#/steward/templates`): define named weight profiles and attach them to geographic zones; lock a template to gate builders whose cells score below the minimum threshold.

**Permitter Inbox** (`#/steward/inbox`, added 2026-07-03): triage view for a caseload too large to scroll through as a kanban — four buckets: Overdue (past a rebuttal or mandated-study deadline), Due soon (within 7 days), New inquiries (stage = Site Inquiry, oldest first), Stuck (>21 days in the current stage, measured from `case_stage_overrides.ts` where present, falling back to case creation time). `GET /api/steward/inbox`, scoped to the caller's `lead_agency` the same way the docket is; admins see all agencies.

**Bulk CSV intake** (`#/steward/bulk-import`, added 2026-07-03): upload a spreadsheet of existing applications to create case files in one pass instead of hand-entering each one. Same CSV-parse/column-mapping UI as Portfolio screening. `POST /api/steward/bulk_import` creates cases at `stage='Intake'` (not Site Inquiry — these are pre-existing applications, not new inbound leads) with `imported=1`; a bad row is reported in the response but doesn't fail the rest of the batch. Lead agency defaults to the caller's `agency_key` if a row doesn't specify one.

**Nearby cases** (case file panel, added 2026-07-03): surfaces other pending cases within 5km (haversine, pure Python — no GDAL) that share the same `lead_agency`, excluding the case itself and anything already at Resolution. `GET /api/case/<case_id>/nearby?radius_km=5`. Now rendered in both case-file layouts and link-prefixed per persona (steward vs co-party).

**Unified case file (added 2026-07-03):** real builder-submitted cases used to get a stripped-down intake view with none of the negotiation tooling. Once a case is confirmed (`confirmed_at` set), the intake view now unlocks the full negotiation surface — conditions table, invite-co-parties modal, rebuttal clock, co-party tracker, mandated studies — reusing the exact same panels as the demo fixture cases (hoisted as JSX variables inside `CaseFilePage`, not duplicated). The steward case file also links the permit justification report (previously builder-only).

**Email invites (added 2026-07-03):** the invite modal's "Invite by email" input is now real — `POST /api/case/<id>/invite` with `{email}` stores an `invited_email` row in `case_invites` (schema: `agency_key` is now nullable, partial unique index on `(case_id, invited_email)`) and sends the invitee a notification email. Directory invites by `agency_key` unchanged.

**Inbox badge (added 2026-07-03):** the steward sub-nav shows an urgent-count pill (overdue + new inquiries) on the Inbox tab, fetched once per steward page mount with a 60-second module-level cache.

**Email notifications (added 2026-07-03):** `_send_notification()` in `server.py` — plain-text, fire-and-forget daemon thread reusing the magic-link SMTP env vars. Sent on: stage change and case confirmation (→ case owner/contact), email invite (→ invitee), and co-party condition approve/reject (→ the proposer, via the new `case_conditions.submitted_by_email` column). **Opt-in: emails only send when `NOTIFY_ENABLED=1` is set** (add to `/etc/merascope.env` on Hetzner); dev and CI never touch SMTP. A mail failure never fails or blocks the triggering request.

**Evidence record** (`#/evidence?case=:id`): per-finding cards with score, citation, source, formula. Each card shows whether an independent study has been mandated (green badge + days-to-deadline). Stewards can commission a study directly from the evidence record — study is linked to the specific indicator via the `finding` DB column and appears immediately. Non-stewards see a read-only card. Builders rebut findings; stewards commission independent review.

**Evidentiary record integrity (added 2026-07-01):** At the Resolution stage, the full case record (conditions, rebuttals, co-parties, weights) is serialized to canonical JSON and hashed with SHA-256. The hash is stored in the `case_anchors` table and shown in the case file as a "Record anchored" card. `GET /api/case/<id>/anchor` returns the hash and original payload for independent verification. Scoring weights at submission are also logged in `weights_json` and displayed in the case file (green "Platform defaults" chip or amber "Custom weights" chip).

**EXAMPLE case** (`demo-EX-0001`): fully wired showcase visible to all users on the docket. Shows a complete end-to-end flow: 6 findings (2 contested), 6 conditions (1 countered), 3 mandated studies linked to specific indicators by `finding` key, evidence record with live study badges, workbench entries. Hideable via the docket UI.

### Co-party surface (`#/co-party`)
Filtered docket — only shows cases where the agency is invited. Same case file as steward, propose-only permissions. Co-party conditions show as "Pending lead approval" until lead approves.

**Real docket (added 2026-07-03):** a signed-in co-party's docket now fetches `/api/cases` (which joins `case_invites` on the caller's `agency_key`) instead of filtering the static demo fixture — a directory invite from a steward actually appears on the invited agency's My Cases. The demo persona (localStorage `mera_party_key`, no real auth) keeps the fixture. Known limitation: an **email-invited** co-party only sees cases once their account's `agency_key` matches an agency invite — the `/api/cases` join is on `agency_key`, not email.

### Reporter surface (`#/factsheets`)
The reporter role ("Verified press") is read-only and shares the public pages; its home is the fact sheets. Journalist upgrades (added 2026-07-03):

**All-state rankings** (`#/factsheets/rankings`): sortable leaderboard of all 48 states — overall grade/rank plus every category, top-5 / bottom-5 callout cards, one-click CSV download, each state linking to its fact sheet. Computed client-side by `computeAllStateGrades()` (`explorer.jsx`) in a **single pass** over the grid cache — never call `computeStateGrades()` per state for a leaderboard; each call recomputes every state's category means (O(n²)). Linked from the Explorer's report-card strip and the fact sheets header.

**Fact sheet polish:** copy-permalink button (deep links `#/factsheets/<CODE>` already worked, now surfaced), per-state grades CSV download, prev/next state navigation, and an honest footnote on non-WA sheets noting that seismic PGA / water-table / hydraulic-conductivity raw medians are currently published for Washington only (scored indicators cover all 48 states — the raw-column gap is a data-pipeline backfill, deliberately not faked in the UI).

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

## Security model

- **Static serving is allowlisted.** The catch-all route only serves front-end
  asset extensions (`.js/.css/.json/.geojson/.csv/fonts/images`) and refuses
  dotfiles. The whole repo is rsynced to the server, so this is what keeps
  `.env`, `server.py`, `*.db`, `*.pdf`, `schema.sql`, and docs from being
  downloadable. Anything sensitive must never carry an allowlisted extension.
- **Case endpoints are ownership-guarded.** `_case_write_guard()` protects every
  case write and document endpoint; the single-case *read* endpoints
  (`/api/builder/case/<id>`, `/api/case/<id>/anchor`, `/report/<id>`) enforce
  the matching check via `_can_access_case()`. `demo-*` ids and ids with no row
  in `cases` stay open (the public demo depends on this), but a real case
  requires an authenticated owner, a steward/admin, or a co-party **invited to
  that specific case** — an anonymous caller and an uninvited co-party are both
  refused (fixed 2026-07-04; read and write authorization now agree). Case ids
  are sequential and enumerable, so this per-id check is what protects applicant
  PII. `create_case` is steward/admin-only and stamps `lead_agency`/`owner_email`
  so the case is visible in the creating steward's own docket; `/api/cases`
  never returns the full list to an anonymous caller.
- **`/api/case/<id>/nearby`** authorizes on the origin case, so it returns only
  map fields (`case_id`, `site`, `lat/lon`, `stage`, `lead_agency`) for
  neighbors — never their applicant contact PII.
- **`/api/admin/log` fails closed** — disabled entirely unless `MERA_ADMIN_KEY`
  is set (no guessable default), compared with `secrets.compare_digest`.
- **Rate limiting** keys on the real client IP (`CF-Connecting-IP` /
  `X-Forwarded-For`), not the proxy address. Note: the limiter is in-process, so
  it is per-gunicorn-worker (effective limit ≈ `3 × workers`) and resets on
  redeploy — a speed bump, not a hard control.
- **`init_db()` is fresh-DB safe** — tables are created before they are altered,
  so a clean database (e.g. a migration target) initializes without error.

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
MERA_ADMIN_KEY=<strong-random-value>
```

`MERA_ADMIN_KEY` gates `/api/admin/log`. As of 2026-07-04 the route **fails closed**: if the var is unset the endpoint is disabled entirely (no `devonly` fallback), and the key is compared with `secrets.compare_digest`. Set it to a strong random value in production (`openssl rand -hex 32`) to actually use the endpoint, in exactly one place (the env file, not also inline in the unit) to avoid the two diverging.

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
# Full suite (259 tests). The DB-backed tests need Postgres via TEST_DATABASE_URL;
# they skip cleanly if it is unset.
TEST_DATABASE_URL=postgresql://merascope:merascope@localhost/merascope_test \
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -m pytest tests/ -q

# Browser smoke test (starts its own server, headless Chromium)
/home/simonhans/anaconda3/envs/merascope/bin/python3 tests/smoke_test.py

# Deploy (runs lint + tests + build before rsync — aborts on failure)
bash scripts/deploy_hetzner.sh
```

`tests/test_server.py` — 177 tests covering all server API routes: case access
control (read/write/docs guards), weight logging, cryptographic record anchoring,
permit justification report routes, `_build_report_context` / `_load_zcta_feature`
units, steward templates/zones CRUD, gate check, the Phase 1 permitter-upgrade
routes (`TestStewardInbox`, `TestBulkImport`, `TestNearbyCases`, added 2026-07-03),
and the streamlining-pass additions (`TestEmailInvites`, `TestNotifications` — all
notification assertions go through a monkeypatched `_send_notification` recorder,
never real SMTP — plus the co-party `/api/cases` docket contract, added 2026-07-03).
Requires PostgreSQL (`TEST_DATABASE_URL`); skips cleanly if unavailable.
`tests/test_static_guard.py` — verifies the static-serving allowlist (no DB).
`tests/test_config.py`, `test_gates.py`, `test_indicators.py` — pipeline tests
(`test_gates` skips without state data; `test_indicators` needs geopandas).
`tests/smoke_test.py` — Playwright end-to-end: builder submit, submit deep-link
prefill, steward docket, case lookup, Permitter Inbox render, bulk-import page
render, permit-report link on the steward case view.

**No local Postgres?** Spin up a disposable one to run the DB suite:
`conda create -n pgtmp -c conda-forge postgresql`, `initdb`, start it on a spare
port, `createdb merascope_test`, then point `TEST_DATABASE_URL` at it. Note that
`tests/smoke_test.py` connects using `DATABASE_URL` (or its hardcoded default
`postgresql://merascope:merascope@localhost/merascope`), a **different, literally
named `merascope` database** from the `merascope_test` DB used by pytest — both
must exist locally to run the full local verification pass. `playwright install
--with-deps chromium` (one-time, needs sudo for system deps) is required before
`smoke_test.py` can run.

### CI (GitHub Actions — `.github/workflows/deploy.yml`)

`lint` (flake8) → `test` (full suite against a `postgres:16` service) → `deploy`
(rsync to Hetzner on push to `master`). The deploy is gated on both `lint` and
`test`, so a red suite blocks the release. **CI deploys from git**, while
`deploy_hetzner.sh` deploys from the local working tree — keep the two in sync by
committing local changes before pushing `master`, or a git deploy will revert them.

**`requirements.txt` must list every third-party import used by `scripts/`,
`server.py`, and pytest-collected tests** (added 2026-07-03, after CI failed on
`ModuleNotFoundError: No module named 'scipy'`). The local conda env
(`merascope`) has packages installed outside `requirements.txt`, so a script can
work locally while CI's clean `pip install -r requirements.txt` fails on the
same import — `scipy` (used by `scripts/03_risk.py` for `cKDTree`, pulled in
transitively by `tests/test_indicators.py`) was missing this way despite being
in every local run. `deploy_hetzner.sh`'s local test run does **not** catch
this class of bug since it uses the conda env, not a clean install — CI is the
only place it surfaces.

## Frontend

React + Leaflet, pre-compiled via Babel CLI. All 17 JSX source files compile to `merascope/dist/bundle.js` — no Babel standalone CDN, no runtime compilation. React, ReactDOM, Leaflet, and fonts (IBM Plex Sans, Source Sans 3, Source Serif 4) are vendored locally in `vendor/`; no external calls on page load.

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
  tests/                  — pytest suite (100 pipeline/static/config + 177 server tests)
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
