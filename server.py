"""
Merascope server — PostgreSQL backend.
Requires DATABASE_URL env var: postgresql://user:pass@host/dbname
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
import json, csv, io, os, secrets, smtplib, time, threading, hashlib

try:
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

def _check_rate_limit(ip):
    now = time.time()
    with _rl_lock:
        hits = [t for t in _rl_store.get(ip, []) if now - t < _RL_WINDOW]
        if len(hits) >= _RL_LIMIT:
            return False
        hits.append(now)
        _rl_store[ip] = hits
    return True


ROOT     = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(ROOT, 'data', 'docs')

# ── report indicator metadata (mirrors data.js INDICATORS) ────────────────────

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

S3_BUCKET = os.environ.get('S3_BUCKET', 'merascope-docs')
_USE_S3   = bool(os.environ.get('S3_ENDPOINT'))
_s3       = None

def _get_s3():
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
_pool    = None


# ── connection pool ────────────────────────────────────────────────────────────

def _get_pool():
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


def _row(row):
    return {k: _coerce(v) for k, v in row.items()} if row else None


class _DB:
    """Wraps a psycopg2 cursor to match the db.execute().fetchall() pattern used throughout."""
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=()):
        self._cur.execute(sql.replace('?', '%s'), params or ())
        return self

    def fetchone(self):
        return _row(self._cur.fetchone())

    def fetchall(self):
        return [_row(r) for r in self._cur.fetchall()]

    @property
    def lastrowid(self):
        row = self._cur.fetchone()
        return row['id'] if row else None


def _session_user():
    """Return {email, role, agency_key} from the mera_sess cookie, or None."""
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
    """Return True if user may read the given case row (dict with owner_email)."""
    if user is None:
        return True  # unauthenticated demo access
    role = user.get('role') or 'builder'
    if role in ('steward', 'admin'):
        return True
    if role == 'co-party':
        return True  # filtered at query level
    # builder
    owner = (case_row or {}).get('owner_email')
    return owner is None or owner == user['email']


@contextmanager
def get_db():
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

        db.execute('''CREATE TABLE IF NOT EXISTS case_invites (
            id          SERIAL PRIMARY KEY,
            case_id     TEXT NOT NULL,
            agency_key  TEXT NOT NULL,
            ts          TIMESTAMP DEFAULT NOW(),
            UNIQUE(case_id, agency_key)
        )''')

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

        db.execute('''CREATE TABLE IF NOT EXISTS case_docs (
            id            SERIAL PRIMARY KEY,
            case_id       TEXT NOT NULL,
            filename      TEXT NOT NULL,
            original_name TEXT,
            label         TEXT,
            doc_status    TEXT,
            ts            TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_meta (
            case_id           TEXT PRIMARY KEY,
            rebuttal_due_date TEXT,
            rebuttal_cycle    INTEGER DEFAULT 1,
            rebuttal_max      INTEGER DEFAULT 3
        )''')

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

        db.execute('''CREATE TABLE IF NOT EXISTS case_stage_overrides (
            case_id TEXT PRIMARY KEY,
            stage   TEXT NOT NULL,
            ts      TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_impasse_routes (
            id       SERIAL PRIMARY KEY,
            item_key TEXT NOT NULL UNIQUE,
            ts       TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS study_checks (
            id          SERIAL PRIMARY KEY,
            study_name  TEXT NOT NULL,
            section_idx INTEGER NOT NULL,
            ts          TIMESTAMP DEFAULT NOW(),
            UNIQUE(study_name, section_idx)
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS studies (
            id    SERIAL PRIMARY KEY,
            name  TEXT NOT NULL UNIQUE,
            body  TEXT,
            due   TEXT,
            ts    TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS litigation (
            id     SERIAL PRIMARY KEY,
            name   TEXT NOT NULL,
            court  TEXT,
            no     TEXT,
            status TEXT DEFAULT 'Active',
            filed  TEXT,
            ts     TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_rebuttals (
            id      SERIAL PRIMARY KEY,
            case_id TEXT NOT NULL,
            text    TEXT NOT NULL,
            ts      TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS crm_state (
            fid   TEXT PRIMARY KEY,
            state TEXT NOT NULL,
            ts    TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS users (
            email      TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS user_roles (
            email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            role       TEXT NOT NULL,
            agency_key TEXT,
            PRIMARY KEY (email, role)
        )''')

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

        db.execute("ALTER TABLE studies ADD COLUMN IF NOT EXISTS case_id TEXT")
        db.execute("ALTER TABLE studies ADD COLUMN IF NOT EXISTS finding TEXT")
        db.execute("ALTER TABLE studies DROP CONSTRAINT IF EXISTS studies_name_key")
        db.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS weights_json TEXT")
        db.execute("ALTER TABLE demo_cases ADD COLUMN IF NOT EXISTS weights_json TEXT")
        db.execute('''CREATE TABLE IF NOT EXISTS case_anchors (
            case_id      TEXT PRIMARY KEY,
            hash         TEXT NOT NULL,
            anchored_at  TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )''')

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


# ── event log ─────────────────────────────────────────────────────────────────

@app.route('/api/log', methods=['POST'])
def log_event():
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


@app.route('/api/export/workspace')
def export_workspace():
    sid = request.args.get('session_id')
    with get_db() as db:
        rows = db.execute(
            '''SELECT * FROM event_log
               WHERE event_type = 'save_cell'
               AND (? IS NULL OR session_id = ?)
               ORDER BY ts DESC''',
            (sid, sid)
        ).fetchall()

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(['fid', 'session_id', 'state', 'lat', 'lon', 'municipality',
                'nat_composite', 'state_composite', 'state_rank', 'state_rank_total',
                'flat_frac', 'protected_frac', 'flood_score',
                'tx_score_nat', 'water_score_nat', 'ej_score_nat',
                'seismic_score_nat', 'geothermal_score_nat', 'aquifer_score_nat',
                'saved_at'])
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
            pr.get('flat_frac'), pr.get('protected_frac'), pr.get('flood_score'),
            pr.get('tx_score_nat'), pr.get('water_score_nat'), pr.get('ej_score_nat'),
            pr.get('seismic_score_nat'), pr.get('geothermal_score_nat'), pr.get('aquifer_score_nat'),
            row['ts'],
        ])

    return Response(
        out.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=merascope_workspace.csv'}
    )


@app.route('/api/export/status')
def export_status():
    sid = request.args.get('session_id')
    with get_db() as db:
        rows = db.execute(
            '''SELECT * FROM event_log
               WHERE event_type IN ('status_change','activity_log','contact_add','contact_remove','note_update')
               AND (? IS NULL OR session_id = ?)
               ORDER BY fid, ts''',
            (sid, sid)
        ).fetchall()

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(['fid', 'session_id', 'event_type', 'event_date', 'detail', 'logged_at'])
    for row in rows:
        p = json.loads(row['payload'] or '{}')
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
    key = request.args.get('key', '')
    if key != os.environ.get('MERA_ADMIN_KEY', 'devonly'):
        return jsonify({'err': 'forbidden'}), 403
    sid   = request.args.get('session_id')
    etype = request.args.get('event_type')
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
    with get_db() as db:
        rows = db.execute(
            'SELECT agency_key FROM case_invites WHERE case_id=? ORDER BY ts', (case_id,)
        ).fetchall()
    return jsonify([r['agency_key'] for r in rows])

@app.route('/api/case/<case_id>/invite', methods=['POST'])
def add_invite(case_id):
    data = request.get_json(silent=True) or {}
    key  = (data.get('agency_key') or '').strip()
    if not key:
        return jsonify({'ok': False, 'err': 'agency_key required'}), 400
    with get_db() as db:
        db.execute(
            'INSERT INTO case_invites (case_id, agency_key) VALUES (?,?) ON CONFLICT DO NOTHING',
            (case_id, key)
        )
    return jsonify({'ok': True})


# ── conditions ────────────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/conditions')
def get_conditions(case_id):
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_conditions WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify(rows)

@app.route('/api/case/<case_id>/conditions', methods=['POST'])
def add_condition(case_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        cur = db.execute(
            '''INSERT INTO case_conditions
               (case_id, text, by, type, status, pending_approval, submitted_by_role)
               VALUES (?,?,?,?,?,?,?) RETURNING id''',
            (case_id, data.get('text', ''), data.get('by', ''), data.get('type', 'Water'),
             data.get('status', 'Proposed'), 1 if data.get('pending_approval') else 0,
             data.get('submitted_by_role', 'lead'))
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})

@app.route('/api/case/<case_id>/conditions/<int:cond_id>', methods=['PATCH'])
def update_condition(case_id, cond_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        if data.get('approve'):
            db.execute(
                'UPDATE case_conditions SET pending_approval=0, status=? WHERE id=? AND case_id=?',
                ('Proposed', cond_id, case_id)
            )
        elif 'status' in data:
            db.execute(
                'UPDATE case_conditions SET status=? WHERE id=? AND case_id=?',
                (data['status'], cond_id, case_id)
            )
    return jsonify({'ok': True})

@app.route('/api/case/<case_id>/conditions/<int:cond_id>', methods=['DELETE'])
def delete_condition(case_id, cond_id):
    with get_db() as db:
        db.execute('DELETE FROM case_conditions WHERE id=? AND case_id=?', (cond_id, case_id))
    return jsonify({'ok': True})


# ── documents ─────────────────────────────────────────────────────────────────

def _check_case_access(case_id):
    """Return (case_row_or_None, error_response_or_None). None case_row = demo case, allow."""
    user = _session_user()
    with get_db() as db:
        case_row = db.execute('SELECT owner_email FROM cases WHERE case_id=?', (case_id,)).fetchone()
    if not _can_access_case(user, case_row):
        return None, (jsonify({'ok': False, 'err': 'not found'}), 403)
    return case_row, None


@app.route('/api/case/<case_id>/docs')
def get_docs(case_id):
    _, err = _check_case_access(case_id)
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
    _, err = _check_case_access(case_id)
    if err:
        return err
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
    _, err = _check_case_access(case_id)
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
    data  = request.get_json(silent=True) or {}
    due   = data.get('due_date', '')
    cycle = int(data.get('cycle', 1))
    max_c = int(data.get('max_cycles', 3))
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
    user   = _session_user()
    role   = (user or {}).get('role')
    limit  = min(int(request.args.get('limit', 50)), 200)
    offset = max(int(request.args.get('offset', 0)), 0)
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
            total = db.execute('SELECT COUNT(*) as n FROM cases').fetchone()['n']
            rows  = db.execute(
                'SELECT * FROM cases ORDER BY ts DESC LIMIT ? OFFSET ?',
                (limit, offset)
            ).fetchall()
    return jsonify({'cases': rows, 'total': total, 'limit': limit, 'offset': offset})

@app.route('/api/cases', methods=['POST'])
def create_case():
    data      = request.get_json(silent=True) or {}
    site      = (data.get('site') or '').strip()
    applicant = (data.get('applicant') or '').strip()
    score     = float(data.get('score', 0.5))
    if not site or not applicant:
        return jsonify({'ok': False, 'err': 'site and applicant required'}), 400
    with get_db() as db:
        count   = db.execute('SELECT COUNT(*) as n FROM cases').fetchone()['n']
        yr      = datetime.now().strftime('%y')
        case_id = '{}-{}'.format(yr, 1000 + count + 1)
        db.execute(
            'INSERT INTO cases (case_id, site, applicant, score, stage) VALUES (?,?,?,?,?)',
            (case_id, site, applicant, score, 'Site Inquiry')
        )
    return jsonify({'ok': True, 'case_id': case_id})

@app.route('/api/builder/submit', methods=['POST'])
def builder_submit():
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
    user        = _session_user()

    if not user:
        demo_id = 'demo-{}'.format(secrets.token_hex(4))
        with get_db() as db:
            db.execute(
                '''INSERT INTO demo_cases
                   (case_id, site, applicant, score, stage, state_code, lat, lon,
                    contact_name, contact_email, lead_agency, notes, weights_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (demo_id, site, applicant, score, stage, state_code, lat, lon,
                 contact_name, contact_email, lead_agency, notes, weights_json)
            )
        return jsonify({'ok': True, 'case_id': demo_id, 'is_demo': True})

    owner_email = user['email']

    with get_db() as db:
        count   = db.execute('SELECT COUNT(*) as n FROM cases').fetchone()['n']
        yr      = datetime.now().strftime('%y')
        case_id = '{}-{}'.format(yr, 1000 + count + 1)
        db.execute(
            '''INSERT INTO cases
               (case_id, site, applicant, score, stage,
                cell_fid, state_code, lat, lon,
                contact_name, contact_email, lead_agency, notes,
                external_permit_id, imported, owner_email, weights_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (case_id, site, applicant, score, stage,
             cell_fid, state_code, lat, lon,
             contact_name, contact_email, lead_agency, notes,
             external_permit_id, imported, owner_email, weights_json)
        )
    return jsonify({'ok': True, 'case_id': case_id})

@app.route('/api/builder/case/<case_id>/confirm', methods=['PATCH'])
def confirm_case(case_id):
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
    return jsonify({'ok': True, 'agency_tracking_id': tracking, 'confirmed_at': now})

@app.route('/api/builder/case/<case_id>')
def get_builder_case(case_id):
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
    with get_db() as db:
        row = db.execute('SELECT state FROM crm_state WHERE fid=?', (fid,)).fetchone()
    return jsonify(json.loads(row['state']) if row else None)

@app.route('/api/crm/<fid>', methods=['POST'])
def save_crm(fid):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        db.execute(
            '''INSERT INTO crm_state (fid, state) VALUES (?,?)
               ON CONFLICT (fid) DO UPDATE SET state=EXCLUDED.state, ts=NOW()''',
            (fid, json.dumps(data))
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
        'SELECT agency_key FROM case_invites WHERE case_id=? ORDER BY agency_key',
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
        'co_parties': [r['agency_key'] for r in invites],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    hash_val  = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    return hash_val, canonical


# ── stage transitions ─────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/stage')
def get_stage(case_id):
    with get_db() as db:
        row = db.execute('SELECT stage FROM case_stage_overrides WHERE case_id=?', (case_id,)).fetchone()
    return jsonify(row['stage'] if row else None)

@app.route('/api/case/<case_id>/stage', methods=['PATCH'])
def set_stage(case_id):
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
    return jsonify({'ok': True})


# ── impasse routing ────────────────────────────────────────────────────────────

@app.route('/api/impasse/routes')
def get_impasse_routes():
    with get_db() as db:
        rows = db.execute('SELECT item_key FROM case_impasse_routes').fetchall()
    return jsonify([r['item_key'] for r in rows])

@app.route('/api/impasse/route', methods=['POST'])
def add_impasse_route():
    data    = request.get_json(silent=True) or {}
    key     = (data.get('key') or '').strip()
    case_id = (data.get('case_id') or '').strip()
    if not key:
        return jsonify({'ok': False, 'err': 'key required'}), 400
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
                '''INSERT INTO event_log (session_id, fid, event_type, payload_json)
                   VALUES (?,?,?,?)''',
                ('', case_id, 'status_change',
                 json.dumps({'stage': 'Mediation', 'note': 'Routed to mediation via impasse register'}))
            )
    return jsonify({'ok': True})


# ── impasse items (conditions with status='Impasse') ─────────────────────────

@app.route('/api/impasse/items')
def get_impasse_items():
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
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_rebuttals WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify(rows)

@app.route('/api/case/<case_id>/rebuttal', methods=['POST'])
def add_rebuttal(case_id):
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

@app.route('/api/studies/checks')
def get_study_checks():
    with get_db() as db:
        rows = db.execute('SELECT study_name, section_idx FROM study_checks').fetchall()
    return jsonify(rows)

@app.route('/api/studies/check', methods=['POST'])
def toggle_study_check():
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

APP_URL    = os.environ.get('APP_URL', 'http://localhost:8877')
MAGIC_TTL  = timedelta(hours=1)
SESS_TTL   = timedelta(days=30)
_SECURE    = os.environ.get('APP_ENV') == 'production'


def _send_magic_email(to_email, token):
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



@app.route('/api/auth/request', methods=['POST'])
def auth_request():
    ip = request.headers.get('X-Real-IP') or request.remote_addr
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
    token = request.cookies.get('mera_sess', '')
    if token:
        with get_db() as db:
            db.execute('DELETE FROM sessions WHERE token=?', (token,))
    resp = jsonify({'ok': True})
    resp.delete_cookie('mera_sess')
    return resp


# ── steward templates — presets + helpers ─────────────────────────────────────

_IND_KEYS = [
    'transmission', 'water', 'community', 'seismic', 'flood', 'contamination',
    'waterway', 'geothermal', 'flatness', 'aquifer', 'soil', 'slope',
    'pop_exposure', 'soil_profile', 'ksat',
    # supplemental (scripts 11-16)
    'substation', 'superfund', 'rcra', 'air_quality', 'fiber', 'water_stress', 'grid_capacity',
]

def _zero_weights():
    return {k: 0 for k in _IND_KEYS}

PRESET_TEMPLATES = [
    {
        'id': 'balanced',
        'name': 'Balanced',
        'description': 'Merascope defaults. Equal weighting across the three primary pillars — transmission, water, and community burden. Good starting point for state-level screening.',
        'weights': {**_zero_weights(), 'transmission': 40, 'water': 35, 'community': 25},
        'min_score': 0.40,
    },
    {
        'id': 'grid_complete',
        'name': 'Grid-Complete',
        'description': 'Full grid infrastructure stack. Weights transmission proximity, substation access, ISO interconnection queue headroom, and fiber density equally alongside water. Suited for developers prioritizing shovel-ready grid connection.',
        'weights': {**_zero_weights(), 'transmission': 25, 'substation': 20, 'grid_capacity': 20, 'fiber': 15, 'water': 15, 'community': 5},
        'min_score': 0.40,
    },
    {
        'id': 'water_durability',
        'name': 'Water Durability',
        'description': 'Long-term water security. Weights surface availability and WRI Aqueduct chronic stress index together. Suited for drought-stressed or water-rights-constrained jurisdictions.',
        'weights': {**_zero_weights(), 'water': 45, 'water_stress': 25, 'transmission': 20, 'community': 10},
        'min_score': 0.50,
    },
    {
        'id': 'contamination_screen',
        'name': 'Contamination Screen',
        'description': 'Strict environmental due diligence. Screens for TRI facility proximity, Superfund NPL distance, RCRA corrective action sites, and NAAQS air quality attainment alongside community burden. Designed for jurisdictions requiring Phase I/II ESA screening at the planning stage.',
        'weights': {**_zero_weights(), 'contamination': 20, 'superfund': 20, 'rcra': 20, 'air_quality': 15, 'community': 15, 'water': 10},
        'min_score': 0.50,
    },
    {
        'id': 'ej_forward',
        'name': 'EJ Forward',
        'description': 'Community health-first screening. Combines EJ burden, NAAQS attainment, and contamination distance. Designed for jurisdictions with cumulative-impact mandates or health-based siting ordinances. Highest minimum score.',
        'weights': {**_zero_weights(), 'community': 30, 'air_quality': 20, 'contamination': 15, 'superfund': 10, 'rcra': 10, 'water': 10, 'transmission': 5},
        'min_score': 0.55,
    },
]


# ── boundary GeoJSON cache + point-in-polygon ─────────────────────────────────

_geo_cache = {}

def _load_boundary(path):
    if path not in _geo_cache:
        try:
            with open(path) as f:
                _geo_cache[path] = json.load(f)
        except FileNotFoundError:
            _geo_cache[path] = None
    return _geo_cache[path]


def _point_in_ring(lon, lat, ring):
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
    return jsonify(PRESET_TEMPLATES)


# ── steward templates CRUD ────────────────────────────────────────────────────

@app.route('/api/steward/templates')
@require_steward
def list_steward_templates():
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
    data    = request.get_json(silent=True) or {}
    name    = (data.get('name') or '').strip()
    weights = data.get('weights') or {}
    min_sc  = float(data.get('min_score', 0.40))
    if not name:
        return jsonify({'ok': False, 'err': 'name required'}), 400
    # Fill any missing indicator keys with 0
    full_w = {**_zero_weights(), **{k: float(v) for k, v in weights.items() if k in _IND_KEYS}}
    with get_db() as db:
        cur = db.execute(
            '''INSERT INTO steward_templates (agency_key, name, weights_json, min_score)
               VALUES (?,?,?,?) RETURNING id''',
            (g.agency_key, name, json.dumps(full_w), min_sc)
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})


@app.route('/api/steward/templates/<int:tmpl_id>', methods=['PATCH'])
@require_steward
def update_steward_template(tmpl_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        row = db.execute(
            'SELECT * FROM steward_templates WHERE id=? AND agency_key=?',
            (tmpl_id, g.agency_key)
        ).fetchone()
        if not row:
            return jsonify({'ok': False, 'err': 'not found'}), 404
        name    = (data.get('name') or row['name']).strip()
        min_sc  = float(data.get('min_score', row['min_score']))
        locked  = int(data['locked']) if 'locked' in data else row['locked']
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
        summary = ', '.join(parts) or 'updated'
        # snapshot current state before overwriting
        db.execute(
            '''INSERT INTO template_history
               (template_id, agency_key, changed_by, weights_json, min_score, locked, summary)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (tmpl_id, g.agency_key, g.user_email,
             row['weights_json'], row['min_score'], row['locked'], summary)
        )
        db.execute(
            '''UPDATE steward_templates
               SET name=?, weights_json=?, min_score=?, locked=?, updated_at=NOW()
               WHERE id=? AND agency_key=?''',
            (name, w_json, min_sc, locked, tmpl_id, g.agency_key)
        )
    return jsonify({'ok': True})


@app.route('/api/steward/templates/<int:tmpl_id>/history')
@require_steward
def get_template_history(tmpl_id):
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

def _shape_zone(r):
    z = dict(r)
    z['bbox'] = json.loads(z['bbox_json']) if z.get('bbox_json') else None
    z.pop('bbox_json', None)
    return z


@app.route('/api/steward/zones')
@require_steward
def list_steward_zones():
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

@app.route('/api/zones/active')
def zones_active():
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

@app.route('/api/demo/cases')
def demo_cases_list():
    with get_db() as db:
        cases = db.execute(
            "SELECT * FROM demo_cases WHERE created_at > NOW() - INTERVAL '20 minutes' ORDER BY created_at DESC"
        ).fetchall()
    return jsonify({'cases': cases, 'total': len(cases)})

@app.route('/api/demo/case/<case_id>/stage', methods=['PATCH'])
def demo_case_stage(case_id):
    data  = request.get_json(silent=True) or {}
    stage = (data.get('stage') or '').strip()
    if not stage:
        return jsonify({'ok': False, 'err': 'stage required'}), 400
    with get_db() as db:
        db.execute('UPDATE demo_cases SET stage=? WHERE case_id=?', (stage, case_id))
    return jsonify({'ok': True})

@app.route('/api/demo/case/<case_id>')
def demo_case_get(case_id):
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
    composite = float((case_row or {}).get('score') or 0)
    if composite == 0 and props:
        # Explorer route: compute Balanced preset (tx 40 / water 35 / community 25)
        balanced = {'tx_score_nat': 40, 'water_score_nat': 35, 'ej_score_nat': 25}
        total_w  = 100.0
        composite = sum(float(props.get(col, 0) or 0) * w for col, w in balanced.items()) / total_w
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
    state = (request.args.get('state') or '').upper()
    lat   = request.args.get('lat')
    lon   = request.args.get('lon')
    name  = request.args.get('name') or 'Unnamed site'
    props = _load_zcta_feature(state, lat, lon) or {}
    fake  = {'site': name, 'applicant': '', 'state_code': state,
             'score': 0, 'stage': '', 'anchor': None, 'weights': None}
    ctx = _build_report_context(fake, props)
    ctx.update({'case_id': None, 'is_demo': False})
    return render_template('report.html', **ctx)


# ── static file serving ────────────────────────────────────────────────────────

def _bundle_version():
    try:
        return str(int(os.path.getmtime(os.path.join(ROOT, 'merascope', 'dist', 'bundle.js'))))
    except Exception:
        return '1'

@app.route('/')
def index():
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
