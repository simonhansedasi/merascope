"""
Merascope server — PostgreSQL backend.
Requires DATABASE_URL env var: postgresql://user:pass@host/dbname
"""

from flask import Flask, request, jsonify, send_from_directory, Response, redirect, g
from werkzeug.utils import secure_filename
from contextlib import contextmanager
from datetime import datetime, date as _date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import wraps
import psycopg2
import psycopg2.extras
import psycopg2.pool
import json, csv, io, os, secrets, smtplib

try:
    import boto3
    from botocore.client import Config as BotoConfig
except ImportError:
    boto3 = None

app = Flask(__name__)
ROOT     = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(ROOT, 'data', 'docs')

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
    if role == 'steward':
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
    return jsonify({'ok': True, 'id': cur.lastrowid})

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
    user        = _session_user()
    owner_email = user['email'] if user else None
    with get_db() as db:
        count   = db.execute('SELECT COUNT(*) as n FROM cases').fetchone()['n']
        yr      = datetime.now().strftime('%y')
        case_id = '{}-{}'.format(yr, 1000 + count + 1)
        db.execute(
            '''INSERT INTO cases
               (case_id, site, applicant, score, stage,
                cell_fid, state_code, lat, lon,
                contact_name, contact_email, lead_agency, notes,
                external_permit_id, imported, owner_email)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (case_id, site, applicant, score, stage,
             cell_fid, state_code, lat, lon,
             contact_name, contact_email, lead_agency, notes,
             external_permit_id, imported, owner_email)
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
    return jsonify(row)


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
    return jsonify({'ok': True})


# ── impasse routing ────────────────────────────────────────────────────────────

@app.route('/api/impasse/routes')
def get_impasse_routes():
    with get_db() as db:
        rows = db.execute('SELECT item_key FROM case_impasse_routes').fetchall()
    return jsonify([r['item_key'] for r in rows])

@app.route('/api/impasse/route', methods=['POST'])
def add_impasse_route():
    data = request.get_json(silent=True) or {}
    key  = (data.get('key') or '').strip()
    if not key:
        return jsonify({'ok': False, 'err': 'key required'}), 400
    with get_db() as db:
        db.execute(
            'INSERT INTO case_impasse_routes (item_key) VALUES (?) ON CONFLICT DO NOTHING', (key,)
        )
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
    return jsonify({'ok': True, 'id': cur.lastrowid})


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
_SECURE    = APP_URL.startswith('https')


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

    text = 'Click the link below to sign in to Merascope (expires in 1 hour):\n\n{}\n\nIf you did not request this, ignore this email.'.format(link)
    html = '''<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
  <h2 style="font-size:20px;margin:0 0 8px">Sign in to Merascope</h2>
  <p style="color:#555;font-size:14px;margin:0 0 24px">Click below to sign in. This link expires in 1 hour.</p>
  <a href="{link}" style="display:inline-block;padding:12px 22px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:7px;font-size:14px">Sign in to Merascope</a>
  <p style="color:#999;font-size:12px;margin:24px 0 0">If you did not request this, ignore this email.<br>Link: {link}</p>
</div>'''.format(link=link)

    msg.attach(MIMEText(text, 'plain'))
    msg.attach(MIMEText(html, 'html'))

    with smtplib.SMTP(host, port) as s:
        s.ehlo()
        s.starttls()
        s.login(user, pw)
        s.sendmail(sender, [to_email], msg.as_string())


def require_auth(f):
    """Decorator — attaches g.user_email, g.user_role, g.agency_key or returns 401."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('mera_sess', '')
        if not token:
            return jsonify({'ok': False, 'err': 'unauthorized'}), 401
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
        g.user_email  = row['email']
        g.user_role   = row['role'] or 'builder'
        g.agency_key  = row['agency_key']
        return f(*args, **kwargs)
    return decorated


@app.route('/api/auth/request', methods=['POST'])
def auth_request():
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


# ── static file serving ────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(ROOT, 'index.html')

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
