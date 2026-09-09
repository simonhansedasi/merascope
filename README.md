# Merascope

National site suitability intelligence and permitting coordination platform for large-load infrastructure — data centers and, as of 2026-07-11, battery energy storage (BESS).
GIS-MCDA across ZIP code tabulation areas (ZCTAs), 23 scored indicators (16 core + 7 supplemental),
scored at both state and national scale with cross-state `*_nat` normalization. See "Site verticals" below for how the same indicators reweight per site type.

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

## Site verticals (added 2026-07-11)

Merascope scores two site types off the same 23 indicators, just reweighted — no new data ingestion. `_SITE_TYPES` (`server.py`) is the source of truth; `SITE_TYPES` in `data.js` mirrors it for the frontend (keys/weights/label copy must be kept in sync by hand — no automated check yet).

- **`datacenter`** (default) — Merascope's original vertical. Weights match the Balanced preset.
- **`bess`** ("Battery Storage / Renewables") — weighted toward grid interconnection readiness (transmission 25 / substation 20 / grid_capacity 20 / flood 10 / seismic 10 / slope 10 / community 5, rest zero) over the water/community factors that matter more for large-load datacenter siting. **First-cut vector, not yet validated against real WA BESS/EFSEC permitting criteria** — sanity-check with advisors before treating it as authoritative on a real case.

`GET /api/site-types` returns the public id/label/description/weights list, no auth required. A `site_type` column (`ALTER TABLE ... DEFAULT 'datacenter'`, idempotent) lives on `cases`, `demo_cases`, and `steward_templates`; `_weights_for_site_type()` / `weightsForSiteType()` fall back to `datacenter` for an unknown or missing key so a stale client payload can't crash report generation or the Explorer's initial weights. Site type is chosen via a `<select>` in the Explorer/Builder weight panel; the frontend selection persists client-side only (`localStorage mera_site_type_v1` via `window.getCurrentSiteType()`/`setCurrentSiteType()`) — it is not yet an account-level steward default. `/api/steward/presets?site_type=` filters the 5 preset weight templates to the ones tagged relevant for that vertical (`PRESET_TEMPLATES[].site_types`).

**Known gaps:** `bulk_import()` (steward CSV intake) doesn't thread `site_type` through imported cases — it defaults via the DB column only. Solar/wind as additional verticals were scoped as an extension point but not built (would need a third entry in `_SITE_TYPES`/`SITE_TYPES` plus the `normalize_zcta_national.py` INDICATORS list — an easy-to-miss third hand-sync spot alongside the two above).

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

**Email notifications (added 2026-07-03):** `_send_notification()` in `server.py` — plain-text, fire-and-forget daemon thread reusing the magic-link SMTP env vars. Sent on: stage change and case confirmation (→ case owner/contact), email invite (→ invitee), co-party condition approve/reject (→ the proposer, via the new `case_conditions.submitted_by_email` column), and pricing-page lead submission (→ `LEAD_NOTIFY_EMAIL`, falling back to `FROM_EMAIL`/`SMTP_USER`). **Opt-in: emails only send when `NOTIFY_ENABLED=1` is set** (add to `/etc/merascope.env` on Hetzner); dev and CI never touch SMTP. A mail failure never fails or blocks the triggering request.

**Pricing-page lead capture (added 2026-07-06):** every CTA on `#/pricing` is now live. The self-serve Builder Individual tier links to `#/login` (magic-link signup); the six sales-touch CTAs (Group trial, Enterprise, all Steward tiers, performance participation) open a contact modal that POSTs `{email, name, org, note, workspace, tier, session_id}` to `POST /api/lead`. Leads land in the `leads` table (created in `init_db()`), fields are length-capped server-side, the route is rate-limited at 5 / 15 min per IP (own limiter store, separate from magic links), and a notification email fires via `_send_notification()`. Regression tests in `TestLeads` (`tests/test_server.py`).

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
  `.txt` is deliberately **not** allowlisted (it would serve `requirements.txt`
  from the repo root); add a dedicated route if a public `robots.txt` is needed.
- **Case endpoints are ownership-guarded.** `_case_write_guard()` protects every
  case write and document endpoint; the single-case *read* endpoints
  (`/api/builder/case/<id>`, `/api/case/<id>/anchor`, `/report/<id>`) enforce
  the matching check via `_can_access_case()`. `demo-*` ids and the three static
  frontend fixtures (`_DEMO_FIXTURE_IDS`) stay open so the public demo works, but
  **any other id with no row requires a real session** (fixed 2026-07-04 — an
  anonymous caller can no longer write to arbitrary made-up ids). A real case row
  requires an authenticated owner, a steward/admin, or a co-party **invited to
  that specific case**. `upload_doc` additionally **always requires an
  authenticated session** (even for demo/fixture ids) so anonymous callers can't
  push files into object storage. Case ids are sequential and enumerable, so the
  per-id check is what protects applicant PII. `create_case` is steward/admin-only.
- **Session-scoped builder data.** The builder CRM/workspace is keyed by the
  browser session UUID (`window.MERA_SESSION`), not by login. `crm_state` is keyed
  on `(session_id, fid)` — never `fid` alone — and `/api/crm/<fid>`,
  `/api/export/workspace`, `/api/export/status`, and `/api/demo/cases` all
  **require the session id and scope strictly to it**. A missing session id
  returns empty/`400`, never "all sessions" (fixed 2026-07-04 — previously these
  leaked every user's CRM contacts, notes, and demo contact emails).
- **`/api/case/<id>/nearby`** authorizes on the origin case, so it returns only
  map fields (`case_id`, `site`, `lat/lon`, `stage`, `lead_agency`) for
  neighbors — never their applicant contact PII.
- **`/api/admin/log` fails closed** — disabled entirely unless `MERA_ADMIN_KEY`
  is set (no guessable default), compared with `secrets.compare_digest`.
- **Rate limiting** keys on the real client IP (`CF-Connecting-IP` /
  `X-Forwarded-For`), not the proxy address. Magic-link requests are capped at
  3 / 15 min; `/api/log` telemetry at 600 / min per IP; `/api/lead` at
  5 / 15 min. Note: the limiter is
  in-process, so it is per-gunicorn-worker and resets on redeploy — a speed bump,
  not a hard control.
- **`init_db()` is fresh-DB safe** — tables are created before they are altered,
  so a clean database (e.g. a migration target) initializes without error. The
  `crm_state` primary-key migration (fid → session_id+fid) is idempotent.

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
LEAD_NOTIFY_EMAIL=<inbox-for-pricing-inquiries>   # optional; falls back to FROM_EMAIL
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
# Full suite (313 tests, verified 2026-07-29). The DB-backed tests need Postgres via TEST_DATABASE_URL;
# they skip cleanly if it is unset.
TEST_DATABASE_URL=postgresql://merascope:merascope@localhost/merascope_test \
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -m pytest tests/ -q

# Browser smoke test (starts its own server, headless Chromium)
/home/simonhans/anaconda3/envs/merascope/bin/python3 tests/smoke_test.py

# Deploy (runs lint + tests + build before rsync — aborts on failure)
bash scripts/deploy_hetzner.sh
```

`tests/test_server.py` — server API routes: case access
control (read/write/docs guards), weight logging, cryptographic record anchoring,
permit justification report routes, `_build_report_context` / `_load_zcta_feature`
units, steward templates/zones CRUD, gate check, the Phase 1 permitter-upgrade
routes (`TestStewardInbox`, `TestBulkImport`, `TestNearbyCases`, added 2026-07-03),
the streamlining-pass additions (`TestEmailInvites`, `TestNotifications` — all
notification assertions go through a monkeypatched `_send_notification` recorder,
never real SMTP — plus the co-party `/api/cases` docket contract, added 2026-07-03),
and the pre-launch hardening pass (`TestExportScoping`, `TestDemoScoping`, and the
session-scoped `TestCRM` / arbitrary-id `TestCaseAuthGuards` cases, added 2026-07-04).
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

**CI never ships `data/`.** The rsync in `deploy.yml` carries
`--exclude='data/'`, so every artifact under `data/` reaches the server only by a
manual copy. This bit the risk surface on its first deploy: the code went up fine
and `/api/risk/*` returned `503 risk data not built` because
`data/.risk/` had never existed anywhere but the machine that generated it. See
"Shipping the risk data" below.

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
  tests/                  — pytest suite (313 total: 213 server, 37 indicators, 24 gates, 21 static, 18 config)
```

Reference docs in this repo under `contexts/`:
- `DOCS.md` — comprehensive technical reference
- `METHODS.md` — indicator methodology with citations
- `PIPELINE_GUIDE.md` — running and troubleshooting the pipeline

`LEARNING_GUIDE.md` (repo root, added 2026-07-29) — deep-dive learner's guide to the whole stack: what each technology is, where it lives in this code, why it was built that way, and the traps. Written as a reference sheet rather than a spec; includes a staged learning plan and a known-weak-points list.

Project docs live in `~/coding/contexts/merascope/` (canonical location — this repo has no root symlinks for them):
- `CONTEXT.md` — architecture, server schema, API routes, known limitations
- `CLAUDE.md` — dev environment, gotchas, deploy instructions

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


## Public ZIP exposure lookup (`/#/risk`)

The only ungated surface in the product. `scripts/18_risk_tiers.py` precomputes a
tier for every ZCTA; `server.py` looks the answer up. No model runs at request time.

**It reports a tier and an observed rate, never a probability.** Even after the
multi-source relabelling the model is not calibrated well enough to put a percentage
next to a ZIP (the 0.2-0.3 band reads 0.238 predicted against 0.174 observed). What
it states instead is the measured share of ZIPs in the same tier that host a
facility, quoted against the lowest tier — the same statistic on both sides, so the
claim does not depend on calibration. `tests/test_risk.py` guards the wording.

**One tier per ZIP**, from `has_dc` (0.09% in the bottom tier to 15.2% in the top),
with two rates on every
tier row: how many of those ZIPs host a facility now, and how many have one
proposed. See "One binning, two rates" below for why the second ranking was
removed and what the pipeline column may and may not be used to claim.

### Security model for the public routes

- **No bulk export.** There is deliberately no route returning many ZIPs at once.
  The per-ZCTA file lives in `data/.risk/` — the leading dot means the catch-all
  static route refuses it (it rejects dot-segments at any depth) even though
  `.json` is an allowlisted extension. `tests/test_risk.py` asserts this.
- **Rate limiting** is 30 lookups per IP per minute, via the same sliding-window
  pattern as the magic-link limiter but with its own store. **This is per-worker and
  in-memory** (the code review's deferred finding 6): it throttles casual scraping,
  not a distributed effort. Moving it to a shared store is the fix when it matters.
- **Unknown ZIPs explain themselves.** A ZIP with no ZCTA (PO-box or
  single-organization) returns 404 with an explanation rather than a zero that would
  read as "no exposure".

### The map

`/#/risk` includes a national exposure map (Leaflet, already vendored; CartoDB
basemap; canvas renderer).

**The exposure layer is aggregated to 0.25-degree (~28 km) cells carrying a mean
tier and counts — never per-ZIP.** A per-ZCTA layer would ship the entire ranking to
the browser, which is precisely the bulk export the product declines to offer, so the
map shows where exposure clusters without handing anyone a ZIP-by-ZIP list.
`tests/test_risk.py::test_map_layer_is_aggregated_not_per_zip` holds that line.
Served from `/api/risk/grid` (9,707 cells, ~188 KB, cached 24 h).

The second layer is the 2,302 real facilities from `facilities.geojson` — already
public, already attributed, and the most verifiable thing on the page.

Deep links work: `#/risk?zip=20147` looks the ZIP up on load and drops a pin.

### Attribution

`data/datacenters/facilities.geojson` is reachable over HTTP, and ODbL and CC BY
both require attribution to travel with the data — so the notice is written into the
GeoJSON itself as a top-level `attribution` member, and returned by `/api/risk/<zip>`.

## Findings (`/findings`)

Reproducible, one-question-at-a-time public results — server-rendered Jinja2, no
React, real Flask paths rather than SPA hash routes. Each finding's HTML page and
its `.json` companion route are backed by the same `compute()` in one standalone
script under `scripts/analysis_*.py`, run fresh on every request, so the two can
never quote different numbers. `/findings` itself is a small index (list lives in
`server.py`'s `_FINDINGS`) linking out to every page below — before it existed,
none of these were reachable from anywhere on the site.

| Page | Script |
|---|---|
| `/findings/dc-ej-composition` | `analysis_dc_ej_composition.py` — the data-center poverty gap decomposed into a composition effect (racial mix) and a rate effect (within-race poverty); the gap is Simpson's Paradox, not a real within-group effect |
| `/findings/dc-ej-map` | same script — the same ~1,183 hosting ZCTAs as an interactive national Leaflet map, toggling between poverty gap and minority composition |
| `/findings/wa-fire-risk` | `analysis_wa_fire_risk.py` — MTBS burn history + USFS Wildfire Hazard Potential at confirmed WA data-center sites |
| `/findings/pnw-water-stress` | `analysis_pnw_water_stress.py` — WRI Aqueduct watershed water stress, WA/OR vs. the Colorado River Compact states |

Data behind these lives in `data/shared/` (gitignored, same volume as the pipeline's
supplemental-indicator caches) — copy it to Hetzner by hand after regenerating, same
as `data/.risk/` (see "Shipping the risk data" below). Tests are gated with a
`skipif` on that data being present locally (`tests/test_server.py`,
`TestPnwWaterStressFinding` / `TestDcEjCompositionFinding`).


## Shipping the risk data

`scripts/17_datacenter_labels.py` and `scripts/18_risk_tiers.py` write to
`data/datacenters/` and `data/.risk/`. Both live under the gitignored `data/`, and
`deploy.yml`'s rsync excludes `data/` outright, so **regenerating them does nothing
for production until they are copied across by hand.** Symptom if you forget:
the page renders, the map is blank, the tier tables are absent, and
`/api/risk/tiers` returns `503 risk data not built`.

```bash
# on the machine that generated them
tar -czf /tmp/merascope_risk_data.tgz data/.risk data/datacenters   # ~1.2 MB
# on a machine with Hetzner access
scp /tmp/merascope_risk_data.tgz root@204.168.182.60:/tmp/
ssh root@204.168.182.60 "cd /home/simonhans/coding/merascope \
  && tar -xzf /tmp/merascope_risk_data.tgz && systemctl restart merascope"
# verify
curl -s https://merascope.com/api/risk/tiers | head -c 40   # want {"n_tiers":10,
```

**`.risk` is a dot-directory, and `rsync data/* host:...` silently skips it** — the
shell glob does not match dotfiles, so you get `datacenters/` and a still-broken
risk surface with no error. Name the directory explicitly or sync `data/` whole.

**Order: code first, data second.** Because CI ships code while `data/.risk/` goes
by hand, production runs new code against the previous JSON for a window. The
shared-bin fields (`observed_pipeline`, `divide`) are therefore read with `.get()`
in `server.py` and guarded in `risk.jsx`, so old data degrades to a table without
the pipeline column instead of a 500. Keep that property when adding fields: a new
key must never be required for the page to render.

The leading dot is deliberate: `server.py`'s catch-all static route refuses any
path with a dot-segment at any depth, so `zcta_tiers.json` cannot be downloaded
even though `.json` is an allowlisted extension. **Do not un-ignore `data/.risk/`
to make deploys easier** — this repo is public, so committing `zcta_tiers.json`
would publish the complete per-ZIP ranking, which is exactly the bulk export the
product declines to offer.

Regenerating on the server is not an option either: `18_risk_tiers.py` needs
scikit-learn, which is deliberately absent from `requirements.txt`. The server
serves precomputed artifacts; it does not train.

## Border ZCTAs get the state they mostly lie in

Fixed 2026-08-24 in `notebooks/dcmodel.py`. `build_zcta.py` joins ZCTAs to states
with `intersects`, so **3,365 ZCTAs (10% of the table) appear in two or more state
files** — and the geometry in each copy is the *full, unclipped* ZCTA polygon,
byte-identical everywhere it appears.

`load_zctas()` used to dedupe by sorting on the ZCTA's own area and keeping the
first row, on the assumption that the files held state-clipped geometry so the
larger copy meant "mostly in this state". Because the copies are identical, **every
one of those sorts was a tie**, and pandas' stable ordering handed each ZCTA to
whichever state came first in `STATES`. That is why 73717 and 74056 (Oklahoma) read
KS, and 84313 (Utah) read NV — KS and NV simply precede them in the list.

The label was the smaller half of the problem. Because normalization is
state-relative, **18 of the 23 `_nat` columns differ between two copies of the same
ZCTA** — `tx_score_nat` by up to 0.968 on a 0-1 scale — so the arbitrary pick also
chose arbitrary *feature values* for a tenth of the rows.

Now each duplicate is overlaid against Census TIGER state polygons
(`state_boundaries()`, cached at `notebooks/cache/tiger_states.geojson`) and
assigned to the state holding the largest share of its area, taking that state's
copy of the scores. Results:

- 1,675 of 3,365 duplicates changed state; row count unchanged at 33,252.
- Against ZIP prefixes that belong to exactly one state, mislabelling fell from
  **6.94% to 0.55%**. The residual 41 are genuine straddles — 83414 (Alta) has an
  Idaho prefix and lies 100% in Wyoming; 73960 (Texhoma) has an Oklahoma prefix and
  lies 100% in Texas. Assigning those by area is correct, not a miss.
- Model quality improved slightly: lift **4.10x -> 4.18x**, ROC AUC 0.832 -> 0.835.
- Labels are spatial joins on geometry, which did not change, so positives held at
  523 / 204 / 29 exactly.

**Rebuild after touching this:** `notebooks/cache/model_table.csv` is generated
(notebook 01 cell 10 = `load_zctas()` -> `attach_labels()`), so a change here does
nothing until that file is regenerated and `scripts/18_risk_tiers.py` re-run.

## One binning, two rates

**Supersedes the earlier "two tier scales" rule** (2026-08-24). That rule was
correct for the design it described and is now obsolete, because the design is gone.

There used to be two rankings: a model on `has_dc` and a second on
`has_dc_forward`, each decile-binned on its own out-of-fold score. Two ladders of
ten equal bins look comparable but are not — **the two top tiers shared only 812 of
3,326 ZIPs**, so "tier 9" named a different set of ZIP codes on each. That forced
two separately-headed tables and made the one useful comparison — what is already
here against what is coming here — impossible to state.

Now ZCTAs are binned **once**, on the `has_dc` score, and every tier row carries
both observed rates measured over the same ZIPs:

| field | meaning |
|---|---|
| `observed` | share of the tier's ZIPs hosting a facility now |
| `observed_pipeline` | share of **those same** ZIPs with something proposed/permitted |
| `n_divergent` | ZIPs in the tier with 0 built and >= 1 proposed |

One `n` serves both, which is what makes the columns readable across.
`tests/test_risk.py::test_no_separate_pipeline_ranking` is the regression guard —
do not reintroduce a second ladder.

**The forward model is no longer fit.** It was weak (21x top-vs-bottom, against
168x for the built label) and its bottom half was not monotonic: tier 3 came in
*below* tier 2, with
tiers 1-5 all inside each other's intervals, and nothing guarded it because
`test_tier_stats_are_monotonic` only ever checked exposure. As a rate on stable
bins the same signal survives without the spurious ordering.

### What this licences you to say, and what it does not

The divide is a **concentration** claim and only that. From `tier_stats.json`'s
`divide` block, all script-computed:

- Top decile holds **42.2%** of built facilities but **25.9%** of the pipeline.
- **206** ZIPs host nothing but have something proposed; **68.9%** of those are
  sparsely populated, against **29.3%** of ZIPs that already host.

Do not quote the bottom-to-top ratio as a headline: tier 1 holds 3 positives out
of 3,326, so it swings on a single facility. The top-decile shares and the rural
gap are the stable figures.

Two claims the data does **not** support, both easy to reach for:

1. **Not "the pipeline is rural."** `observed_pipeline` still *rises* with the tier
   (0.06% -> 2.01%). Proposals are less *concentrated* than built stock, not rural
   in absolute terms. Keep it relative.
2. **Not "expanding faster than communities can protect themselves."** Divergence
   ZIPs average `ej_score` **0.660** against **0.594** for hosting ZIPs, and higher
   `ej_score` means *less* burden — the opposite sign. Protective capacity
   (planning staff, permitting sophistication, legal resources) is a different
   construct from pollution/demographic burden and the product has no indicator for
   it, so the claim is untestable here, not merely unproven.
