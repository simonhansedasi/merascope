"""
Merascope server — PostgreSQL backend.
Requires DATABASE_URL env var: postgresql://user:pass@host/dbname

This is the entire Flask backend for Merascope: a data-center site suitability
and permitting-coordination platform. It serves the compiled React frontend
(static files under merascope/dist/), the Jinja2-rendered permit justification
report, and every /api/* JSON route the frontend calls.

Big picture of what lives in this file, roughly top to bottom:
  - Rate limiters (magic-link auth, telemetry, lead capture) — simple in-process,
    per-gunicorn-worker token buckets keyed by client IP.
  - Postgres connection pool + a thin `_DB` wrapper so the rest of the file can
    write SQLite-style `?` placeholders (translated to psycopg2's `%s`).
  - `init_db()` — idempotent schema creation/migration, run once at import time.
  - Event logging (`/api/log`) and CSV export routes for the Builder workspace
    and CRM tracker (session-scoped — see the security notes below).
  - Case-file routes: invites, conditions, documents, rebuttal deadlines,
    stage transitions, cryptographic record anchoring at Resolution.
  - The docket (`/api/cases`), Permitter Inbox (`/api/steward/inbox`), and bulk
    CSV intake (`/api/steward/bulk_import`) — steward-facing triage tooling.
  - Builder submission flow (`/api/builder/submit`), including the anonymous
    "demo" branch that writes to a TTL'd `demo_cases` table instead of `cases`.
  - Magic-link email auth (`/api/auth/*`) and the `require_steward` decorator.
  - Steward weight templates + geographic zones (gate builders below a minimum
    score in a locked zone) with pure-Python point-in-polygon, no GDAL.
  - The permit justification report (`/report/<case_id>`, `/report`) — server-
    rendered Jinja2 HTML, no React involved.
  - The static file catch-all, which allowlists only front-end asset
    extensions so the rsynced repo (including this very file, `.env`, `.db`
    files, etc.) is never directly downloadable.

Security model in one paragraph: every case write and document route funnels
through `_case_write_guard()` (single-case reads through `_can_access_case()`),
which treats demo/fixture ids as open (public demo) and requires a real,
authorized session for everything else. Builder CRM/workspace data is scoped
by anonymous browser-session UUID, not login, so every route touching it must
require and filter on `session_id` — never fall back to "no session = all
sessions." See CONTEXT.md's Security model section for the full writeup.
"""

from flask import Flask, request, jsonify, send_from_directory, Response, redirect, g, render_template
from werkzeug.utils import secure_filename
from contextlib import contextmanager
from datetime import datetime, date as _date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import wraps
import psycopg2
import psycopg2.extras
import psycopg2.pool
import json, csv, io, os, secrets, smtplib, time, threading, hashlib, math

try:
    # boto3 is only needed for S3-backed document storage (see _get_s3 below).
    # Import is optional so the server still starts locally without it — in
    # that case upload_doc/serve_doc fall back to local disk under DOCS_DIR.
    import boto3
    from botocore.client import Config as BotoConfig
except ImportError:
    boto3 = None

app = Flask(__name__)

# Simple in-process rate limiter: max 3 magic link requests per IP per 15 minutes
_rl_lock   = threading.Lock()
_rl_store  = {}   # ip -> list of timestamps
_RL_WINDOW = 900  # seconds
_RL_LIMIT  = 3

def _client_ip():
    """Real client IP behind Cloudflare/APISIX. remote_addr is the proxy, so
    without this every visitor shares one rate-limit bucket."""
    hdr = request.headers
    return (
        hdr.get('CF-Connecting-IP')
        or hdr.get('X-Real-IP')
        or (hdr.get('X-Forwarded-For', '').split(',')[0].strip() or None)
        or request.remote_addr
    )


def _check_rate_limit(ip):
    """Sliding-window check for the magic-link limiter: True if this IP is still
    under _RL_LIMIT requests within the trailing _RL_WINDOW seconds (and records
    this hit), False if it should be rejected with 429."""
    now = time.time()
    with _rl_lock:
        # Drop timestamps outside the window, then check remaining count —
        # this makes the window slide rather than reset on a fixed boundary.
        hits = [t for t in _rl_store.get(ip, []) if now - t < _RL_WINDOW]
        if len(hits) >= _RL_LIMIT:
            return False
        hits.append(now)
        _rl_store[ip] = hits
    return True


# Telemetry (/api/log) limiter: generous per-IP cap so normal event streams pass
# but an anonymous flood can't fill event_log. Separate store from magic links.
_log_rl_lock   = threading.Lock()
_log_rl_store  = {}
_LOG_RL_WINDOW = 60
_LOG_RL_LIMIT  = 600


def _check_log_rate(ip):
    """Same sliding-window pattern as _check_rate_limit, but for /api/log
    telemetry (own store/limits — see _log_rl_store above)."""
    now = time.time()
    with _log_rl_lock:
        hits = [t for t in _log_rl_store.get(ip, []) if now - t < _LOG_RL_WINDOW]
        if len(hits) >= _LOG_RL_LIMIT:
            return False
        hits.append(now)
        _log_rl_store[ip] = hits
    return True


# Lead capture (/api/lead) limiter: a real prospect submits once or twice; a
# flood would fill the leads table and spam the notification inbox. Separate
# store so lead submits never consume the magic-link budget.
_lead_rl_lock   = threading.Lock()
_lead_rl_store  = {}
_LEAD_RL_WINDOW = 900
_LEAD_RL_LIMIT  = 5


def _check_lead_rate(ip):
    """Same sliding-window pattern again, for /api/lead pricing-page submits
    (own store — see comment above _lead_rl_store)."""
    now = time.time()
    with _lead_rl_lock:
        hits = [t for t in _lead_rl_store.get(ip, []) if now - t < _LEAD_RL_WINDOW]
        if len(hits) >= _LEAD_RL_LIMIT:
            return False
        hits.append(now)
        _lead_rl_store[ip] = hits
    return True


ROOT     = os.path.dirname(os.path.abspath(__file__))  # repo root — used to build every data/ and template path below
DOCS_DIR = os.path.join(ROOT, 'data', 'docs')           # local-disk fallback for case document uploads when S3 isn't configured

# Static demo case files that live in the frontend (data.js), not the DB. These
# stay writable without auth so the public demo case view works. Any other id
# with no DB row is treated as unknown and requires a real session.
_DEMO_FIXTURE_IDS = {'26-0142', '26-0171', '26-0168'}

# ── report indicator metadata (mirrors data.js INDICATORS) ────────────────────
# Python-side copy of the same 22-indicator metadata that lives in the frontend's
# data.js INDICATORS array. Used only by the server-rendered permit justification
# report (_build_report_context / templates/report.html), which has no access to
# the JS bundle. If a new indicator is added to data.js, it must be added here
# too or it will silently be missing from the printable report.
_REPORT_INDICATORS = [
    {'k': 'transmission', 'label': 'Transmission proximity',  'score_col': 'tx_score',           'nat_col': 'tx_score_nat',           'source': 'EIA Form 860 + OSM',           'method': 'Centroid-to-line distance (UTM)',             'freq': 'Annual (EIA 860)',                      'confidence': 'High'},
    {'k': 'water',        'label': 'Water availability',      'score_col': 'water_score',         'nat_col': 'water_score_nat',         'source': 'PRISM Climate Group',           'method': 'Nearest-pixel raster lookup',                'freq': '30-yr normals (updated decennially)',   'confidence': 'High'},
    {'k': 'community',    'label': 'Community burden',        'score_col': 'ej_score',            'nat_col': 'ej_score_nat',            'source': 'Census ACS 5-yr',              'method': 'ZCTA-direct (poverty + minority rate)',      'freq': 'Annual (ACS release)',                  'confidence': 'High'},
    {'k': 'seismic',      'label': 'Seismic safety',          'score_col': 'seismic_score',       'nat_col': 'seismic_score_nat',       'source': 'USGS ASCE 7-22',               'method': 'IDW from 60-pt sample per state',            'freq': 'Static (hazard model updates ~5 yr)',   'confidence': 'Medium'},
    {'k': 'flood',        'label': 'Flood safety',            'score_col': 'flood_score',         'nat_col': 'flood_score_nat',         'source': 'FEMA NFHL',                    'method': 'Point-in-polygon (hard gate)',               'freq': 'Continuous (FEMA updates by county)',   'confidence': 'High'},
    {'k': 'contamination','label': 'Contamination distance',  'score_col': 'contamination_score', 'nat_col': 'contamination_score_nat', 'source': 'EPA Toxics Release Inventory', 'method': 'Centroid-to-point distance (UTM)',           'freq': 'Annual (TRI reporting year)',           'confidence': 'High'},
    {'k': 'waterway',     'label': 'Waterway sensitivity',    'score_col': 'waterway_score',      'nat_col': 'waterway_score_nat',      'source': 'OpenStreetMap',                'method': 'Centroid-to-line distance (UTM)',             'freq': 'Static (OSM snapshot)',                 'confidence': 'High'},
    {'k': 'geothermal',   'label': 'Geothermal opportunity',  'score_col': 'geothermal_score',    'nat_col': 'geothermal_score_nat',    'source': 'IHFC GHFDB 2024',              'method': 'IDW (k=8, p=2) from borehole measurements', 'freq': 'Static (2024 release)',                 'confidence': 'Low'},
    {'k': 'flatness',     'label': 'Terrain flatness',        'score_col': 'flatness_score',      'nat_col': 'flatness_score_nat',      'source': 'NASA SRTM1 (AWS S3)',          'method': 'np.gradient slope < 5 deg flat fraction',   'freq': 'Static (SRTM 2000)',                    'confidence': 'Medium'},
    {'k': 'aquifer',      'label': 'Aquifer depth',           'score_col': 'aquifer_score',       'nat_col': 'aquifer_score_nat',       'source': 'USGS NWIS',                    'method': 'IDW (k=8, p=2) from well measurements',    'freq': 'Annual (NWIS field records)',           'confidence': 'Low'},
    {'k': 'soil',         'label': 'Soil suitability',        'score_col': 'soil_score',          'nat_col': 'soil_score_nat',          'source': 'USDA SSURGO (SDM API)',        'method': 'IDW from map-unit centroids (HSG A-D)',     'freq': 'Static (SSURGO vintage)',               'confidence': 'Medium'},
    {'k': 'slope',        'label': 'Slope suitability',       'score_col': 'slope_score',         'nat_col': 'slope_score_nat',         'source': 'NASA SRTM1 (AWS S3)',          'method': 'Mean slope (degrees) within ZCTA bounds',   'freq': 'Static (SRTM 2000)',                    'confidence': 'Medium'},
    {'k': 'pop_exposure', 'label': 'Population exposure',     'score_col': 'pop_exposure_score',  'nat_col': 'pop_exposure_score_nat',  'source': 'Census ACS 5-yr',              'method': 'ZCTA-direct (population density)',          'freq': 'Annual (ACS release)',                  'confidence': 'High'},
    {'k': 'soil_profile', 'label': 'Soil profile chemistry',  'score_col': 'soil_profile_score',  'nat_col': 'soil_profile_score_nat',  'source': 'USDA SSURGO (SDM API)',        'method': 'Depth-weighted horizon composite; IDW',    'freq': 'Static (SSURGO vintage)',               'confidence': 'Medium'},
    {'k': 'ksat',         'label': 'Hydraulic K-sat',         'score_col': 'ksat_score',          'nat_col': 'ksat_score_nat',          'source': 'USDA SSURGO (SDM API)',        'method': 'Thickness-weighted mean K-sat to 150 cm',  'freq': 'Static (SSURGO vintage)',               'confidence': 'Medium'},
    {'k': 'substation',   'label': 'Substation proximity',    'score_col': 'substation_score',    'nat_col': 'substation_score_nat',    'source': 'EIA Form 860',                 'method': 'Centroid-to-point distance + capacity weight', 'freq': 'Annual (EIA 860)',                 'confidence': 'High'},
    {'k': 'superfund',    'label': 'Superfund distance',      'score_col': 'superfund_score',     'nat_col': 'superfund_score_nat',     'source': 'EPA Envirofacts NPL',          'method': 'Centroid-to-point distance (UTM)',          'freq': 'Continuous (NPL updates)',              'confidence': 'High'},
    {'k': 'rcra',         'label': 'RCRA site distance',      'score_col': 'rcra_score',          'nat_col': 'rcra_score_nat',          'source': 'EPA Envirofacts RCRA',         'method': 'Centroid-to-point distance (UTM)',          'freq': 'Annual (RCRA reporting)',               'confidence': 'High'},
    {'k': 'air_quality',  'label': 'Air quality (NAAQS)',     'score_col': 'air_quality_score',   'nat_col': 'air_quality_score_nat',   'source': 'EPA Green Book',               'method': 'Point-in-polygon non-attainment areas',    'freq': 'Continuous (EPA designations)',         'confidence': 'High'},
    {'k': 'fiber',        'label': 'Fiber connectivity',      'score_col': 'fiber_score',         'nat_col': 'fiber_score_nat',         'source': 'PeeringDB /api/fac',           'method': 'Centroid-to-point distance (carrier hotels)', 'freq': 'Static (PeeringDB snapshot)',       'confidence': 'Medium'},
    {'k': 'water_stress', 'label': 'Water stress',            'score_col': 'water_stress_score',  'nat_col': 'water_stress_score_nat',  'source': 'WRI Aqueduct 3.0',             'method': 'Watershed spatial join (HydroBASINS L6)',  'freq': 'Static (2023 release)',                 'confidence': 'Medium'},
    {'k': 'grid_capacity','label': 'Grid capacity',           'score_col': 'grid_capacity_score', 'nat_col': 'grid_capacity_score_nat', 'source': 'EIA Form 860M',                'method': 'State-level ISO queue aggregation',         'freq': 'Monthly (860M planned sheet)',          'confidence': 'Medium'},
]

# ── object storage ─────────────────────────────────────────────────────────────
# Case documents (upload_doc / serve_doc) live in S3-compatible object storage
# in production, or on local disk (DOCS_DIR) in dev. Presence of S3_ENDPOINT is
# what decides which mode is active — see _USE_S3 below.

S3_BUCKET = os.environ.get('S3_BUCKET', 'merascope-docs')
_USE_S3   = bool(os.environ.get('S3_ENDPOINT'))
_s3       = None

def _get_s3():
    """Lazily create and cache the boto3 S3 client (module-level singleton)."""
    global _s3
    if _s3 is None:
        if boto3 is None:
            raise RuntimeError('boto3 not installed — pip install boto3')
        _s3 = boto3.client(
            's3',
            endpoint_url=os.environ.get('S3_ENDPOINT'),
            aws_access_key_id=os.environ.get('S3_ACCESS_KEY', ''),
            aws_secret_access_key=os.environ.get('S3_SECRET_KEY', ''),
            config=BotoConfig(signature_version='s3v4'),
            region_name='us-east-1',
        )
    return _s3
_pool    = None  # module-level ThreadedConnectionPool singleton, created on first use by _get_pool()


# ── connection pool ────────────────────────────────────────────────────────────

def _get_pool():
    """Lazily create and cache the psycopg2 ThreadedConnectionPool (1-10 conns).
    Tests monkeypatch this module's _pool directly to point at a test database."""
    global _pool
    if _pool is None:
        dsn = os.environ.get('DATABASE_URL', 'postgresql://merascope:merascope@localhost/merascope')
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, dsn=dsn)
    return _pool


def _coerce(v):
    """Convert types that JSON can't serialize."""
    if isinstance(v, (datetime, _date)):
        return v.isoformat()
    return v


def _int_arg(v, default):
    """Parse a query-string/JSON int, falling back to default instead of 500ing
    on garbage input (e.g. ?limit=abc)."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _row(row):
    # Apply _coerce to every column of a RealDictCursor row (or pass through None).
    return {k: _coerce(v) for k, v in row.items()} if row else None


class _DB:
    """Wraps a psycopg2 cursor to match the db.execute().fetchall() pattern used throughout."""
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=()):
        # Every call site in this file writes SQLite-style '?' placeholders;
        # translate to psycopg2's '%s' here so the rest of the code never has
        # to think about which DB driver it's talking to. Never write '%s'
        # directly in a SQL string passed to this method — it would break here.
        self._cur.execute(sql.replace('?', '%s'), params or ())
        return self

    def fetchone(self):
        return _row(self._cur.fetchone())

    def fetchall(self):
        return [_row(r) for r in self._cur.fetchall()]

    @property
    def lastrowid(self):
        # psycopg2 has no native lastrowid; every INSERT that needs the new id
        # must append "RETURNING id" and this reads that row. Must be called
        # while the surrounding `with get_db() as db:` block is still open —
        # the cursor is closed on exit and a later call raises InterfaceError.
        row = self._cur.fetchone()
        return row['id'] if row else None


def _session_user():
    """Return {email, role, agency_key} from the mera_sess cookie, or None.

    Non-throwing by design: this is called on nearly every route (including
    fully public ones) just to check "is someone logged in", so a DB hiccup
    or missing/expired cookie should degrade to "anonymous", never a 500."""
    token = request.cookies.get('mera_sess', '')
    if not token:
        return None
    try:
        with get_db() as db:
            return db.execute(
                '''SELECT s.email, r.role, r.agency_key
                   FROM sessions s
                   LEFT JOIN user_roles r ON r.email = s.email
                   WHERE s.token = ? AND s.expires_at > NOW()''',
                (token,)
            ).fetchone()
    except Exception:
        return None


def _can_access_case(user, case_row):
    """Return True if user may read the given REAL case row (dict with case_id
    and owner_email).

    Demo/fixture cases are authorized by their callers (separate endpoints and
    the is_demo branch), so this function governs real cases only: an
    unauthenticated caller is never granted access here. Authorization mirrors
    the write path in _case_write_guard so read and write agree."""
    if user is None:
        return False
    role = user.get('role') or 'builder'
    if role in ('steward', 'admin'):
        return True
    if role == 'co-party':
        # Co-parties see only cases their agency was invited to — same check
        # _case_write_guard enforces, not a blanket role pass.
        agency_key = user.get('agency_key')
        case_id    = (case_row or {}).get('case_id')
        if not agency_key or not case_id:
            return False
        with get_db() as db:
            inv = db.execute(
                'SELECT 1 FROM case_invites WHERE case_id=? AND agency_key=?',
                (case_id, agency_key)
            ).fetchone()
        return bool(inv)
    # builder — only the owner of record
    owner = (case_row or {}).get('owner_email')
    return owner is not None and owner == user['email']


def _next_case_id(db):
    """Mint a unique case id (YY-NNNN) from the case_seq sequence.
    A Postgres SEQUENCE (not COUNT(*)) so ids stay monotonic and collision-free
    even under concurrent requests or after rows are deleted."""
    n = db.execute("SELECT nextval('case_seq') AS n").fetchone()['n']
    return '{}-{}'.format(datetime.now().strftime('%y'), n)


@contextmanager
def get_db():
    """Checkout a pooled connection + RealDictCursor for the duration of a
    `with` block. Commits on clean exit, rolls back and re-raises on any
    exception, and always returns the connection to the pool. Yields a _DB
    wrapper, not the raw cursor — use db.execute(...).fetchone()/.fetchall()."""
    conn = _get_pool().getconn()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield _DB(cur)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        _get_pool().putconn(conn)


# ── schema ─────────────────────────────────────────────────────────────────────

def init_db():
    """Create every table this app needs, then apply idempotent ALTER TABLE
    migrations on top. Runs once at import time (see the try/except at the
    bottom of this file) and is safe to call repeatedly — every statement is
    CREATE TABLE/INDEX IF NOT EXISTS or ADD COLUMN IF NOT EXISTS.

    Ordering matters: every CREATE TABLE for a given table happens before any
    ALTER TABLE that touches it, so a brand-new database (e.g. a fresh test DB)
    initializes cleanly in one pass — an ALTER on a table that doesn't exist
    yet would error. When adding a new migration, append it near the bottom of
    this function, after the CREATE for the table it modifies."""
    with get_db() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS event_log (
            id          SERIAL PRIMARY KEY,
            session_id  TEXT,
            fid         INTEGER,
            event_type  TEXT,
            payload     TEXT,
            ts          TIMESTAMP DEFAULT NOW()
        )''')
        db.execute('CREATE INDEX IF NOT EXISTS idx_session ON event_log(session_id)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_fid     ON event_log(fid)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_type    ON event_log(event_type)')

        # Which agencies (co-parties) are on a case, and how they were invited —
        # either from the pre-registered AGENCY_DIRECTORY (agency_key) or by raw
        # email (invited_email, added later — see the ALTER TABLE below).
        db.execute('''CREATE TABLE IF NOT EXISTS case_invites (
            id          SERIAL PRIMARY KEY,
            case_id     TEXT NOT NULL,
            agency_key  TEXT NOT NULL,
            ts          TIMESTAMP DEFAULT NOW(),
            UNIQUE(case_id, agency_key)
        )''')

        # Proposed/negotiated permit conditions on a case. Co-party proposals
        # land with pending_approval=1 until the lead approves (status flips
        # to 'Proposed') or rejects (row deleted) — see update_condition/
        # delete_condition below.
        db.execute('''CREATE TABLE IF NOT EXISTS case_conditions (
            id                SERIAL PRIMARY KEY,
            case_id           TEXT NOT NULL,
            text              TEXT NOT NULL,
            by                TEXT,
            type              TEXT DEFAULT 'Water',
            status            TEXT DEFAULT 'Proposed',
            pending_approval  INTEGER DEFAULT 0,
            submitted_by_role TEXT DEFAULT 'lead',
            ts                TIMESTAMP DEFAULT NOW()
        )''')

        # Uploaded document metadata; the actual file bytes live in S3 or
        # DOCS_DIR (see the object storage section) keyed by `filename`.
        db.execute('''CREATE TABLE IF NOT EXISTS case_docs (
            id            SERIAL PRIMARY KEY,
            case_id       TEXT NOT NULL,
            filename      TEXT NOT NULL,
            original_name TEXT,
            label         TEXT,
            doc_status    TEXT,
            ts            TIMESTAMP DEFAULT NOW()
        )''')

        # One row per case: rebuttal-cycle deadline + cycle counter, set via
        # set_deadline() and read by the Rebuttal Cycle clock in the case file UI.
        db.execute('''CREATE TABLE IF NOT EXISTS case_meta (
            case_id           TEXT PRIMARY KEY,
            rebuttal_due_date TEXT,
            rebuttal_cycle    INTEGER DEFAULT 1,
            rebuttal_max      INTEGER DEFAULT 3
        )''')

        # The core case-file table: one row per real (non-demo) builder
        # submission or steward-created case. `owner_email` (builder) and
        # `lead_agency` (steward) are what list_cases/_can_access_case scope
        # visibility by. See demo_cases below for the anonymous-submission twin.
        db.execute('''CREATE TABLE IF NOT EXISTS cases (
            id                 SERIAL PRIMARY KEY,
            case_id            TEXT NOT NULL UNIQUE,
            site               TEXT,
            applicant          TEXT,
            score              REAL DEFAULT 0.5,
            stage              TEXT DEFAULT 'Site Inquiry',
            days               INTEGER DEFAULT 0,
            ts                 TIMESTAMP DEFAULT NOW(),
            cell_fid           TEXT,
            state_code         TEXT,
            lat                REAL,
            lon                REAL,
            contact_name       TEXT,
            contact_email      TEXT,
            lead_agency        TEXT,
            notes              TEXT,
            external_permit_id TEXT,
            imported           INTEGER DEFAULT 0,
            agency_tracking_id TEXT,
            confirmed_at       TEXT,
            owner_email        TEXT
        )''')

        # Tracks the current M.STAGES value per case (Site Inquiry -> ... ->
        # Resolution) plus when it last changed — cases.stage is kept in sync
        # too (see set_stage), but this table's `ts` is what steward_inbox's
        # "days stuck in this stage" calculation reads.
        db.execute('''CREATE TABLE IF NOT EXISTS case_stage_overrides (
            case_id TEXT PRIMARY KEY,
            stage   TEXT NOT NULL,
            ts      TIMESTAMP DEFAULT NOW()
        )''')

        # Marks a condition (identified by item_key, an arbitrary client-chosen
        # string) as having been routed to mediation via the impasse register.
        db.execute('''CREATE TABLE IF NOT EXISTS case_impasse_routes (
            id       SERIAL PRIMARY KEY,
            item_key TEXT NOT NULL UNIQUE,
            ts       TIMESTAMP DEFAULT NOW()
        )''')

        # Checklist-item completion state for the Mandated Studies workbench
        # (STUDY_SECTIONS templates in steward2.jsx); (study_name, section_idx)
        # presence = checked.
        db.execute('''CREATE TABLE IF NOT EXISTS study_checks (
            id          SERIAL PRIMARY KEY,
            study_name  TEXT NOT NULL,
            section_idx INTEGER NOT NULL,
            ts          TIMESTAMP DEFAULT NOW(),
            UNIQUE(study_name, section_idx)
        )''')

        # Mandated independent studies. case_id/finding are added later via
        # ALTER TABLE (case_id links a study to one case; finding links it to a
        # specific indicator, used to show a "study mandated" badge on that
        # finding's evidence-record card). NULL case_id = global workbench study.
        db.execute('''CREATE TABLE IF NOT EXISTS studies (
            id    SERIAL PRIMARY KEY,
            name  TEXT NOT NULL UNIQUE,
            body  TEXT,
            due   TEXT,
            ts    TIMESTAMP DEFAULT NOW()
        )''')

        # Standalone litigation tracker (LitigationPage in steward2.jsx) — not
        # linked to a specific case_id, just a flat list of matters.
        db.execute('''CREATE TABLE IF NOT EXISTS litigation (
            id     SERIAL PRIMARY KEY,
            name   TEXT NOT NULL,
            court  TEXT,
            no     TEXT,
            status TEXT DEFAULT 'Active',
            filed  TEXT,
            ts     TIMESTAMP DEFAULT NOW()
        )''')

        # Builder-submitted rebuttal text against findings, shown during the
        # Rebuttal Cycle stage (builder-only write, see permission matrix).
        db.execute('''CREATE TABLE IF NOT EXISTS case_rebuttals (
            id      SERIAL PRIMARY KEY,
            case_id TEXT NOT NULL,
            text    TEXT NOT NULL,
            ts      TIMESTAMP DEFAULT NOW()
        )''')

        # Sales-touch leads captured from the pricing page (POST /api/lead).
        db.execute('''CREATE TABLE IF NOT EXISTS leads (
            id         SERIAL PRIMARY KEY,
            email      TEXT NOT NULL,
            name       TEXT,
            org        TEXT,
            workspace  TEXT,
            tier       TEXT,
            note       TEXT,
            session_id TEXT,
            ts         TIMESTAMP DEFAULT NOW()
        )''')

        # Builder CRM tracker (contacts/activity/notes/status) per saved cell.
        # Keyed on (session_id, fid) — NOT fid alone — so one browser's CRM data
        # for a cell never collides with (or is readable by) another browser's.
        # `state` is an opaque JSON blob written by save_crm/get_crm below.
        db.execute('''CREATE TABLE IF NOT EXISTS crm_state (
            session_id TEXT NOT NULL DEFAULT '',
            fid        TEXT NOT NULL,
            state      TEXT NOT NULL,
            ts         TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (session_id, fid)
        )''')

        # ── magic-link auth tables ──
        # users: one row per email that has ever requested a magic link.
        db.execute('''CREATE TABLE IF NOT EXISTS users (
            email      TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW()
        )''')

        # sessions: the magic-link tokens themselves. A token is both the
        # one-time login link AND (once verified) the long-lived mera_sess
        # cookie value — see auth_request/verify_magic_link.
        db.execute('''CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )''')

        # user_roles: role + agency assignment, seeded manually via SQL (see
        # README "Pre-seed the lead steward" section) — there is no self-serve
        # signup path for steward/co-party roles.
        db.execute('''CREATE TABLE IF NOT EXISTS user_roles (
            email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            role       TEXT NOT NULL,
            agency_key TEXT,
            PRIMARY KEY (email, role)
        )''')

        # ── steward weight templates + zones (gate builders below a minimum
        # score in a locked geographic zone) ──
        db.execute('''CREATE TABLE IF NOT EXISTS steward_templates (
            id           SERIAL PRIMARY KEY,
            agency_key   TEXT NOT NULL,
            name         TEXT NOT NULL,
            weights_json TEXT NOT NULL,
            min_score    REAL DEFAULT 0.40,
            locked       INTEGER DEFAULT 0,
            created_at   TIMESTAMP DEFAULT NOW(),
            updated_at   TIMESTAMP DEFAULT NOW()
        )''')

        # Snapshot of a steward_templates row taken right before every edit or
        # rollback, so weight-template changes have an audit trail (see
        # update_steward_template / rollback_template below).
        db.execute('''CREATE TABLE IF NOT EXISTS template_history (
            id           SERIAL PRIMARY KEY,
            template_id  INTEGER NOT NULL,
            agency_key   TEXT NOT NULL,
            changed_by   TEXT NOT NULL,
            changed_at   TIMESTAMP DEFAULT NOW(),
            weights_json TEXT NOT NULL,
            min_score    REAL NOT NULL,
            locked       INTEGER NOT NULL,
            summary      TEXT NOT NULL
        )''')

        # A geographic area (state / bbox / county / zcta — see zone_type) that
        # a steward has attached a weight template to. When the template is
        # locked, builder cells inside the zone are gate-checked against it
        # (see gate_check / zones_active below).
        db.execute('''CREATE TABLE IF NOT EXISTS steward_zones (
            id           SERIAL PRIMARY KEY,
            agency_key   TEXT NOT NULL,
            name         TEXT NOT NULL,
            zone_type    TEXT NOT NULL DEFAULT 'state',
            state_code   TEXT,
            bbox_json    TEXT,
            county_fips  TEXT,
            zcta_code    TEXT,
            template_id  INTEGER REFERENCES steward_templates(id) ON DELETE SET NULL,
            created_at   TIMESTAMP DEFAULT NOW()
        )''')

        # Monotonic case-number source. Immune to deletes/races, unlike COUNT(*).
        db.execute("CREATE SEQUENCE IF NOT EXISTS case_seq START WITH 1001")

        # ── post-creation migrations (idempotent ALTER TABLE) ──
        db.execute("ALTER TABLE studies ADD COLUMN IF NOT EXISTS case_id TEXT")
        db.execute("ALTER TABLE studies ADD COLUMN IF NOT EXISTS finding TEXT")
        # Original schema had a UNIQUE constraint on studies.name; dropped
        # because case-specific + global studies can legitimately share a name.
        db.execute("ALTER TABLE studies DROP CONSTRAINT IF EXISTS studies_name_key")
        # Scoring weights at submission time, logged for the "Platform defaults"
        # vs "Custom weights" chip in the case file (see _build_report_context
        # and CaseFilePage).
        db.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS weights_json TEXT")
        # Cryptographic record anchor, written once a case reaches Resolution
        # (see _compute_anchor / set_stage). One row per case, upserted.
        db.execute('''CREATE TABLE IF NOT EXISTS case_anchors (
            case_id      TEXT PRIMARY KEY,
            hash         TEXT NOT NULL,
            anchored_at  TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )''')

        # Anonymous/unauthenticated builder submissions land here instead of
        # `cases` — a lightweight, TTL'd (20 min) twin table so the public demo
        # flow never needs a real login. See builder_submit's `if not user`
        # branch and the demo case routes further down.
        db.execute('''CREATE TABLE IF NOT EXISTS demo_cases (
            id            SERIAL PRIMARY KEY,
            case_id       TEXT UNIQUE NOT NULL,
            site          TEXT,
            applicant     TEXT,
            score         REAL DEFAULT 0.5,
            stage         TEXT DEFAULT 'Site Inquiry',
            state_code    TEXT,
            lat           REAL,
            lon           REAL,
            contact_name  TEXT,
            contact_email TEXT,
            lead_agency   TEXT,
            notes         TEXT,
            weights_json  TEXT,
            created_at    TIMESTAMP DEFAULT NOW()
        )''')
        # Migration for pre-existing demo_cases tables that predate weights_json.
        # Must run AFTER the CREATE above so a fresh database doesn't fail here.
        db.execute("ALTER TABLE demo_cases ADD COLUMN IF NOT EXISTS weights_json TEXT")

        # Email invites: co-parties without a directory agency_key are invited
        # by email. agency_key becomes nullable; exactly one of the two is set.
        db.execute("ALTER TABLE case_invites ADD COLUMN IF NOT EXISTS invited_email TEXT")
        db.execute("ALTER TABLE case_invites ALTER COLUMN agency_key DROP NOT NULL")
        db.execute('''CREATE UNIQUE INDEX IF NOT EXISTS idx_case_invites_email
            ON case_invites(case_id, invited_email) WHERE invited_email IS NOT NULL''')
        # Who proposed a condition — needed to notify them on approve/reject.
        db.execute("ALTER TABLE case_conditions ADD COLUMN IF NOT EXISTS submitted_by_email TEXT")

        # CRM was originally keyed by fid alone, so every browser shared (and could
        # read/overwrite) one record per cell. Migrate to a per-session key. Existing
        # rows collapse under session_id='' and become unreachable by scoped reads.
        db.execute("ALTER TABLE crm_state ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL DEFAULT ''")
        db.execute("ALTER TABLE crm_state DROP CONSTRAINT IF EXISTS crm_state_pkey")
        db.execute("ALTER TABLE crm_state ADD PRIMARY KEY (session_id, fid)")

        # Demo submissions must be scoped to the submitting browser session, or the
        # public demo docket leaks every visitor's contact info to every other visitor.
        db.execute("ALTER TABLE demo_cases ADD COLUMN IF NOT EXISTS session TEXT")

        # site_type (see _SITE_TYPES / data.js SITE_TYPES) tags which vertical a
        # template/case is for. Defaults to 'datacenter' on every table so rows
        # that predate this migration (and any payload that omits the field)
        # keep behaving exactly as they did when datacenter was the only vertical.
        db.execute("ALTER TABLE steward_templates ADD COLUMN IF NOT EXISTS site_type TEXT NOT NULL DEFAULT 'datacenter'")
        db.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS site_type TEXT NOT NULL DEFAULT 'datacenter'")
        db.execute("ALTER TABLE demo_cases ADD COLUMN IF NOT EXISTS site_type TEXT NOT NULL DEFAULT 'datacenter'")


# ── event log ─────────────────────────────────────────────────────────────────

@app.route('/api/log', methods=['POST'])
def log_event():
    """Fire-and-forget telemetry sink. The frontend's window.serverLog() posts
    here for every meaningful builder-workspace action (save_cell, status_change,
    contact_add, portfolio_run, etc.) — see CONTEXT.md 'Server-side logging'.
    Feeds the CSV exports below and the admin log viewer. Append-only, rate
    limited per IP so an anonymous flood can't fill the table."""
    if not _check_log_rate(_client_ip()):
        return jsonify({'ok': False, 'err': 'rate limited'}), 429
    data  = request.get_json(silent=True) or {}
    sid   = data.get('session_id')
    fid   = data.get('fid')
    etype = data.get('event_type')
    if not etype:
        return jsonify({'ok': False, 'err': 'event_type required'}), 400
    with get_db() as db:
        db.execute(
            'INSERT INTO event_log (session_id, fid, event_type, payload) VALUES (?,?,?,?)',
            (sid, fid, etype, json.dumps(data.get('payload', {})))
        )
    return jsonify({'ok': True})


# ── lead capture ──────────────────────────────────────────────────────────────
# Pricing-page CTAs post here. Stored in the leads table; a notification email
# goes to LEAD_NOTIFY_EMAIL (falls back to FROM_EMAIL / SMTP_USER) when
# NOTIFY_ENABLED=1, via the same fire-and-forget worker as case notifications.

@app.route('/api/lead', methods=['POST'])
def lead_submit():
    if not _check_lead_rate(_client_ip()):
        return jsonify({'ok': False, 'err': 'Too many requests. Try again later.'}), 429
    data  = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email or len(email) > 254:
        return jsonify({'ok': False, 'err': 'valid email required'}), 400

    def _field(key, cap):
        return str(data.get(key) or '').strip()[:cap]

    name      = _field('name', 120)
    org       = _field('org', 200)
    workspace = _field('workspace', 40)
    tier      = _field('tier', 80)
    note      = _field('note', 2000)
    sid       = _field('session_id', 64)
    with get_db() as db:
        db.execute(
            'INSERT INTO leads (email, name, org, workspace, tier, note, session_id) '
            'VALUES (?,?,?,?,?,?,?)',
            (email, name, org, workspace, tier, note, sid)
        )
    to = os.environ.get('LEAD_NOTIFY_EMAIL',
                        os.environ.get('FROM_EMAIL', os.environ.get('SMTP_USER', '')))
    label = ' / '.join([p for p in (workspace, tier) if p]) or 'general'
    _send_notification(
        to,
        'Merascope lead — {} ({})'.format(label, email),
        'New pricing-page inquiry\n\n'
        'Email:     {}\n'
        'Name:      {}\n'
        'Org:       {}\n'
        'Workspace: {}\n'
        'Tier:      {}\n\n'
        '{}'.format(email, name or '-', org or '-', workspace or '-', tier or '-', note)
    )
    return jsonify({'ok': True})


@app.route('/api/export/workspace')
def export_workspace():
    """CSV export of the caller's saved-cell Workspace (Builder tab 1) — one row
    per unique fid ever saved, latest save_cell event wins ties via the
    "seen" set below since rows are read newest-first. Scope strictly to the
    caller's own session. A missing session_id must NOT fall through to "all
    sessions" — that would export every user's saved sites."""
    sid = (request.args.get('session_id') or '').strip()
    if not sid:
        return jsonify({'ok': False, 'err': 'session_id required'}), 400
    with get_db() as db:
        rows = db.execute(
            '''SELECT * FROM event_log
               WHERE event_type = 'save_cell' AND session_id = ?
               ORDER BY ts DESC''',
            (sid,)
        ).fetchall()

    # Every indicator's national-scale score, not just a hand-picked six.
    nat_cols = [ind['nat_col'] for ind in _REPORT_INDICATORS]
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(['fid', 'session_id', 'state', 'lat', 'lon', 'municipality',
                'nat_composite', 'state_composite', 'state_rank', 'state_rank_total',
                'flat_frac', 'protected_frac', 'flood_score']
               + nat_cols + ['saved_at'])
    seen = set()
    for row in rows:
        fid = row['fid']
        if fid in seen:
            continue
        seen.add(fid)
        p  = json.loads(row['payload'] or '{}')
        pr = p.get('props', {})
        rank = p.get('state_rank') or {}
        w.writerow([
            fid, row['session_id'],
            pr.get('_state'), p.get('lat'), p.get('lon'),
            p.get('municipality'),
            p.get('nat_composite'), p.get('state_composite'),
            rank.get('rank'), rank.get('total'),
            pr.get('flat_frac'), pr.get('protected_frac'), pr.get('flood_score')]
            + [pr.get(c) for c in nat_cols]
            + [row['ts']]
        )

    return Response(
        out.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=merascope_workspace.csv'}
    )


@app.route('/api/export/status')
def export_status():
    """CSV export of the caller's CRM activity (Builder tab 2 — Status/CRM
    tracker): status changes, activity log entries, contact adds/removes, and
    note updates, one row per event_log row. Scope strictly to the caller's
    own session. A missing session_id must NOT fall through to "all
    sessions" — that would export every user's CRM contacts, activity, and
    notes."""
    sid = (request.args.get('session_id') or '').strip()
    if not sid:
        return jsonify({'ok': False, 'err': 'session_id required'}), 400
    with get_db() as db:
        rows = db.execute(
            '''SELECT * FROM event_log
               WHERE event_type IN ('status_change','activity_log','contact_add','contact_remove','note_update')
               AND session_id = ?
               ORDER BY fid, ts''',
            (sid,)
        ).fetchall()

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(['fid', 'session_id', 'event_type', 'event_date', 'detail', 'logged_at'])
    for row in rows:
        p = json.loads(row['payload'] or '{}')
        # Each event_type stores a different payload shape (see serverLog call
        # sites in builder2.jsx); render a human-readable one-line summary per type.
        if row['event_type'] == 'status_change':
            detail = 'Status -> ' + p.get('status', '')
        elif row['event_type'] == 'activity_log':
            detail = p.get('type', '') + ': ' + p.get('summary', '')
        elif row['event_type'] == 'contact_add':
            detail = 'Added: ' + p.get('name', '') + ' (' + p.get('org', '') + ')'
        elif row['event_type'] == 'contact_remove':
            detail = 'Removed contact id=' + str(p.get('contact_id', ''))
        elif row['event_type'] == 'note_update':
            detail = p.get('notes', '')[:300]
        else:
            detail = ''
        w.writerow([row['fid'], row['session_id'], row['event_type'],
                    p.get('date', ''), detail, row['ts']])

    return Response(
        out.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=merascope_status.csv'}
    )


@app.route('/api/admin/log')
def admin_log():
    """Raw event_log viewer for debugging, gated by a shared secret query param
    (?key=...) rather than session auth — not tied to any user role.
    Fail closed: with no MERA_ADMIN_KEY configured the endpoint is disabled
    entirely, rather than falling back to a guessable shared default."""
    admin_key = os.environ.get('MERA_ADMIN_KEY')
    key = request.args.get('key', '')
    if not admin_key or not secrets.compare_digest(key, admin_key):
        return jsonify({'err': 'forbidden'}), 403
    sid   = request.args.get('session_id')
    etype = request.args.get('event_type')
    # Built with raw '%s' (not '?') since the filter clauses are optional and
    # assembled dynamically — _DB.execute's '?'->'%s' replace is a no-op here,
    # this is just psycopg2's native paramstyle used directly.
    q = 'SELECT * FROM event_log WHERE 1=1'
    params = []
    if sid:   q += ' AND session_id=%s'; params.append(sid)
    if etype: q += ' AND event_type=%s'; params.append(etype)
    q += ' ORDER BY ts DESC LIMIT 500'
    with get_db() as db:
        rows = db.execute(q, params).fetchall()
    return jsonify(rows)


# ── invites ───────────────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/invites')
def get_invites(case_id):
    """List co-parties invited to a case, as a flat list of display strings
    (directory agency_key, or the raw email for an email-only invite)."""
    err = _case_write_guard(case_id)
    if err:
        return err
    with get_db() as db:
        rows = db.execute(
            'SELECT agency_key, invited_email FROM case_invites WHERE case_id=? ORDER BY ts',
            (case_id,)
        ).fetchall()
    return jsonify([r['agency_key'] or r['invited_email'] for r in rows])

@app.route('/api/case/<case_id>/invite', methods=['POST'])
def add_invite(case_id):
    """Invite a co-party to a case, either by AGENCY_DIRECTORY key (lead picks
    from the searchable directory modal) or by raw email (fallback for
    unregistered agencies). Exactly one of the two is stored per row — see the
    case_invites schema note above. Email invites also fire a notification."""
    err = _case_write_guard(case_id)
    if err:
        return err
    data  = request.get_json(silent=True) or {}
    key   = (data.get('agency_key') or '').strip()
    email = (data.get('email') or '').strip().lower()
    if not key and not email:
        return jsonify({'ok': False, 'err': 'agency_key or email required'}), 400
    if not key and '@' not in email:
        return jsonify({'ok': False, 'err': 'valid email required'}), 400
    with get_db() as db:
        if key:
            db.execute(
                'INSERT INTO case_invites (case_id, agency_key) VALUES (?,?) ON CONFLICT DO NOTHING',
                (case_id, key)
            )
        else:
            dup = db.execute(
                'SELECT 1 FROM case_invites WHERE case_id=? AND invited_email=?',
                (case_id, email)
            ).fetchone()
            if not dup:
                db.execute(
                    'INSERT INTO case_invites (case_id, invited_email) VALUES (?,?)',
                    (case_id, email)
                )
    if email and not key:
        _send_notification(
            email,
            'You have been invited to a Merascope case',
            'Your agency has been invited as a co-party on case {} in Merascope.\n\n'
            'Sign in with this email address to participate:\n{}/#/login\n\n'
            '-- Merascope'.format(case_id, APP_URL)
        )
    return jsonify({'ok': True})


def _haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km between two lat/lon points. Pure Python
    (no GDAL/geopandas) — deliberate, per the project's no-GDAL rule."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.asin(math.sqrt(a))

@app.route('/api/case/<case_id>/nearby')
def nearby_cases(case_id):
    """Cases within radius_km of this case's site that share the same lead
    agency, for the case-file "Nearby cases" panel. Excludes the case itself
    and anything already at Resolution. Access is authorized on the ORIGIN
    case only, so the response is deliberately stripped to map-safe fields —
    never the neighbor's applicant contact info (see comment below)."""
    err = _case_write_guard(case_id)
    if err:
        return err
    try:
        radius_km = float(request.args.get('radius_km', 5))
    except ValueError:
        radius_km = 5.0
    with get_db() as db:
        origin = db.execute(
            'SELECT lat, lon, lead_agency FROM cases WHERE case_id=?', (case_id,)
        ).fetchone()
        if not origin or origin['lat'] is None or origin['lon'] is None:
            return jsonify([])
        candidates = db.execute(
            '''SELECT * FROM cases
               WHERE case_id != ? AND lat IS NOT NULL AND lon IS NOT NULL
                 AND stage != 'Resolution' AND lead_agency = ?''',
            (case_id, origin['lead_agency'])
        ).fetchall()
    # Only the fields the proximity map needs. The caller is authorized on the
    # ORIGIN case, not on these neighbors, so never return applicant PII
    # (contact_email, owner_email, notes) for cases they aren't party to.
    out = []
    for c in candidates:
        dist = _haversine_km(origin['lat'], origin['lon'], c['lat'], c['lon'])
        if dist <= radius_km:
            out.append({
                'case_id':     c['case_id'],
                'site':        c['site'],
                'lat':         c['lat'],
                'lon':         c['lon'],
                'stage':       c['stage'],
                'lead_agency': c['lead_agency'],
                'distance_km': round(dist, 2),
            })
    out.sort(key=lambda r: r['distance_km'])
    return jsonify(out)


# ── conditions ────────────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/conditions')
def get_conditions(case_id):
    """All proposed/negotiated conditions on a case, in insertion order."""
    err = _case_write_guard(case_id)
    if err:
        return err
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_conditions WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify(rows)

@app.route('/api/case/<case_id>/conditions', methods=['POST'])
def add_condition(case_id):
    """Propose a new condition. Lead-proposed conditions are live immediately;
    co-party proposals carry pending_approval=1 and show as "Pending lead
    approval" until update_condition's approve path clears the flag."""
    err = _case_write_guard(case_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    user = _session_user()
    with get_db() as db:
        cur = db.execute(
            '''INSERT INTO case_conditions
               (case_id, text, by, type, status, pending_approval, submitted_by_role,
                submitted_by_email)
               VALUES (?,?,?,?,?,?,?,?) RETURNING id''',
            (case_id, data.get('text', ''), data.get('by', ''), data.get('type', 'Water'),
             data.get('status', 'Proposed'), 1 if data.get('pending_approval') else 0,
             data.get('submitted_by_role', 'lead'),
             user['email'] if user else None)
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})


def _condition_submitter(db, case_id, cond_id):
    # Only pending co-party proposals warrant an approve/decline notification;
    # a lead editing or removing its own conditions should not email anyone.
    row = db.execute(
        '''SELECT submitted_by_email, text FROM case_conditions
           WHERE id=? AND case_id=? AND pending_approval=1''',
        (cond_id, case_id)
    ).fetchone()
    return (row['submitted_by_email'], row['text']) if row else (None, None)


@app.route('/api/case/<case_id>/conditions/<int:cond_id>', methods=['PATCH'])
def update_condition(case_id, cond_id):
    """Two distinct things can happen here depending on the payload: `approve`
    clears pending_approval on a co-party proposal and notifies the proposer;
    `status` is a plain status-dropdown change (lead editing any condition,
    e.g. moving one to 'Impasse') and never notifies anyone."""
    err = _case_write_guard(case_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    submitter = None
    cond_text = None
    with get_db() as db:
        if data.get('approve'):
            submitter, cond_text = _condition_submitter(db, case_id, cond_id)
            db.execute(
                'UPDATE case_conditions SET pending_approval=0, status=? WHERE id=? AND case_id=?',
                ('Proposed', cond_id, case_id)
            )
        elif 'status' in data:
            db.execute(
                'UPDATE case_conditions SET status=? WHERE id=? AND case_id=?',
                (data['status'], cond_id, case_id)
            )
    if submitter:
        _send_notification(
            submitter,
            'Your proposed condition was approved — case {}'.format(case_id),
            'The lead agency approved your proposed condition on case {}:\n\n'
            '"{}"\n\nView the case: {}/#/co-party/case/{}\n\n'
            '-- Merascope'.format(case_id, cond_text, APP_URL, case_id)
        )
    return jsonify({'ok': True})

@app.route('/api/case/<case_id>/conditions/<int:cond_id>', methods=['DELETE'])
def delete_condition(case_id, cond_id):
    """Remove a condition. When it was a pending co-party proposal, this is a
    reject — capture the submitter before deleting so we can notify them."""
    err = _case_write_guard(case_id)
    if err:
        return err
    with get_db() as db:
        submitter, cond_text = _condition_submitter(db, case_id, cond_id)
        db.execute('DELETE FROM case_conditions WHERE id=? AND case_id=?', (cond_id, case_id))
    if submitter:
        _send_notification(
            submitter,
            'Your proposed condition was declined — case {}'.format(case_id),
            'The lead agency declined your proposed condition on case {}:\n\n'
            '"{}"\n\nView the case: {}/#/co-party/case/{}\n\n'
            '-- Merascope'.format(case_id, cond_text, APP_URL, case_id)
        )
    return jsonify({'ok': True})


# ── documents ─────────────────────────────────────────────────────────────────

def _case_write_guard(case_id):
    """
    Guard mutations on a case. Returns an (response, status) error tuple to
    abort, or None to allow.

    Demo cases (``demo-*`` ids) and the handful of static frontend fixture ids
    (``_DEMO_FIXTURE_IDS``) stay open so the public demo keeps working. Any other
    id with no row in ``cases`` requires a real session — otherwise an anonymous
    caller could write to arbitrary made-up case ids. For a real case row, require
    an authenticated user who is the owner, a steward/admin, or a co-party invited
    to that case.
    """
    if case_id.startswith('demo-'):
        return None
    with get_db() as db:
        row = db.execute(
            'SELECT owner_email FROM cases WHERE case_id=?', (case_id,)
        ).fetchone()
    if not row:
        if case_id in _DEMO_FIXTURE_IDS:
            return None  # static frontend fixture — open for the public demo
        # Unknown id with no backing row: don't let anonymous callers write to it.
        if not _session_user():
            return jsonify({'ok': False, 'err': 'authentication required'}), 401
        return jsonify({'ok': False, 'err': 'forbidden'}), 403
    user = _session_user()
    if not user:
        return jsonify({'ok': False, 'err': 'authentication required'}), 401
    role = user.get('role') or 'builder'
    if role in ('steward', 'admin'):
        return None
    if role == 'builder' and row.get('owner_email') and row['owner_email'] == user['email']:
        return None
    if role == 'co-party' and user.get('agency_key'):
        with get_db() as db:
            inv = db.execute(
                'SELECT 1 FROM case_invites WHERE case_id=? AND agency_key=?',
                (case_id, user['agency_key'])
            ).fetchone()
        if inv:
            return None
    return jsonify({'ok': False, 'err': 'forbidden'}), 403


def _require_steward_or_admin():
    """Return an error tuple unless the caller is a steward or admin."""
    user = _session_user()
    role = (user or {}).get('role')
    if role not in ('steward', 'admin'):
        return jsonify({'ok': False, 'err': 'steward role required'}), 403
    return None


@app.route('/api/case/<case_id>/docs')
def get_docs(case_id):
    """List a case's uploaded documents (metadata only — file bytes are
    fetched separately via serve_doc)."""
    err = _case_write_guard(case_id)
    if err:
        return err
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_docs WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify([{
        'id': r['id'], 'name': r['original_name'],
        'filename': r['filename'], 'date': (r['ts'] or '')[:10],
        'label': r['label'] or '', 'doc_status': r['doc_status'] or 'Achieved'
    } for r in rows])

@app.route('/api/case/<case_id>/docs', methods=['POST'])
def upload_doc(case_id):
    """Upload a document to the case's document chain, storing to S3 or local
    disk depending on _USE_S3. Note this is stricter than _case_write_guard
    alone: file upload always requires a real session — even for demo/fixture
    ids — so anonymous callers can't push arbitrary files into object storage."""
    err = _case_write_guard(case_id)
    if err:
        return err
    if not _session_user():
        return jsonify({'ok': False, 'err': 'authentication required'}), 401
    if 'file' not in request.files:
        return jsonify({'ok': False, 'err': 'no file'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'ok': False, 'err': 'empty filename'}), 400
    safe       = secure_filename(f.filename)
    label      = (request.form.get('label') or '').strip()
    doc_status = (request.form.get('doc_status') or 'Achieved').strip()
    # unique storage name — short hex prefix removes collision risk without DB lookup
    stored = '{}-{}'.format(secrets.token_hex(4), safe)
    if _USE_S3:
        key = '{}/{}'.format(case_id, stored)
        _get_s3().upload_fileobj(
            f.stream, S3_BUCKET, key,
            ExtraArgs={
                'ContentType':        f.content_type or 'application/octet-stream',
                'ContentDisposition': 'attachment; filename="{}"'.format(f.filename),
            }
        )
    else:
        case_dir = os.path.join(DOCS_DIR, case_id)
        os.makedirs(case_dir, exist_ok=True)
        f.save(os.path.join(case_dir, stored))
    with get_db() as db:
        db.execute(
            'INSERT INTO case_docs (case_id, filename, original_name, label, doc_status) VALUES (?,?,?,?,?)',
            (case_id, stored, f.filename, label, doc_status)
        )
    return jsonify({'ok': True, 'filename': stored, 'name': f.filename})

@app.route('/api/case/<case_id>/docs/<filename>')
def serve_doc(case_id, filename):
    """Fetch a previously uploaded document. In S3 mode, redirects to a
    short-lived presigned URL rather than proxying bytes through Flask."""
    err = _case_write_guard(case_id)
    if err:
        return err
    safe = secure_filename(filename)
    if _USE_S3:
        key = '{}/{}'.format(case_id, safe)
        url = _get_s3().generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': key},
            ExpiresIn=900,  # 15 minutes
        )
        return redirect(url)
    return send_from_directory(os.path.join(DOCS_DIR, case_id), safe)


# ── rebuttal deadline ─────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/deadline')
def get_deadline(case_id):
    """Days remaining on the current rebuttal cycle, for the countdown badge
    shown on a case's page. Returns None if no deadline has been set yet."""
    err = _case_write_guard(case_id)
    if err:
        return err
    with get_db() as db:
        row = db.execute('SELECT * FROM case_meta WHERE case_id=?', (case_id,)).fetchone()
    if not row or not row['rebuttal_due_date']:
        return jsonify(None)
    try:
        due  = _date.fromisoformat(row['rebuttal_due_date'])
        days = max(0, (due - _date.today()).days)
    except ValueError:
        return jsonify(None)
    return jsonify({'days': days, 'cycle': row['rebuttal_cycle'], 'max_cycles': row['rebuttal_max']})

@app.route('/api/case/<case_id>/deadline', methods=['POST'])
def set_deadline(case_id):
    """Set/update the rebuttal deadline for a case. Upserts into case_meta
    (one row per case_id) so re-setting a deadline overwrites the prior one."""
    err = _case_write_guard(case_id)
    if err:
        return err
    data  = request.get_json(silent=True) or {}
    due   = data.get('due_date', '')
    cycle = _int_arg(data.get('cycle'), 1)
    max_c = _int_arg(data.get('max_cycles'), 3)
    with get_db() as db:
        db.execute(
            '''INSERT INTO case_meta (case_id, rebuttal_due_date, rebuttal_cycle, rebuttal_max)
               VALUES (?,?,?,?)
               ON CONFLICT (case_id) DO UPDATE SET
                 rebuttal_due_date = EXCLUDED.rebuttal_due_date,
                 rebuttal_cycle    = EXCLUDED.rebuttal_cycle,
                 rebuttal_max      = EXCLUDED.rebuttal_max''',
            (case_id, due, cycle, max_c)
        )
    return jsonify({'ok': True})


# ── dynamic case files ────────────────────────────────────────────────────────

@app.route('/api/cases')
def list_cases():
    """Paginated case list, scoped per persona: a builder sees only their own
    submissions (by owner_email), a steward sees their agency's docket (by
    lead_agency), a co-party sees cases they were invited into (via
    case_invites), and an admin sees everything. Unauthenticated callers get
    an empty list rather than an error, so the frontend can render gracefully."""
    user   = _session_user()
    role   = (user or {}).get('role') or ('builder' if user else None)
    limit  = min(_int_arg(request.args.get('limit'), 50), 200)
    offset = max(_int_arg(request.args.get('offset'), 0), 0)
    # Never expose the full case list to an unauthenticated caller.
    if not user:
        return jsonify({'cases': [], 'total': 0, 'limit': limit, 'offset': offset})
    with get_db() as db:
        if user and role == 'builder':
            total = db.execute(
                'SELECT COUNT(*) as n FROM cases WHERE owner_email=?', (user['email'],)
            ).fetchone()['n']
            rows = db.execute(
                'SELECT * FROM cases WHERE owner_email=? ORDER BY ts DESC LIMIT ? OFFSET ?',
                (user['email'], limit, offset)
            ).fetchall()
        elif user and role == 'steward' and user.get('agency_key'):
            total = db.execute(
                'SELECT COUNT(*) as n FROM cases WHERE lead_agency=?',
                (user['agency_key'],)
            ).fetchone()['n']
            rows = db.execute(
                'SELECT * FROM cases WHERE lead_agency=? ORDER BY ts DESC LIMIT ? OFFSET ?',
                (user['agency_key'], limit, offset)
            ).fetchall()
        elif user and role == 'admin':
            total = db.execute('SELECT COUNT(*) as n FROM cases').fetchone()['n']
            rows  = db.execute(
                'SELECT * FROM cases ORDER BY ts DESC LIMIT ? OFFSET ?',
                (limit, offset)
            ).fetchall()
        elif user and role == 'co-party' and user.get('agency_key'):
            total = db.execute(
                '''SELECT COUNT(*) as n FROM cases c
                   JOIN case_invites ci ON ci.case_id = c.case_id
                   WHERE ci.agency_key = ?''',
                (user['agency_key'],)
            ).fetchone()['n']
            rows = db.execute(
                '''SELECT c.* FROM cases c
                   JOIN case_invites ci ON ci.case_id = c.case_id
                   WHERE ci.agency_key = ?
                   ORDER BY c.ts DESC LIMIT ? OFFSET ?''',
                (user['agency_key'], limit, offset)
            ).fetchall()
        else:
            # Authenticated but with an incomplete role (e.g. steward/co-party
            # with no agency_key). Scope to nothing rather than leak all cases.
            total = 0
            rows  = []
    return jsonify({'cases': rows, 'total': total, 'limit': limit, 'offset': offset})


STUCK_DAYS_THRESHOLD = 21
DUE_SOON_DAYS        = 7

@app.route('/api/steward/inbox')
def steward_inbox():
    """Triage view for a permitter with a large caseload: overdue items, items
    due soon, new inbound inquiries (oldest first), and cases stuck in their
    current stage. Scoped to the caller's agency the same way list_cases is."""
    user = _session_user()
    role = (user or {}).get('role')
    if not user or role not in ('steward', 'admin'):
        return jsonify({'ok': False, 'err': 'steward or admin required'}), 401

    agency_key = user.get('agency_key')
    if role == 'steward' and not agency_key:
        return jsonify({'overdue': [], 'due_soon': [], 'new_inquiries': [], 'stuck': []})

    agency_clause = 'WHERE c.lead_agency = ?' if role == 'steward' else ''
    agency_params = (agency_key,) if role == 'steward' else ()

    with get_db() as db:
        # Deadline-bearing cases: rebuttal deadlines (case_meta) and mandated
        # study deadlines (studies.case_id), unioned and joined back to cases.
        deadline_rows = db.execute(
            '''SELECT c.*, d.due_date, d.kind FROM cases c
               JOIN (
                 SELECT case_id, rebuttal_due_date AS due_date, 'rebuttal' AS kind
                 FROM case_meta WHERE rebuttal_due_date IS NOT NULL AND rebuttal_due_date != ''
                 UNION ALL
                 SELECT case_id, due AS due_date, 'study' AS kind
                 FROM studies WHERE case_id IS NOT NULL AND due IS NOT NULL AND due != ''
               ) d ON d.case_id = c.case_id
               {}'''.format(agency_clause),
            agency_params
        ).fetchall()

        new_inquiries = db.execute(
            '''SELECT * FROM cases c {} {} stage = 'Site Inquiry'
               ORDER BY ts ASC LIMIT 50'''.format(
                agency_clause, 'AND' if agency_clause else 'WHERE'
            ),
            agency_params
        ).fetchall()

        # days-in-current-stage: prefer case_stage_overrides.ts (set on every
        # stage PATCH — see set_stage) and fall back to case creation time for
        # cases that have never had an explicit stage transition recorded.
        stuck_rows = db.execute(
            '''SELECT c.*,
                      EXTRACT(DAY FROM NOW() - COALESCE(cso.ts, c.ts))::int AS days_in_stage
               FROM cases c
               LEFT JOIN case_stage_overrides cso ON cso.case_id = c.case_id
               {} {} c.stage NOT IN ('Resolution')
               ORDER BY days_in_stage DESC'''.format(
                agency_clause, 'AND' if agency_clause else 'WHERE'
            ),
            agency_params
        ).fetchall()

    today    = _date.today()
    overdue  = []
    due_soon = []
    for row in deadline_rows:
        try:
            due = _date.fromisoformat(row['due_date'])
        except (ValueError, TypeError):
            continue
        delta = (due - today).days
        entry = dict(row)
        entry['days_until_due'] = delta
        if delta < 0:
            overdue.append(entry)
        elif delta <= DUE_SOON_DAYS:
            due_soon.append(entry)
    overdue.sort(key=lambda r: r['days_until_due'])
    due_soon.sort(key=lambda r: r['days_until_due'])

    stuck = [r for r in stuck_rows if (r.get('days_in_stage') or 0) > STUCK_DAYS_THRESHOLD]

    return jsonify({
        'overdue': overdue,
        'due_soon': due_soon,
        'new_inquiries': new_inquiries,
        'stuck': stuck,
    })


@app.route('/api/cases', methods=['POST'])
def create_case():
    """Steward-initiated case creation (as opposed to builder_submit below,
    which is the builder-initiated path). Used when a permitter wants to open
    a case file directly rather than waiting for an inbound builder inquiry."""
    err = _require_steward_or_admin()
    if err:
        return err
    data      = request.get_json(silent=True) or {}
    site      = (data.get('site') or '').strip()
    applicant = (data.get('applicant') or '').strip()
    score     = float(data.get('score', 0.5))
    if not site or not applicant:
        return jsonify({'ok': False, 'err': 'site and applicant required'}), 400
    # Stamp the creating agency/owner so the case shows up in the steward's own
    # list_cases and inbox (both scope by lead_agency); without this the row is
    # invisible to everyone but admin.
    user = _session_user() or {}
    with get_db() as db:
        case_id = _next_case_id(db)
        db.execute(
            '''INSERT INTO cases (case_id, site, applicant, score, stage,
                                  lead_agency, owner_email)
               VALUES (?,?,?,?,?,?,?)''',
            (case_id, site, applicant, score, 'Site Inquiry',
             user.get('agency_key'), user.get('email'))
        )
    return jsonify({'ok': True, 'case_id': case_id})

@app.route('/api/builder/submit', methods=['POST'])
def builder_submit():
    """Builder-facing site-inquiry submission — the main entry point into the
    permitting flow from the Explorer/Builder UI. Branches on whether the
    caller is a logged-in user: authenticated submissions become a real,
    durable row in `cases`; anonymous (not-logged-in) submissions are treated
    as a throwaway demo and written to the TTL'd `demo_cases` table instead,
    tagged 'demo-<hex>' so they're visually and structurally distinguishable
    and expire instead of cluttering a steward's real docket."""
    data               = request.get_json(silent=True) or {}
    site               = (data.get('site') or '').strip()
    applicant          = (data.get('applicant') or '').strip()
    contact_email      = (data.get('contact_email') or '').strip()
    if not site or not applicant or not contact_email:
        return jsonify({'ok': False, 'err': 'site, applicant, and contact_email required'}), 400
    score              = float(data.get('score', 0.5))
    cell_fid           = data.get('cell_fid')
    state_code         = data.get('state_code')
    lat                = data.get('lat')
    lon                = data.get('lon')
    contact_name       = (data.get('contact_name') or '').strip()
    lead_agency        = (data.get('lead_agency') or '').strip()
    notes              = (data.get('notes') or '').strip()
    external_permit_id = (data.get('external_permit_id') or '').strip()
    stage              = (data.get('stage') or 'Site Inquiry').strip()
    imported    = 1 if data.get('imported') else 0
    raw_weights = data.get('weights') or {}
    weights_json = json.dumps({k: float(v) for k, v in raw_weights.items()}) if raw_weights else None
    # Which vertical this submission was built under (see _SITE_TYPES) —
    # defaults to 'datacenter' for any payload that omits it, same fallback
    # _weights_for_site_type uses.
    site_type   = data.get('site_type') if data.get('site_type') in _SITE_TYPES else DEFAULT_SITE_TYPE
    user        = _session_user()

    # Anonymous caller: park the submission in demo_cases (short TTL, never
    # joins the real docket) rather than creating a durable case record.
    if not user:
        demo_id     = 'demo-{}'.format(secrets.token_hex(4))
        demo_session = (data.get('session_id') or '').strip()
        with get_db() as db:
            db.execute(
                '''INSERT INTO demo_cases
                   (case_id, site, applicant, score, stage, state_code, lat, lon,
                    contact_name, contact_email, lead_agency, notes, weights_json, session, site_type)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (demo_id, site, applicant, score, stage, state_code, lat, lon,
                 contact_name, contact_email, lead_agency, notes, weights_json, demo_session, site_type)
            )
        return jsonify({'ok': True, 'case_id': demo_id, 'is_demo': True})

    owner_email = user['email']

    with get_db() as db:
        case_id = _next_case_id(db)
        db.execute(
            '''INSERT INTO cases
               (case_id, site, applicant, score, stage,
                cell_fid, state_code, lat, lon,
                contact_name, contact_email, lead_agency, notes,
                external_permit_id, imported, owner_email, weights_json, site_type)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (case_id, site, applicant, score, stage,
             cell_fid, state_code, lat, lon,
             contact_name, contact_email, lead_agency, notes,
             external_permit_id, imported, owner_email, weights_json, site_type)
        )
    return jsonify({'ok': True, 'case_id': case_id})

@app.route('/api/steward/bulk_import', methods=['POST'])
def bulk_import():
    """Bulk-create case files from a permitter's own spreadsheet of existing
    applications (not new inbound leads — so stage defaults to Intake, not
    Site Inquiry). A bad row is reported but does not fail the whole batch."""
    err = _require_steward_or_admin()
    if err:
        return err
    user = _session_user()
    data = request.get_json(silent=True) or {}
    rows = data.get('rows') or []
    if not isinstance(rows, list) or not rows:
        return jsonify({'ok': False, 'err': 'rows required'}), 400

    default_agency = (user.get('agency_key') or '').strip()
    created = []
    errors  = []
    with get_db() as db:
        for i, row in enumerate(rows):
            site      = (row.get('site') or '').strip()
            applicant = (row.get('applicant') or '').strip()
            if not site or not applicant:
                errors.append({'row': i, 'err': 'site and applicant required'})
                continue
            try:
                lat = float(row['lat']) if row.get('lat') not in (None, '') else None
                lon = float(row['lon']) if row.get('lon') not in (None, '') else None
            except (TypeError, ValueError):
                errors.append({'row': i, 'err': 'invalid lat/lon'})
                continue
            case_id = _next_case_id(db)
            db.execute(
                '''INSERT INTO cases
                   (case_id, site, applicant, score, stage, lat, lon,
                    contact_name, contact_email, lead_agency, notes,
                    external_permit_id, imported, owner_email)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (case_id, site, applicant, float(row.get('score', 0.5)), 'Intake', lat, lon,
                 (row.get('contact_name') or '').strip(), (row.get('contact_email') or '').strip(),
                 (row.get('lead_agency') or '').strip() or default_agency, (row.get('notes') or '').strip(),
                 (row.get('external_permit_id') or '').strip(), 1, user['email'])
            )
            created.append(case_id)
    return jsonify({'ok': True, 'created': len(created), 'case_ids': created, 'errors': errors})

@app.route('/api/builder/case/<case_id>/confirm', methods=['PATCH'])
def confirm_case(case_id):
    """Steward action: acknowledge a builder's site inquiry, stamp it with the
    agency's own tracking number, and advance the case from Site Inquiry to
    Intake. Notifies the builder by email so they know their submission was
    seen (not just sitting silently in a queue)."""
    err = _case_write_guard(case_id)
    if err:
        return err
    data     = request.get_json(silent=True) or {}
    tracking = (data.get('agency_tracking_id') or '').strip()
    now      = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    with get_db() as db:
        db.execute(
            'UPDATE cases SET agency_tracking_id=?, confirmed_at=?, stage=? WHERE case_id=?',
            (tracking, now, 'Intake', case_id)
        )
        db.execute(
            '''INSERT INTO case_stage_overrides (case_id, stage) VALUES (?,?)
               ON CONFLICT (case_id) DO UPDATE SET stage=EXCLUDED.stage, ts=NOW()''',
            (case_id, 'Intake')
        )
        row = db.execute(
            'SELECT site, owner_email, contact_email FROM cases WHERE case_id=?', (case_id,)
        ).fetchone()
    if row:
        _send_notification(
            row['owner_email'] or row['contact_email'],
            'Your site inquiry was received — case {}'.format(case_id),
            'The lead agency confirmed your site inquiry for {} and opened a case file.\n\n'
            'Agency tracking number: {}\n\n'
            'Track your case: {}/#/builder/case/{}\n\n'
            '-- Merascope'.format(row['site'] or case_id, tracking or 'pending', APP_URL, case_id)
        )
    return jsonify({'ok': True, 'agency_tracking_id': tracking, 'confirmed_at': now})

@app.route('/api/builder/case/<case_id>')
def get_builder_case(case_id):
    """Full detail view for a single case, used by the Builder Workspace case
    page. Includes the anchor (hash/timestamp) if the case has reached
    Resolution and been cryptographically anchored."""
    user = _session_user()
    with get_db() as db:
        row = db.execute('SELECT * FROM cases WHERE case_id=?', (case_id,)).fetchone()
    if not row:
        return jsonify({'ok': False, 'err': 'not found'}), 404
    if not _can_access_case(user, row):
        return jsonify({'ok': False, 'err': 'not found'}), 404
    r = dict(row)
    if r.get('weights_json'):
        r['weights'] = json.loads(r.pop('weights_json'))
    else:
        r.pop('weights_json', None)
    with get_db() as db:
        anchor = db.execute(
            'SELECT hash, anchored_at FROM case_anchors WHERE case_id=?', (case_id,)
        ).fetchone()
    if anchor:
        r['anchor'] = {'hash': anchor['hash'], 'anchored_at': anchor['anchored_at']}
    return jsonify(r)


@app.route('/api/case/<case_id>/anchor')
def get_anchor(case_id):
    """Fetch the anchor record (hash + the exact canonical payload it was
    computed over) for the evidentiary-record UI. 404s with a friendly message
    if the case hasn't reached Resolution yet — anchoring is one-time and
    happens automatically on that stage transition (see _compute_anchor)."""
    user = _session_user()
    with get_db() as db:
        row = db.execute('SELECT * FROM cases WHERE case_id=?', (case_id,)).fetchone()
        if not row or not _can_access_case(user, row):
            return jsonify({'ok': False, 'err': 'not found'}), 404
        anchor = db.execute(
            'SELECT hash, anchored_at, payload_json FROM case_anchors WHERE case_id=?',
            (case_id,)
        ).fetchone()
    if not anchor:
        return jsonify({'ok': False, 'err': 'Record not yet anchored — advance to Resolution to anchor.'}), 404
    return jsonify({
        'case_id':     case_id,
        'hash':        anchor['hash'],
        'anchored_at': anchor['anchored_at'],
        'algorithm':   'SHA-256',
        'payload':     json.loads(anchor['payload_json']),
    })


# ── builder CRM ───────────────────────────────────────────────────────────────

@app.route('/api/crm/<fid>')
def get_crm(fid):
    """Load the builder's saved CRM notes/status for one ZCTA cell (fid).
    CRM is private per browser session. No session id → nothing to return
    (never fall back to a global per-cell record)."""
    sid = (request.args.get('session_id') or '').strip()
    if not sid:
        return jsonify(None)
    with get_db() as db:
        row = db.execute(
            'SELECT state FROM crm_state WHERE session_id=? AND fid=?', (sid, fid)
        ).fetchone()
    return jsonify(json.loads(row['state']) if row else None)

@app.route('/api/crm/<fid>', methods=['POST'])
def save_crm(fid):
    """Upsert the builder's CRM state (notes, follow-up status, etc.) for one
    ZCTA cell, scoped to their browser session."""
    data = request.get_json(silent=True) or {}
    sid  = (data.get('session_id') or request.args.get('session_id') or '').strip()
    if not sid:
        return jsonify({'ok': False, 'err': 'session_id required'}), 400
    # Don't persist the routing session id inside the stored blob.
    payload = {k: v for k, v in data.items() if k != 'session_id'}
    with get_db() as db:
        db.execute(
            '''INSERT INTO crm_state (session_id, fid, state) VALUES (?,?,?)
               ON CONFLICT (session_id, fid) DO UPDATE SET state=EXCLUDED.state, ts=NOW()''',
            (sid, fid, json.dumps(payload))
        )
    return jsonify({'ok': True})


# ── record anchoring ──────────────────────────────────────────────────────────

def _compute_anchor(db, case_id):
    """Build canonical JSON for a case and return (sha256_hex, canonical_str)."""
    case = db.execute('SELECT * FROM cases WHERE case_id=?', (case_id,)).fetchone()
    if not case:
        return None, None
    conditions = db.execute(
        'SELECT text, type, status, by FROM case_conditions WHERE case_id=? ORDER BY id',
        (case_id,)
    ).fetchall()
    rebuttals = db.execute(
        'SELECT text, ts FROM case_rebuttals WHERE case_id=? ORDER BY id',
        (case_id,)
    ).fetchall()
    invites = db.execute(
        '''SELECT COALESCE(agency_key, invited_email) AS party
           FROM case_invites WHERE case_id=? ORDER BY 1''',
        (case_id,)
    ).fetchall()
    payload = {
        'case_id':    case['case_id'],
        'site':       case['site'],
        'applicant':  case['applicant'],
        'score':      case['score'],
        'state_code': case['state_code'],
        'lat':        case['lat'],
        'lon':        case['lon'],
        'weights':    json.loads(case['weights_json']) if case.get('weights_json') else None,
        'lead_agency': case['lead_agency'],
        'ts':         str(case['ts']),
        'confirmed_at': case['confirmed_at'],
        'stage':      'Resolution',
        'conditions': [dict(r) for r in conditions],
        'rebuttals':  [{'text': r['text'], 'ts': str(r['ts'])} for r in rebuttals],
        'co_parties': [r['party'] for r in invites],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    hash_val  = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    return hash_val, canonical


# ── stage transitions ─────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/stage')
def get_stage(case_id):
    """Current stage override for a case (case_stage_overrides is the
    mutable source of truth used by the UI's stage tracker; cases.stage is
    kept in sync alongside it — see set_stage below)."""
    err = _case_write_guard(case_id)
    if err:
        return err
    with get_db() as db:
        row = db.execute('SELECT stage FROM case_stage_overrides WHERE case_id=?', (case_id,)).fetchone()
    return jsonify(row['stage'] if row else None)

@app.route('/api/case/<case_id>/stage', methods=['PATCH'])
def set_stage(case_id):
    """Advance (or otherwise change) a case's stage. This is the one place a
    case gets cryptographically anchored: the moment the stage becomes
    'Resolution', we compute a SHA-256 over the canonical case payload and
    write it to case_anchors (upsert, so re-entering Resolution re-anchors
    rather than erroring). Also emails the builder that their case moved."""
    err = _case_write_guard(case_id)
    if err:
        return err
    data  = request.get_json(silent=True) or {}
    stage = (data.get('stage') or '').strip()
    if not stage:
        return jsonify({'ok': False, 'err': 'stage required'}), 400
    with get_db() as db:
        db.execute(
            '''INSERT INTO case_stage_overrides (case_id, stage) VALUES (?,?)
               ON CONFLICT (case_id) DO UPDATE SET stage=EXCLUDED.stage, ts=NOW()''',
            (case_id, stage)
        )
        db.execute('UPDATE cases SET stage=? WHERE case_id=?', (stage, case_id))
        # Anchor only fires on entry to Resolution — every other stage change
        # is a no-op here.
        if stage == 'Resolution':
            hash_val, canonical = _compute_anchor(db, case_id)
            if hash_val:
                anchored_at = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
                db.execute(
                    '''INSERT INTO case_anchors (case_id, hash, anchored_at, payload_json)
                       VALUES (?,?,?,?)
                       ON CONFLICT (case_id) DO UPDATE
                         SET hash=EXCLUDED.hash, anchored_at=EXCLUDED.anchored_at,
                             payload_json=EXCLUDED.payload_json''',
                    (case_id, hash_val, anchored_at, canonical)
                )
        row = db.execute(
            'SELECT site, owner_email, contact_email FROM cases WHERE case_id=?', (case_id,)
        ).fetchone()
    # Fixture/demo ids have no cases row — skip silently.
    if row:
        _send_notification(
            row['owner_email'] or row['contact_email'],
            'Case {} moved to {}'.format(case_id, stage),
            'Your case for {} advanced to the "{}" stage.\n\n'
            'Track your case: {}/#/builder/case/{}\n\n'
            '-- Merascope'.format(row['site'] or case_id, stage, APP_URL, case_id)
        )
    return jsonify({'ok': True})


# ── impasse routing ────────────────────────────────────────────────────────────

@app.route('/api/impasse/routes')
def get_impasse_routes():
    """List of condition/item keys that have already been routed to
    mediation, so the UI doesn't offer to route the same item twice."""
    with get_db() as db:
        rows = db.execute('SELECT item_key FROM case_impasse_routes').fetchall()
    return jsonify([r['item_key'] for r in rows])

@app.route('/api/impasse/route', methods=['POST'])
def add_impasse_route():
    """Mark a disputed condition/item as routed to mediation. If a case_id is
    given, also flips that case's stage to Mediation and drops an event_log
    row so the transition shows up in exports/audit trails."""
    data    = request.get_json(silent=True) or {}
    key     = (data.get('key') or '').strip()
    case_id = (data.get('case_id') or '').strip()
    if not key:
        return jsonify({'ok': False, 'err': 'key required'}), 400
    if case_id:
        err = _case_write_guard(case_id)
        if err:
            return err
    with get_db() as db:
        db.execute(
            'INSERT INTO case_impasse_routes (item_key) VALUES (?) ON CONFLICT DO NOTHING', (key,)
        )
        if case_id:
            db.execute(
                "UPDATE cases SET stage='Mediation' WHERE case_id=? AND stage != 'Mediation'",
                (case_id,)
            )
            db.execute(
                '''INSERT INTO event_log (session_id, event_type, payload)
                   VALUES (?,?,?)''',
                ('', 'status_change',
                 json.dumps({'case_id': case_id, 'stage': 'Mediation',
                             'note': 'Routed to mediation via impasse register'}))
            )
    return jsonify({'ok': True})


# ── impasse items (conditions with status='Impasse') ─────────────────────────

@app.route('/api/impasse/items')
def get_impasse_items():
    """All conditions across all cases currently flagged Impasse — the
    cross-case worklist a steward/mediator triages from."""
    with get_db() as db:
        rows = db.execute(
            '''SELECT cc.id, cc.case_id, cc.text, cc.type, cc.by, cc.ts,
                      c.site, c.lead_agency
               FROM case_conditions cc
               JOIN cases c ON c.case_id = cc.case_id
               WHERE cc.status = 'Impasse'
               ORDER BY cc.ts DESC'''
        ).fetchall()
    return jsonify(rows)


# ── studies ────────────────────────────────────────────────────────────────────

@app.route('/api/studies')
def get_studies():
    """Mandated-study registry, with three modes: studies tied to one case
    (?case_id=...), every study across every case (?all=1, for the steward's
    global studies dashboard), or — the default — only the case-independent
    "standing" studies (case_id IS NULL), e.g. agency-wide research."""
    case_id = request.args.get('case_id') or None
    all_studies = request.args.get('all') == '1'
    with get_db() as db:
        if case_id:
            rows = db.execute(
                'SELECT * FROM studies WHERE case_id=? ORDER BY ts DESC', (case_id,)
            ).fetchall()
        elif all_studies:
            rows = db.execute(
                'SELECT * FROM studies ORDER BY case_id NULLS FIRST, ts DESC'
            ).fetchall()
        else:
            rows = db.execute(
                'SELECT * FROM studies WHERE case_id IS NULL ORDER BY ts DESC'
            ).fetchall()
    return jsonify(rows)

@app.route('/api/studies', methods=['POST'])
def add_study():
    data    = request.get_json(silent=True) or {}
    name    = (data.get('name') or '').strip()
    case_id = (data.get('case_id') or None)
    finding = (data.get('finding') or None)
    if not name:
        return jsonify({'ok': False, 'err': 'name required'}), 400
    with get_db() as db:
        cur = db.execute(
            'INSERT INTO studies (name, body, due, case_id, finding) VALUES (?,?,?,?,?) RETURNING id',
            (name, data.get('body', ''), data.get('due', ''), case_id, finding)
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})

@app.route('/api/studies/<int:study_id>', methods=['DELETE'])
def delete_study(study_id):
    with get_db() as db:
        db.execute('DELETE FROM studies WHERE id=?', (study_id,))
    return jsonify({'ok': True})


# ── litigation ─────────────────────────────────────────────────────────────────

@app.route('/api/litigation')
def get_litigation():
    with get_db() as db:
        rows = db.execute('SELECT * FROM litigation ORDER BY ts DESC').fetchall()
    return jsonify(rows)

@app.route('/api/litigation', methods=['POST'])
def add_litigation():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'ok': False, 'err': 'name required'}), 400
    with get_db() as db:
        cur = db.execute(
            'INSERT INTO litigation (name, court, no, status, filed) VALUES (?,?,?,?,?) RETURNING id',
            (name, data.get('court', ''), data.get('no', ''), data.get('status', 'Active'), data.get('filed', ''))
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})

@app.route('/api/litigation/<int:lit_id>', methods=['DELETE'])
def delete_litigation(lit_id):
    with get_db() as db:
        db.execute('DELETE FROM litigation WHERE id=?', (lit_id,))
    return jsonify({'ok': True})


# ── rebuttals ─────────────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/rebuttals')
def get_rebuttals(case_id):
    err = _case_write_guard(case_id)
    if err:
        return err
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_rebuttals WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify(rows)

@app.route('/api/case/<case_id>/rebuttal', methods=['POST'])
def add_rebuttal(case_id):
    err = _case_write_guard(case_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'ok': False, 'err': 'text required'}), 400
    with get_db() as db:
        cur = db.execute(
            'INSERT INTO case_rebuttals (case_id, text) VALUES (?,?) RETURNING id', (case_id, text)
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})


# ── mandated study checks ──────────────────────────────────────────────────────
# Tracks which sections of which mandated studies have been reviewed/checked
# off, keyed by (study_name, section_idx) rather than a case_id — this is a
# global checklist shared across the steward UI, not per-case state.

@app.route('/api/studies/checks')
def get_study_checks():
    """All currently-checked (study_name, section_idx) pairs."""
    with get_db() as db:
        rows = db.execute('SELECT study_name, section_idx FROM study_checks').fetchall()
    return jsonify(rows)

@app.route('/api/studies/check', methods=['POST'])
def toggle_study_check():
    """Check or uncheck one study section. Checked = row exists; unchecked =
    row deleted — the presence of the row IS the checked state."""
    data        = request.get_json(silent=True) or {}
    name        = data.get('study_name', '')
    idx         = data.get('section_idx')
    now_checked = data.get('checked', True)
    if not name or idx is None:
        return jsonify({'ok': False, 'err': 'study_name and section_idx required'}), 400
    with get_db() as db:
        if now_checked:
            db.execute(
                'INSERT INTO study_checks (study_name, section_idx) VALUES (?,?) ON CONFLICT DO NOTHING',
                (name, idx)
            )
        else:
            db.execute(
                'DELETE FROM study_checks WHERE study_name=? AND section_idx=?', (name, idx)
            )
    return jsonify({'ok': True})


# ── auth ─────────────────────────────────────────────────────────────────────
# Magic-link email auth: no passwords. A user requests a link, we email a
# single-use token, they click it, we set a long-lived session cookie.

APP_URL    = os.environ.get('APP_URL', 'http://localhost:8877')
MAGIC_TTL  = timedelta(hours=1)
SESS_TTL   = timedelta(days=30)
# Gotcha: the session cookie's Secure flag is driven by APP_ENV, NOT by
# whether APP_URL happens to be https. Deploying behind a proxy/tunnel with
# APP_ENV unset (so this defaults to non-production) will silently issue
# non-Secure cookies even on an https:// URL — check APP_ENV, not the URL,
# when debugging cookie/session issues.
_SECURE    = os.environ.get('APP_ENV') == 'production'


def _send_magic_email(to_email, token):
    """Send the sign-in email (plaintext + styled HTML) containing the
    single-use /verify?token=... link. Pulls SMTP creds from env vars."""
    host   = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    port   = int(os.environ.get('SMTP_PORT', '587'))
    user   = os.environ.get('SMTP_USER', '')
    pw     = os.environ.get('SMTP_PASS', '')
    sender = os.environ.get('FROM_EMAIL', user)
    link   = '{}/verify?token={}'.format(APP_URL, token)

    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'Sign in to Merascope'
    msg['From']    = 'Merascope <{}>'.format(sender)
    msg['To']      = to_email

    text = (
        'Sign in to Merascope\n\n'
        'Click the link below to access your Merascope account. '
        'This link expires in 1 hour and can only be used once.\n\n'
        '{}\n\n'
        'Merascope is a national data center site suitability and permitting '
        'coordination platform. If you did not request this link, you can safely ignore this email.\n\n'
        '-- The Merascope team\n'
        'merascope.com'
    ).format(link)
    html = '''<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 0">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
      <tr><td style="background:#1a2e1a;padding:24px 32px">
        <span style="color:#a8c5a0;font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:700">Merascope</span>
      </td></tr>
      <tr><td style="padding:36px 32px 28px">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a1a">Sign in to your account</h1>
        <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6">
          Click the button below to sign in to Merascope. This link expires in <strong>1 hour</strong> and can only be used once.
        </p>
        <table cellpadding="0" cellspacing="0"><tr><td>
          <a href="{link}" style="display:inline-block;padding:14px 28px;background:#2d5a27;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:.01em">Sign in to Merascope &rarr;</a>
        </td></tr></table>
        <p style="margin:28px 0 0;font-size:13px;color:#888;line-height:1.6">
          Merascope is a national data center site suitability and permitting coordination platform.<br>
          If you did not request this link, you can safely ignore this email.
        </p>
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #eee;background:#fafaf8">
        <p style="margin:0;font-size:12px;color:#aaa">
          &copy; 2026 Merascope &middot; <a href="https://merascope.com" style="color:#aaa">merascope.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>'''.format(link=link)

    msg.attach(MIMEText(text, 'plain'))
    msg.attach(MIMEText(html, 'html'))

    with smtplib.SMTP(host, port) as s:
        s.ehlo()
        s.starttls()
        s.login(user, pw)
        s.sendmail(sender, [to_email], msg.as_string())


# Event notifications (stage change, confirmation, invite, condition decision).
# Explicit opt-in: prod sets NOTIFY_ENABLED=1 in /etc/merascope.env; dev and
# tests never touch SMTP. Fire-and-forget — a mail failure must never fail or
# slow the request that triggered it.
NOTIFY_ENABLED = os.environ.get('NOTIFY_ENABLED') == '1'


def _send_notification(to_email, subject, body):
    if not NOTIFY_ENABLED or not to_email:
        return

    def _worker():
        try:
            host   = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
            port   = int(os.environ.get('SMTP_PORT', '587'))
            user   = os.environ.get('SMTP_USER', '')
            pw     = os.environ.get('SMTP_PASS', '')
            sender = os.environ.get('FROM_EMAIL', user)
            msg = MIMEText(body, 'plain')
            msg['Subject'] = subject
            msg['From']    = 'Merascope <{}>'.format(sender)
            msg['To']      = to_email
            with smtplib.SMTP(host, port) as s:
                s.ehlo()
                s.starttls()
                s.login(user, pw)
                s.sendmail(sender, [to_email], msg.as_string())
        except Exception as e:
            print('notify error:', e)

    threading.Thread(target=_worker, daemon=True).start()


@app.route('/api/auth/request', methods=['POST'])
def auth_request():
    """Step 1 of magic-link login: rate-limited (3 per 15 min per IP),
    creates the user row if new, generates a single-use token, and emails
    the sign-in link. Any old expired sessions for that email are pruned
    here too, opportunistically."""
    ip = _client_ip()
    if not _check_rate_limit(ip):
        return jsonify({'ok': False, 'err': 'Too many requests. Try again in 15 minutes.'}), 429
    data  = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email:
        return jsonify({'ok': False, 'err': 'valid email required'}), 400
    token = secrets.token_urlsafe(32)
    exp   = datetime.utcnow() + MAGIC_TTL
    with get_db() as db:
        db.execute(
            'INSERT INTO users (email) VALUES (?) ON CONFLICT DO NOTHING', (email,)
        )
        db.execute(
            'DELETE FROM sessions WHERE email=? AND expires_at < NOW()', (email,)
        )
        db.execute(
            'INSERT INTO sessions (token, email, expires_at) VALUES (?,?,?)',
            (token, email, exp)
        )
    try:
        _send_magic_email(email, token)
    except Exception as e:
        print('SMTP error:', e)
        if os.environ.get('APP_ENV') == 'production':
            return jsonify({'ok': False, 'err': 'could not send email'}), 500
        print('Magic link (dev):', '{}/verify?token={}'.format(APP_URL, token))
    return jsonify({'ok': True})


@app.route('/verify')
def verify_magic_link():
    """Step 2 of magic-link login: the link the user clicked from their
    inbox. If the token is valid and unexpired, extend it from the short
    MAGIC_TTL to the long-lived SESS_TTL (the same token row now doubles as
    the session token) and set it as the mera_sess cookie. Redirects into
    the steward or builder SPA route depending on the user's role."""
    token = request.args.get('token', '')
    if not token:
        return redirect('/#/login')
    with get_db() as db:
        row = db.execute(
            '''SELECT s.email, r.role
               FROM sessions s
               LEFT JOIN user_roles r ON r.email = s.email
               WHERE s.token = ? AND s.expires_at > NOW()''',
            (token,)
        ).fetchone()
    if not row:
        return redirect('/#/login?err=expired')
    role = row['role'] or 'builder'
    dest = '/#/steward' if role == 'steward' else '/#/builder'
    sess_exp = datetime.utcnow() + SESS_TTL
    with get_db() as db:
        # Same token, longer expiry — turns the one-time magic-link token
        # into the ongoing session token so a second table isn't needed.
        db.execute(
            'UPDATE sessions SET expires_at=? WHERE token=?', (sess_exp, token)
        )
    resp = redirect(dest)
    resp.set_cookie(
        'mera_sess', token,
        httponly=True, secure=_SECURE, samesite='Lax',
        max_age=int(SESS_TTL.total_seconds())
    )
    return resp


@app.route('/api/auth/me')
def auth_me():
    """Whoami check the frontend calls on load to decide which UI to render
    (builder vs steward vs admin) and whether the session cookie is still
    valid. admin is treated as read_only by convention — see role checks
    elsewhere in the file."""
    token = request.cookies.get('mera_sess', '')
    if not token:
        return jsonify(None), 401
    with get_db() as db:
        row = db.execute(
            '''SELECT s.email, r.role, r.agency_key
               FROM sessions s
               LEFT JOIN user_roles r ON r.email = s.email
               WHERE s.token = ? AND s.expires_at > NOW()''',
            (token,)
        ).fetchone()
    if not row:
        return jsonify(None), 401
    return jsonify({
        'email':      row['email'],
        'role':       row['role'] or 'builder',
        'agency_key': row['agency_key'],
        'read_only':  row['role'] == 'admin',
    })


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """Invalidate the session server-side (delete the row, not just the
    cookie) so a stolen/cached cookie can't be replayed after logout."""
    token = request.cookies.get('mera_sess', '')
    if token:
        with get_db() as db:
            db.execute('DELETE FROM sessions WHERE token=?', (token,))
    resp = jsonify({'ok': True})
    resp.delete_cookie('mera_sess')
    return resp


# ── steward templates — presets + helpers ─────────────────────────────────────
# A "template" is a named set of indicator weights (+ a minimum score gate) a
# steward can save and apply, so their agency scores sites consistently
# instead of every builder using ad hoc weights. Presets below are shipped
# starting points; stewards can also save their own via the templates CRUD
# routes further down.

# Must mirror the indicator keys used by the frontend's data.js INDICATORS
# array — kept in sync by hand, not generated.
_IND_KEYS = [
    'transmission', 'water', 'community', 'seismic', 'flood', 'contamination',
    'waterway', 'geothermal', 'flatness', 'aquifer', 'soil', 'slope',
    'pop_exposure', 'soil_profile', 'ksat',
    # supplemental (scripts 11-16)
    'substation', 'superfund', 'rcra', 'air_quality', 'fiber', 'water_stress', 'grid_capacity',
]

def _zero_weights():
    """Baseline dict with every indicator at 0, so each preset below only
    has to spell out the weights it actually cares about."""
    return {k: 0 for k in _IND_KEYS}

# Built-in weight-template presets offered to every steward out of the box.
# 'site_types' tags which verticals (see _SITE_TYPES below) each preset makes
# sense for — /api/steward/presets can filter on it via ?site_type=. Presets
# built around a datacenter-only indicator (e.g. grid_complete's fiber weight)
# are tagged datacenter-only rather than both.
PRESET_TEMPLATES = [
    {
        'id': 'balanced',
        'name': 'Balanced',
        'description': 'Merascope defaults. Equal weighting across the three primary pillars — transmission, water, and community burden. Good starting point for state-level screening.',
        'weights': {**_zero_weights(), 'transmission': 40, 'water': 35, 'community': 25},
        'min_score': 0.40,
        'site_types': ['datacenter', 'bess'],
    },
    {
        'id': 'grid_complete',
        'name': 'Grid-Complete',
        'description': 'Full grid infrastructure stack. Weights transmission proximity, substation access, ISO interconnection queue headroom, and fiber density equally alongside water. Suited for developers prioritizing shovel-ready grid connection.',
        'weights': {**_zero_weights(), 'transmission': 25, 'substation': 20, 'grid_capacity': 20, 'fiber': 15, 'water': 15, 'community': 5},
        'min_score': 0.40,
        'site_types': ['datacenter'],  # bakes in fiber, not relevant to BESS
    },
    {
        'id': 'water_durability',
        'name': 'Water Durability',
        'description': 'Long-term water security. Weights surface availability and WRI Aqueduct chronic stress index together. Suited for drought-stressed or water-rights-constrained jurisdictions.',
        'weights': {**_zero_weights(), 'water': 45, 'water_stress': 25, 'transmission': 20, 'community': 10},
        'min_score': 0.50,
        'site_types': ['datacenter', 'bess'],
    },
    {
        'id': 'contamination_screen',
        'name': 'Contamination Screen',
        'description': 'Strict environmental due diligence. Screens for TRI facility proximity, Superfund NPL distance, RCRA corrective action sites, and NAAQS air quality attainment alongside community burden. Designed for jurisdictions requiring Phase I/II ESA screening at the planning stage.',
        'weights': {**_zero_weights(), 'contamination': 20, 'superfund': 20, 'rcra': 20, 'air_quality': 15, 'community': 15, 'water': 10},
        'min_score': 0.50,
        'site_types': ['datacenter', 'bess'],
    },
    {
        'id': 'ej_forward',
        'name': 'EJ Forward',
        'description': 'Community health-first screening. Combines EJ burden, NAAQS attainment, and contamination distance. Designed for jurisdictions with cumulative-impact mandates or health-based siting ordinances. Highest minimum score.',
        'weights': {**_zero_weights(), 'community': 30, 'air_quality': 20, 'contamination': 15, 'superfund': 10, 'rcra': 10, 'water': 10, 'transmission': 5},
        'min_score': 0.55,
        'site_types': ['datacenter', 'bess'],
    },
    {
        'id': 'interconnection_priority',
        'name': 'Interconnection Priority',
        'description': 'BESS/renewables-first screening. Weights transmission proximity, substation access, and ISO interconnection queue headroom above flood/community factors. Suited for battery storage or generation developers prioritizing a fast, low-cost grid connection over the water/community factors that matter more for large-load datacenter siting.',
        'weights': {**_zero_weights(), 'transmission': 25, 'substation': 20, 'grid_capacity': 20, 'flood': 10, 'community': 25},
        'min_score': 0.40,
        'site_types': ['bess'],
    },
]

# Look up the 'balanced' preset's weights by id (not list index) so this stays
# correct if PRESET_TEMPLATES' order ever changes.
_BALANCED_WEIGHTS = next(p['weights'] for p in PRESET_TEMPLATES if p['id'] == 'balanced')

DEFAULT_SITE_TYPE = 'datacenter'

# Default weight vector + copy per site vertical. Used to seed Explorer/Builder
# starting weights (WeightDock's site-type selector) and as the report's
# composite-score fallback (_build_report_context) when no case-level weights
# were saved. Mirrored in merascope/data.js as SITE_TYPES — keep both in sync
# (site_type keys, weights, label copy) whenever either changes.
_SITE_TYPES = {
    'datacenter': {
        'label': 'Data Center',
        'description': "Large-load digital infrastructure siting — Merascope's original vertical. Weights match the Balanced preset.",
        'weights': _BALANCED_WEIGHTS,
    },
    'bess': {
        'label': 'Battery Storage / Renewables',
        'description': 'Battery energy storage (and future solar/wind) siting. Weighted toward grid interconnection readiness — transmission, substation, and ISO interconnection queue headroom — over the water/community factors that matter more for large-load datacenter siting.',
        # First-cut vector (transmission 25 / substation 20 / grid_capacity 20 /
        # flood 10 / seismic 10 / slope 10 / community 5), not yet validated
        # against real WA BESS/EFSEC permitting criteria. Sanity-check with the
        # advisor/outreach contacts before this ships as a literal default used
        # in a real BESS case, not just an Explorer default.
        'weights': {**_zero_weights(), 'transmission': 25, 'substation': 20, 'grid_capacity': 20,
                    'flood': 10, 'seismic': 10, 'slope': 10, 'community': 5},
    },
}


def _weights_for_site_type(site_type):
    """Default weight vector for a site_type key. Server-side mirror of
    data.js's weightsForSiteType() — falls back to DEFAULT_SITE_TYPE for an
    unknown/missing key so a stale client payload can't crash report
    generation or the Explorer's initial weights state."""
    st = _SITE_TYPES.get(site_type) or _SITE_TYPES[DEFAULT_SITE_TYPE]
    return st['weights']


@app.route('/api/site-types')
def get_site_types():
    """Public site-type list (id/label/description/weights) — no auth
    required, same pattern as /api/steward/presets below. Lets the frontend
    hydrate SITE_TYPES from server truth with a local fallback mirror."""
    return jsonify([{'id': k, **v} for k, v in _SITE_TYPES.items()])


# ── boundary GeoJSON cache + point-in-polygon ─────────────────────────────────
# Deliberately pure-Python (no GDAL/shapely/rasterio) so geographic zone
# gating works with only requests+json — see workspace policy against
# GDAL-stack packages. Boundary files are pre-baked GeoJSON on disk.

_geo_cache = {}

def _load_boundary(path):
    """Read+cache a boundary GeoJSON file by path. Caches a miss (None) too,
    so a bad/missing path doesn't re-hit the filesystem on every call."""
    if path not in _geo_cache:
        try:
            with open(path) as f:
                _geo_cache[path] = json.load(f)
        except FileNotFoundError:
            _geo_cache[path] = None
    return _geo_cache[path]


def _point_in_ring(lon, lat, ring):
    """Classic ray-casting point-in-polygon test for a single linear ring:
    cast a ray from the point out to +lon and count how many ring edges it
    crosses. Odd crossing count = inside, even = outside. `ring` is a list of
    [lon, lat] pairs (GeoJSON coordinate order, not [lat, lon])."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geometry(lon, lat, geom):
    """Point-in-polygon for a full GeoJSON geometry, handling both Polygon
    (first ring is the outer boundary, any further rings are holes to
    subtract) and MultiPolygon (point must be in at least one part)."""
    gtype = geom.get('type')
    if gtype == 'Polygon':
        rings = geom['coordinates']
        if not _point_in_ring(lon, lat, rings[0]):
            return False
        for hole in rings[1:]:
            if _point_in_ring(lon, lat, hole):
                return False
        return True
    if gtype == 'MultiPolygon':
        for poly in geom['coordinates']:
            if _point_in_ring(lon, lat, poly[0]):
                ok = True
                for hole in poly[1:]:
                    if _point_in_ring(lon, lat, hole):
                        ok = False
                        break
                if ok:
                    return True
    return False


def _point_in_county(lon, lat, state_code, county_fips):
    """Is (lon, lat) inside the given county? Scans that state's census
    tracts GeoJSON for tracts matching county_fips and tests each — a tract
    is used as the unit rather than a dedicated county boundary file because
    that's what's already on disk per state."""
    path = os.path.join(ROOT, 'data', state_code, 'raw', 'tracts.geojson')
    gj = _load_boundary(path)
    if not gj:
        return False
    for feat in gj['features']:
        if feat['properties'].get('COUNTYFP') == county_fips:
            if _point_in_geometry(lon, lat, feat['geometry']):
                return True
    return False


def _point_in_zcta(lon, lat, state_code, zcta_code):
    """Is (lon, lat) inside the given ZCTA (zip code tabulation area)?"""
    path = os.path.join(ROOT, 'data', state_code, 'zcta', 'zcta.geojson')
    gj = _load_boundary(path)
    if not gj:
        return False
    for feat in gj['features']:
        if str(feat['properties'].get('zcta', '')) == str(zcta_code):
            if _point_in_geometry(lon, lat, feat['geometry']):
                return True
    return False


# ── require_steward decorator ─────────────────────────────────────────────────

def require_steward(f):
    """Route decorator: reject unless the caller has a valid session AND a
    'steward' role. Populates flask.g (user_email/user_role/agency_key) so
    the wrapped view doesn't need to re-look-up the session itself."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('mera_sess', '')
        if not token:
            return jsonify({'ok': False, 'err': 'authentication required'}), 401
        with get_db() as db:
            row = db.execute(
                '''SELECT s.email, r.role, r.agency_key
                   FROM sessions s
                   LEFT JOIN user_roles r ON r.email = s.email
                   WHERE s.token = ? AND s.expires_at > NOW()''',
                (token,)
            ).fetchone()
        if not row:
            return jsonify({'ok': False, 'err': 'unauthorized'}), 401
        if (row.get('role') or 'builder') != 'steward':
            return jsonify({'ok': False, 'err': 'steward role required'}), 403
        g.user_email  = row['email']
        g.user_role   = row['role']
        g.agency_key  = row['agency_key'] or ''
        return f(*args, **kwargs)
    return decorated


# ── steward presets ───────────────────────────────────────────────────────────

@app.route('/api/steward/presets')
def get_steward_presets():
    """The built-in weight-template presets (no auth required — these are
    static and public, unlike a steward's own saved templates below).
    Optional ?site_type= filters to presets tagged for that vertical; the
    param defaults to unfiltered (returns all presets) specifically so
    existing callers that don't pass it keep working unchanged."""
    site_type = request.args.get('site_type')
    if not site_type:
        return jsonify(PRESET_TEMPLATES)
    return jsonify([p for p in PRESET_TEMPLATES if site_type in p['site_types']])


# ── steward templates CRUD ────────────────────────────────────────────────────
# A steward's own saved weight templates, scoped to their agency_key (every
# route here is behind @require_steward and filters by g.agency_key, so one
# agency can never see or touch another agency's templates).

@app.route('/api/steward/templates')
@require_steward
def list_steward_templates():
    """All templates saved by the caller's agency."""
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM steward_templates WHERE agency_key=? ORDER BY created_at',
            (g.agency_key,)
        ).fetchall()
    result = []
    for r in rows:
        r = dict(r)
        r['weights'] = json.loads(r['weights_json'])
        del r['weights_json']
        result.append(r)
    return jsonify(result)


@app.route('/api/steward/templates', methods=['POST'])
@require_steward
def create_steward_template():
    """Save a new weight template for the caller's agency. Any indicator key
    not supplied defaults to 0 (via _zero_weights) and unknown keys are
    silently dropped, so a stale/malformed frontend payload can't inject
    arbitrary columns into the stored JSON."""
    data      = request.get_json(silent=True) or {}
    name      = (data.get('name') or '').strip()
    weights   = data.get('weights') or {}
    min_sc    = float(data.get('min_score', 0.40))
    # Defaults to 'datacenter' — falls back like _weights_for_site_type does,
    # so an unrecognized key from a stale client can't get silently stored.
    site_type = data.get('site_type') if data.get('site_type') in _SITE_TYPES else DEFAULT_SITE_TYPE
    if not name:
        return jsonify({'ok': False, 'err': 'name required'}), 400
    # Fill any missing indicator keys with 0
    full_w = {**_zero_weights(), **{k: float(v) for k, v in weights.items() if k in _IND_KEYS}}
    with get_db() as db:
        cur = db.execute(
            '''INSERT INTO steward_templates (agency_key, name, weights_json, min_score, site_type)
               VALUES (?,?,?,?,?) RETURNING id''',
            (g.agency_key, name, json.dumps(full_w), min_sc, site_type)
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})


@app.route('/api/steward/templates/<int:tmpl_id>', methods=['PATCH'])
@require_steward
def update_steward_template(tmpl_id):
    """Edit an existing template in place. Before overwriting, snapshots the
    template's prior state into template_history (so rollback_template below
    has something to roll back to) along with a human-readable summary of
    what changed, built by diffing old vs. new field-by-field."""
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        row = db.execute(
            'SELECT * FROM steward_templates WHERE id=? AND agency_key=?',
            (tmpl_id, g.agency_key)
        ).fetchone()
        if not row:
            return jsonify({'ok': False, 'err': 'not found'}), 404
        name      = (data.get('name') or row['name']).strip()
        min_sc    = float(data.get('min_score', row['min_score']))
        locked    = int(data['locked']) if 'locked' in data else row['locked']
        site_type = data['site_type'] if data.get('site_type') in _SITE_TYPES else row['site_type']
        if 'weights' in data:
            existing = json.loads(row['weights_json'])
            full_w   = {**existing, **{k: float(v) for k, v in data['weights'].items() if k in _IND_KEYS}}
            w_json   = json.dumps(full_w)
        else:
            w_json = row['weights_json']
        # build change summary
        parts = []
        if name != row['name']:                       parts.append('renamed to ' + name)
        if abs(min_sc - row['min_score']) > 0.001:    parts.append('min score → ' + str(round(min_sc, 2)))
        if locked != row['locked']:                   parts.append('locked' if locked else 'unlocked')
        if w_json != row['weights_json']:             parts.append('weights updated')
        if site_type != row['site_type']:              parts.append('site type → ' + site_type)
        summary = ', '.join(parts) or 'updated'
        # snapshot current state before overwriting (site_type isn't part of
        # template_history's schema — it's a low-frequency, non-scoring field,
        # so only weights/min_score/locked are versioned, same as before)
        db.execute(
            '''INSERT INTO template_history
               (template_id, agency_key, changed_by, weights_json, min_score, locked, summary)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (tmpl_id, g.agency_key, g.user_email,
             row['weights_json'], row['min_score'], row['locked'], summary)
        )
        db.execute(
            '''UPDATE steward_templates
               SET name=?, weights_json=?, min_score=?, locked=?, site_type=?, updated_at=NOW()
               WHERE id=? AND agency_key=?''',
            (name, w_json, min_sc, locked, site_type, tmpl_id, g.agency_key)
        )
    return jsonify({'ok': True})


@app.route('/api/steward/templates/<int:tmpl_id>/history')
@require_steward
def get_template_history(tmpl_id):
    """Last 20 snapshots for a template, most recent first — the undo log
    shown in the template editor's history panel."""
    with get_db() as db:
        rows = db.execute(
            '''SELECT id, changed_by, changed_at, weights_json, min_score, locked, summary
               FROM template_history
               WHERE template_id=? AND agency_key=?
               ORDER BY changed_at DESC LIMIT 20''',
            (tmpl_id, g.agency_key)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/steward/templates/<int:tmpl_id>/rollback', methods=['POST'])
@require_steward
def rollback_template(tmpl_id):
    """Restore a template to a prior snapshot from template_history. The
    current state is itself snapshotted first (so rollback is undoable too,
    not a destructive one-way trip)."""
    data = request.get_json(silent=True) or {}
    history_id = data.get('history_id')
    if not history_id:
        return jsonify({'ok': False, 'err': 'history_id required'}), 400
    with get_db() as db:
        snap = db.execute(
            'SELECT * FROM template_history WHERE id=? AND template_id=? AND agency_key=?',
            (history_id, tmpl_id, g.agency_key)
        ).fetchone()
        if not snap:
            return jsonify({'ok': False, 'err': 'snapshot not found'}), 404
        cur = db.execute(
            'SELECT * FROM steward_templates WHERE id=? AND agency_key=?',
            (tmpl_id, g.agency_key)
        ).fetchone()
        if not cur:
            return jsonify({'ok': False, 'err': 'template not found'}), 404
        # snapshot current state before rollback
        db.execute(
            '''INSERT INTO template_history
               (template_id, agency_key, changed_by, weights_json, min_score, locked, summary)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (tmpl_id, g.agency_key, g.user_email,
             cur['weights_json'], cur['min_score'], cur['locked'],
             'rolled back to ' + str(snap['changed_at'])[:10])
        )
        db.execute(
            '''UPDATE steward_templates
               SET weights_json=?, min_score=?, locked=?, updated_at=NOW()
               WHERE id=? AND agency_key=?''',
            (snap['weights_json'], snap['min_score'], snap['locked'], tmpl_id, g.agency_key)
        )
    return jsonify({'ok': True,
                    'weights':   json.loads(snap['weights_json']),
                    'min_score': snap['min_score'],
                    'locked':    snap['locked']})


@app.route('/api/steward/templates/<int:tmpl_id>', methods=['DELETE'])
@require_steward
def delete_steward_template(tmpl_id):
    """Delete a template. Any zone that had this template assigned is
    unlinked (template_id → NULL) rather than left dangling or cascade-
    deleted — a zone without a template just stops gating on it."""
    with get_db() as db:
        row = db.execute(
            'SELECT id FROM steward_templates WHERE id=? AND agency_key=?',
            (tmpl_id, g.agency_key)
        ).fetchone()
        if not row:
            return jsonify({'ok': False, 'err': 'not found'}), 404
        db.execute('UPDATE steward_zones SET template_id=NULL WHERE template_id=?', (tmpl_id,))
        db.execute('DELETE FROM steward_templates WHERE id=?', (tmpl_id,))
    return jsonify({'ok': True})


# ── steward zones CRUD ────────────────────────────────────────────────────────
# A "zone" is a geographic area (whole state, a bbox, a county, or a ZCTA) an
# agency can attach a weight template to, so that a builder's score gets
# gated by that template's min_score when their site falls inside the zone.
# See zones_active()/gate_check() below for where the gating actually happens.

def _shape_zone(r):
    """Normalize a raw zone row: decode bbox_json into a bbox dict/list (or
    None if this isn't a bbox-type zone)."""
    z = dict(r)
    z['bbox'] = json.loads(z['bbox_json']) if z.get('bbox_json') else None
    z.pop('bbox_json', None)
    return z


@app.route('/api/steward/zones')
@require_steward
def list_steward_zones():
    """All zones for the caller's agency, with the attached template's
    weights/min_score/locked flag inlined (left-joined, so a zone with no
    template attached still returns, just without those fields)."""
    with get_db() as db:
        rows = db.execute(
            '''SELECT z.*, t.name AS template_name, t.min_score AS template_min_score,
                      t.locked AS template_locked, t.weights_json
               FROM steward_zones z
               LEFT JOIN steward_templates t ON t.id = z.template_id
               WHERE z.agency_key=? ORDER BY z.created_at''',
            (g.agency_key,)
        ).fetchall()
    result = []
    for r in rows:
        z = _shape_zone(r)
        if z.get('weights_json'):
            z['template_weights'] = json.loads(z['weights_json'])
            del z['weights_json']
        result.append(z)
    return jsonify(result)


@app.route('/api/steward/zones', methods=['POST'])
@require_steward
def create_steward_zone():
    """Create a new zone. zone_type determines which of state_code/bbox/
    county_fips/zcta_code is actually meaningful — the others are just
    stored as NULL. template_id may be omitted (zone with no gating yet)."""
    data        = request.get_json(silent=True) or {}
    name        = (data.get('name') or '').strip()
    zone_type   = (data.get('zone_type') or 'state').strip()
    state_code  = (data.get('state_code') or '').strip().upper() or None
    bbox        = data.get('bbox')
    county_fips = (data.get('county_fips') or '').strip() or None
    zcta_code   = (data.get('zcta_code') or '').strip() or None
    template_id = data.get('template_id')
    if not name:
        return jsonify({'ok': False, 'err': 'name required'}), 400
    if zone_type not in ('state', 'bbox', 'county', 'zcta'):
        return jsonify({'ok': False, 'err': 'invalid zone_type'}), 400
    bbox_json = json.dumps(bbox) if bbox else None
    with get_db() as db:
        cur = db.execute(
            '''INSERT INTO steward_zones
               (agency_key, name, zone_type, state_code, bbox_json, county_fips, zcta_code, template_id)
               VALUES (?,?,?,?,?,?,?,?) RETURNING id''',
            (g.agency_key, name, zone_type, state_code, bbox_json, county_fips, zcta_code, template_id)
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})


@app.route('/api/steward/zones/<int:zone_id>', methods=['PATCH'])
@require_steward
def update_steward_zone(zone_id):
    """Partial update of a zone. Note the `data.get('x', row['x'])` pattern:
    missing keys keep the existing value, so callers can PATCH a single
    field (e.g. just template_id) without resending the whole zone."""
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        row = db.execute(
            'SELECT * FROM steward_zones WHERE id=? AND agency_key=?',
            (zone_id, g.agency_key)
        ).fetchone()
        if not row:
            return jsonify({'ok': False, 'err': 'not found'}), 404
        name        = (data.get('name') or row['name']).strip()
        template_id = data.get('template_id', row['template_id'])
        state_code  = data.get('state_code', row['state_code'])
        county_fips = data.get('county_fips', row['county_fips'])
        zcta_code   = data.get('zcta_code', row['zcta_code'])
        bbox_json   = json.dumps(data['bbox']) if 'bbox' in data else row['bbox_json']
        db.execute(
            '''UPDATE steward_zones
               SET name=?, template_id=?, state_code=?, county_fips=?, zcta_code=?, bbox_json=?
               WHERE id=? AND agency_key=?''',
            (name, template_id, state_code, county_fips, zcta_code, bbox_json, zone_id, g.agency_key)
        )
    return jsonify({'ok': True})


@app.route('/api/steward/zones/<int:zone_id>', methods=['DELETE'])
@require_steward
def delete_steward_zone(zone_id):
    """Delete a zone outright (unlike deleting a template, there's nothing
    downstream that needs to be unlinked first)."""
    with get_db() as db:
        row = db.execute(
            'SELECT id FROM steward_zones WHERE id=? AND agency_key=?',
            (zone_id, g.agency_key)
        ).fetchone()
        if not row:
            return jsonify({'ok': False, 'err': 'not found'}), 404
        db.execute('DELETE FROM steward_zones WHERE id=?', (zone_id,))
    return jsonify({'ok': True})


# ── public zone endpoints ─────────────────────────────────────────────────────
# Unlike the CRUD routes above, these are unauthenticated — the Explorer map
# and builder-facing gate check need to read zone/template data for anyone,
# not just the owning steward. Only LOCKED templates' zones are exposed here
# (an unlocked/draft template shouldn't gate builders yet).

@app.route('/api/zones/active')
def zones_active():
    """All locked zones across every agency, for rendering zone overlays on
    the Explorer map. For ZCTA-type zones, also inlines the actual polygon
    geometry (+ its bounding box) looked up from that state's ZCTA GeoJSON,
    so the frontend doesn't need a second round trip just to draw the shape."""
    with get_db() as db:
        rows = db.execute(
            '''SELECT z.id AS zone_id, z.name AS zone_name, z.agency_key,
                      z.zone_type, z.state_code, z.bbox_json,
                      z.county_fips, z.zcta_code,
                      t.name AS template_name, t.weights_json, t.min_score
               FROM steward_zones z
               JOIN steward_templates t ON t.id = z.template_id
               WHERE t.locked = 1'''
        ).fetchall()
    result = []
    for r in rows:
        z = dict(r)
        z['bbox']    = json.loads(z['bbox_json']) if z.get('bbox_json') else None
        z['weights'] = json.loads(z['weights_json'])
        del z['bbox_json'], z['weights_json']
        if z['zone_type'] == 'zcta' and z.get('zcta_code') and z.get('state_code'):
            path = os.path.join(ROOT, 'data', z['state_code'], 'zcta', 'zcta.geojson')
            gj = _load_boundary(path)
            if gj:
                feat = next((f for f in gj['features']
                             if str(f['properties'].get('zcta', '')) == str(z['zcta_code'])), None)
                if feat:
                    geom = feat['geometry']
                    coords = []
                    if geom['type'] == 'Polygon':
                        for ring in geom['coordinates']: coords.extend(ring)
                    elif geom['type'] == 'MultiPolygon':
                        for poly in geom['coordinates']:
                            for ring in poly: coords.extend(ring)
                    if coords:
                        lons = [c[0] for c in coords]
                        lats = [c[1] for c in coords]
                        z['polygon']      = geom
                        z['polygon_bbox'] = {'w': min(lons), 'e': max(lons),
                                             's': min(lats), 'n': max(lats)}
        result.append(z)
    return jsonify(result)


@app.route('/api/gate_check')
def gate_check():
    """Given a builder's candidate site (lat/lon/state), return every locked
    zone whose geography actually contains that point (county- or ZCTA-type
    zones only — state-wide and bbox zones are handled client-side and don't
    need a server round trip). The frontend uses this to enforce the zone's
    template min_score before letting the builder proceed."""
    try:
        lat   = float(request.args.get('lat', ''))
        lon   = float(request.args.get('lon', ''))
        state = (request.args.get('state') or '').strip().upper()
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'err': 'lat, lon, state required'}), 400

    with get_db() as db:
        rows = db.execute(
            '''SELECT z.id AS zone_id, z.name AS zone_name, z.agency_key,
                      z.zone_type, z.state_code, z.county_fips, z.zcta_code,
                      t.name AS template_name, t.weights_json, t.min_score
               FROM steward_zones z
               JOIN steward_templates t ON t.id = z.template_id
               WHERE t.locked = 1
                 AND z.zone_type IN ('county','zcta')
                 AND (z.state_code = ? OR z.state_code IS NULL)''',
            (state,)
        ).fetchall()

    gates = []
    for r in rows:
        matched = False
        if r['zone_type'] == 'county' and r['county_fips'] and state:
            matched = _point_in_county(lon, lat, state, r['county_fips'])
        elif r['zone_type'] == 'zcta' and r['zcta_code'] and state:
            matched = _point_in_zcta(lon, lat, state, r['zcta_code'])
        if matched:
            gates.append({
                'zone_id':       r['zone_id'],
                'zone_name':     r['zone_name'],
                'agency_key':    r['agency_key'],
                'template_name': r['template_name'],
                'weights':       json.loads(r['weights_json']),
                'min_score':     r['min_score'],
            })
    return jsonify(gates)


# ── demo case store (PostgreSQL — shared across all gunicorn workers) ──────────
# Anonymous ("try it without an account") submissions from builder_submit()
# land here rather than in `cases`. Uses Postgres (not a per-process dict) so
# the TTL and session scoping work correctly across multiple gunicorn workers.

@app.route('/api/demo/cases')
def demo_cases_list():
    """List the caller's own demo cases from the last 20 minutes."""
    # Scope the demo docket to the caller's own browser session. Without this it
    # returns every visitor's demo submission (contact email included) to everyone.
    sid = (request.args.get('session') or request.args.get('session_id') or '').strip()
    if not sid:
        return jsonify({'cases': [], 'total': 0})
    with get_db() as db:
        cases = db.execute(
            "SELECT * FROM demo_cases WHERE session = ? "
            "AND created_at > NOW() - INTERVAL '20 minutes' ORDER BY created_at DESC",
            (sid,)
        ).fetchall()
    return jsonify({'cases': cases, 'total': len(cases)})

@app.route('/api/demo/case/<case_id>/stage', methods=['PATCH'])
def demo_case_stage(case_id):
    """Advance a demo case's stage. No auth/session check — demo cases are
    ephemeral (20-min TTL) and not linked to anything sensitive, so this is
    intentionally looser than the real set_stage route."""
    data  = request.get_json(silent=True) or {}
    stage = (data.get('stage') or '').strip()
    if not stage:
        return jsonify({'ok': False, 'err': 'stage required'}), 400
    with get_db() as db:
        db.execute('UPDATE demo_cases SET stage=? WHERE case_id=?', (stage, case_id))
    return jsonify({'ok': True})

@app.route('/api/demo/case/<case_id>')
def demo_case_get(case_id):
    """Fetch one demo case by id, provided it hasn't aged past the 20-minute
    TTL — an expired row is treated the same as a missing one."""
    with get_db() as db:
        c = db.execute(
            "SELECT * FROM demo_cases WHERE case_id=? AND created_at > NOW() - INTERVAL '20 minutes'",
            (case_id,)
        ).fetchone()
    if not c:
        return jsonify({'ok': False, 'err': 'Demo case not found or expired (20-min TTL)'}), 404
    r = dict(c)
    if r.get('weights_json'):
        r['weights'] = json.loads(r.pop('weights_json'))
    else:
        r.pop('weights_json', None)
    return jsonify(r)

# ── permit justification report ───────────────────────────────────────────────

_zcta_centroids_cache = {}  # state_code -> [(cx, cy, props_dict), ...]


def _load_zcta_feature(state_code, lat, lon):
    """Return the ZCTA feature properties dict nearest to (lat, lon), or None."""
    if not state_code or lat is None or lon is None:
        return None
    state_code = state_code.upper()
    if state_code not in _zcta_centroids_cache:
        path = os.path.join(ROOT, 'data', state_code, 'zcta', 'grid_scores.geojson')
        if not os.path.exists(path):
            return None
        with open(path, 'r') as fh:
            gj = json.load(fh)
        entries = []
        for feat in gj.get('features', []):
            geom  = feat.get('geometry') or {}
            props = feat.get('properties') or {}
            gtype = geom.get('type', '')
            if gtype == 'Polygon':
                ring = geom['coordinates'][0]
            elif gtype == 'MultiPolygon':
                ring = max(geom['coordinates'], key=lambda p: len(p[0]))[0]
            else:
                continue
            cx = sum(c[0] for c in ring) / len(ring)
            cy = sum(c[1] for c in ring) / len(ring)
            entries.append((cx, cy, props))
        _zcta_centroids_cache[state_code] = entries
    entries = _zcta_centroids_cache[state_code]
    if not entries:
        return None
    lat_f = float(lat)
    lon_f = float(lon)
    return min(entries, key=lambda e: (e[0] - lon_f) ** 2 + (e[1] - lat_f) ** 2)[2]


def _build_report_context(case_row, props):
    """Build Jinja2 template context dict from a case DB row and ZCTA feature props."""
    generated_at = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    # Indicator rows
    inds = []
    for ind in _REPORT_INDICATORS:
        raw = props.get(ind['nat_col'])
        if raw is None:
            raw = 0.0
        nat = float(raw)
        pct = min(100, max(0, round(nat * 100)))
        if pct >= 75:
            quartile = 'Q4'
        elif pct >= 50:
            quartile = 'Q3'
        elif pct >= 25:
            quartile = 'Q2'
        else:
            quartile = 'Q1'
        inds.append({
            'label':      ind['label'],
            'k':          ind['k'],
            'nat':        nat,
            'pct':        pct,
            'quartile':   quartile,
            'confidence': ind['confidence'],
            'source':     ind['source'],
            'method':     ind['method'],
            'freq':       ind['freq'],
        })
    inds_sorted  = sorted(inds, key=lambda x: -x['nat'])
    strengths    = [i for i in inds_sorted if i['nat'] >= 0.5][:3]
    challenges   = [i for i in reversed(inds_sorted) if i['nat'] < 0.5][:3]
    # Hard gates
    # Use explicit None-check so that flood_score=0.0 is not swallowed by `or`.
    _flood_raw  = props.get('flood_score')
    flood_pass  = (_flood_raw is None) or (float(_flood_raw) > 0)
    protected_frac = float(props.get('protected_frac', 0) or 0)
    protected_pass = protected_frac <= 0.25
    gates = [
        {'label': 'Federal / tribal protected land', 'pass': protected_pass,
         'note': 'protected_frac = {:.0%} (> 25% threshold)'.format(protected_frac)},
        {'label': 'FEMA flood zone (SFHA)',          'pass': flood_pass,
         'note': 'flood_score = 0 — site intersects Special Flood Hazard Area'},
    ]
    # Which vertical this case/report is for (see _SITE_TYPES) — defaults to
    # datacenter for older cases and the pre-site_type Explorer route.
    site_type = (case_row or {}).get('site_type') or DEFAULT_SITE_TYPE
    composite = float((case_row or {}).get('score') or 0)
    if composite == 0 and props:
        # Explorer route (or any case with no saved score): compute the
        # composite using the site_type's default weight vector, rather than
        # a hardcoded Balanced-preset calc, so a BESS case's fallback report
        # actually reflects BESS weights instead of always reading as
        # datacenter's. _IND_KEYS weight keys -> ZCTA nat_col via _REPORT_INDICATORS.
        weights  = _weights_for_site_type(site_type)
        nat_cols = {ind['k']: ind['nat_col'] for ind in _REPORT_INDICATORS}
        total_w  = sum(weights.values()) or 100.0
        composite = sum(float(props.get(nat_cols[k], 0) or 0) * w
                        for k, w in weights.items() if w) / total_w
    return {
        'site_name':     (case_row or {}).get('site') or 'Unnamed site',
        'applicant':     (case_row or {}).get('applicant') or '',
        'state_code':    (case_row or {}).get('state_code') or '',
        'zcta':          props.get('zcta', ''),
        'composite':     composite,
        'composite_pct': min(100, max(0, round(composite * 100))),
        'stage':         (case_row or {}).get('stage') or '',
        'anchor':        (case_row or {}).get('anchor'),
        'weights':       (case_row or {}).get('weights'),
        'site_type':       site_type,
        'site_type_label': _SITE_TYPES.get(site_type, _SITE_TYPES[DEFAULT_SITE_TYPE])['label'],
        'inds':          inds_sorted,
        'strengths':     strengths,
        'challenges':    challenges,
        'gates':         gates,
        'all_gates_pass': all(g['pass'] for g in gates),
        'generated_at':  generated_at,
        'version':       'v2026.06.25',
    }


@app.route('/report/<case_id>')
def report_case(case_id):
    """Server-rendered (Jinja2, no React) permit justification report for a
    real or demo case — the document a builder can hand to a permitter as
    supporting evidence. Demo cases skip the access-control check (they're
    public/ephemeral already) and never carry an anchor, since only real
    cases reach Resolution and get anchored."""
    user    = _session_user()
    is_demo = case_id.startswith('demo-')
    with get_db() as db:
        if is_demo:
            row = db.execute('SELECT * FROM demo_cases WHERE case_id=?', (case_id,)).fetchone()
        else:
            row = db.execute('SELECT * FROM cases WHERE case_id=?', (case_id,)).fetchone()
    if not row:
        return 'Case not found', 404
    if not is_demo and not _can_access_case(user, row):
        return 'Unauthorized', 403
    r = dict(row)
    if r.get('weights_json'):
        r['weights'] = json.loads(r.pop('weights_json'))
    else:
        r.pop('weights_json', None)
    if not is_demo:
        with get_db() as db:
            anchor = db.execute(
                'SELECT hash, anchored_at FROM case_anchors WHERE case_id=?', (case_id,)
            ).fetchone()
        if anchor:
            r['anchor'] = {'hash': anchor['hash'], 'anchored_at': anchor['anchored_at']}
    props = _load_zcta_feature(r.get('state_code'), r.get('lat'), r.get('lon')) or {}
    ctx = _build_report_context(r, props)
    ctx.update({'case_id': case_id, 'is_demo': is_demo})
    return render_template('report.html', **ctx)


@app.route('/report')
def report_explorer():
    """Explorer report — no case required. Query params: state, lat, lon, name."""
    state     = (request.args.get('state') or '').upper()
    lat       = request.args.get('lat')
    lon       = request.args.get('lon')
    name      = request.args.get('name') or 'Unnamed site'
    site_type = request.args.get('site_type') if request.args.get('site_type') in _SITE_TYPES else DEFAULT_SITE_TYPE
    props = _load_zcta_feature(state, lat, lon) or {}
    fake  = {'site': name, 'applicant': '', 'state_code': state,
             'score': 0, 'stage': '', 'anchor': None, 'weights': None, 'site_type': site_type}
    ctx = _build_report_context(fake, props)
    ctx.update({'case_id': None, 'is_demo': False})
    return render_template('report.html', **ctx)


# ── static file serving ────────────────────────────────────────────────────────

# Only front-end asset types are served by the catch-all route. Anything else
# (source, secrets, databases, docs) is refused even if it sits in ROOT — the
# repo is rsynced to the server wholesale, so loose files must not be reachable.
# Note: '.txt' is intentionally NOT allowlisted — it would serve requirements.txt
# (and any other loose .txt) from the rsynced repo root. Add a dedicated route if
# a public robots.txt/security.txt is ever needed.
_ALLOWED_STATIC_EXT = {
    '.js', '.mjs', '.css', '.map', '.json', '.geojson', '.csv',
    '.html', '.htm', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.webp', '.woff', '.woff2', '.ttf', '.otf', '.eot',
}


def _bundle_version():
    """Cache-busting query param for bundle.js, derived from its file mtime
    on disk. Lets index.html be served with no-store while the JS bundle
    itself can still be cached hard by the browser/CDN between deploys."""
    try:
        return str(int(os.path.getmtime(os.path.join(ROOT, 'merascope', 'dist', 'bundle.js'))))
    except Exception:
        return '1'

@app.route('/')
def index():
    """Serve the SPA shell. Rewrites the bundle.js script tag to include
    ?v=<mtime> so a fresh deploy is picked up immediately instead of being
    served from a stale cached bundle."""
    with open(os.path.join(ROOT, 'index.html'), 'r') as f:
        html = f.read().replace(
            'merascope/dist/bundle.js"',
            'merascope/dist/bundle.js?v=' + _bundle_version() + '"'
        )
    resp = Response(html, mimetype='text/html')
    resp.headers['Cache-Control'] = 'no-store'
    return resp

@app.route('/<path:path>')
def static_files(path):
    """Catch-all static asset server (JS/CSS/images/fonts/etc. under ROOT).
    Also implicitly serves the React SPA's client-side routes: any path that
    doesn't match a real file/allowlisted extension falls through to 404
    rather than index.html, so this relies on the frontend using hash-based
    routing (#/...) instead of real paths for its client-side router."""
    # Refuse dotfiles / dot-directories (.env, .git, ...) at any depth.
    if any(seg.startswith('.') for seg in path.split('/')):
        return 'Not found', 404
    # Serve only known front-end asset types; blocks .py/.db/.pdf/.sql/.md/etc.
    if os.path.splitext(path)[1].lower() not in _ALLOWED_STATIC_EXT:
        return 'Not found', 404
    return send_from_directory(ROOT, path)


# ── entrypoint ─────────────────────────────────────────────────────────────────

# Idempotent — CREATE TABLE IF NOT EXISTS. Wrapped so import succeeds even
# when DATABASE_URL is unset (tests patch _pool before calling init_db themselves).
try:
    init_db()
except Exception as _e:
    print('Warning: database init skipped —', _e)

if __name__ == '__main__':
    os.makedirs(DOCS_DIR, exist_ok=True)
    print('Merascope server starting on http://localhost:8877')
    app.run(port=8877, debug=True, use_reloader=True)
