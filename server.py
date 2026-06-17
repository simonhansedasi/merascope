"""
Merascope dev/prod server.
Replaces `python3 -m http.server 8877`.
Serves static files + provides API routes for server-side event logging and CSV export.
"""

from flask import Flask, request, jsonify, send_from_directory, Response
from datetime import date as _date
from werkzeug.utils import secure_filename
import sqlite3, json, csv, io, os

app = Flask(__name__)
ROOT = os.path.dirname(os.path.abspath(__file__))
DB   = os.path.join(ROOT, 'merascope_log.db')
DOCS_DIR = os.path.join(ROOT, 'data', 'docs')


# ── database ──────────────────────────────────────────────────────────────────

def get_db():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with get_db() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS event_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT,
            fid          INTEGER,
            event_type   TEXT,
            payload      TEXT,
            ts           DATETIME DEFAULT (datetime('now'))
        )''')
        db.execute('CREATE INDEX IF NOT EXISTS idx_session ON event_log(session_id)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_fid     ON event_log(fid)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_type    ON event_log(event_type)')

        db.execute('''CREATE TABLE IF NOT EXISTS case_invites (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id     TEXT NOT NULL,
            agency_key  TEXT NOT NULL,
            ts          DATETIME DEFAULT (datetime('now')),
            UNIQUE(case_id, agency_key)
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_conditions (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id           TEXT NOT NULL,
            text              TEXT NOT NULL,
            by                TEXT,
            type              TEXT DEFAULT 'Water',
            status            TEXT DEFAULT 'Proposed',
            pending_approval  INTEGER DEFAULT 0,
            submitted_by_role TEXT DEFAULT 'lead',
            ts                DATETIME DEFAULT (datetime('now'))
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_docs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id       TEXT NOT NULL,
            filename      TEXT NOT NULL,
            original_name TEXT,
            ts            DATETIME DEFAULT (datetime('now'))
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_meta (
            case_id           TEXT PRIMARY KEY,
            rebuttal_due_date TEXT,
            rebuttal_cycle    INTEGER DEFAULT 1,
            rebuttal_max      INTEGER DEFAULT 3
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS cases (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id     TEXT NOT NULL UNIQUE,
            site        TEXT,
            applicant   TEXT,
            score       REAL DEFAULT 0.5,
            stage       TEXT DEFAULT 'Application',
            days        INTEGER DEFAULT 0,
            ts          DATETIME DEFAULT (datetime('now'))
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_stage_overrides (
            case_id TEXT PRIMARY KEY,
            stage   TEXT NOT NULL,
            ts      DATETIME DEFAULT (datetime('now'))
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_impasse_routes (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            item_key TEXT NOT NULL UNIQUE,
            ts       DATETIME DEFAULT (datetime('now'))
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS study_checks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            study_name  TEXT NOT NULL,
            section_idx INTEGER NOT NULL,
            ts          DATETIME DEFAULT (datetime('now')),
            UNIQUE(study_name, section_idx)
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS case_rebuttals (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            text    TEXT NOT NULL,
            ts      DATETIME DEFAULT (datetime('now'))
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS crm_state (
            fid  TEXT PRIMARY KEY,
            state TEXT NOT NULL,
            ts   DATETIME DEFAULT (datetime('now'))
        )''')


# ── event log ─────────────────────────────────────────────────────────────────

@app.route('/api/log', methods=['POST'])
def log_event():
    data = request.get_json(silent=True) or {}
    sid  = data.get('session_id')
    fid  = data.get('fid')
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
    sid  = request.args.get('session_id')
    etype = request.args.get('event_type')
    q = 'SELECT * FROM event_log WHERE 1=1'
    params = []
    if sid:   q += ' AND session_id=?';   params.append(sid)
    if etype: q += ' AND event_type=?'; params.append(etype)
    q += ' ORDER BY ts DESC LIMIT 500'
    with get_db() as db:
        rows = [dict(r) for r in db.execute(q, params).fetchall()]
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
    key = (data.get('agency_key') or '').strip()
    if not key:
        return jsonify({'ok': False, 'err': 'agency_key required'}), 400
    with get_db() as db:
        try:
            db.execute('INSERT INTO case_invites (case_id, agency_key) VALUES (?,?)', (case_id, key))
        except Exception:
            pass  # UNIQUE constraint — already invited
    return jsonify({'ok': True})


# ── conditions ────────────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/conditions')
def get_conditions(case_id):
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_conditions WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/case/<case_id>/conditions', methods=['POST'])
def add_condition(case_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        cur = db.execute(
            '''INSERT INTO case_conditions
               (case_id, text, by, type, status, pending_approval, submitted_by_role)
               VALUES (?,?,?,?,?,?,?)''',
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

@app.route('/api/case/<case_id>/docs')
def get_docs(case_id):
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_docs WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify([{
        'id': r['id'], 'name': r['original_name'],
        'filename': r['filename'], 'date': r['ts'][:10]
    } for r in rows])

@app.route('/api/case/<case_id>/docs', methods=['POST'])
def upload_doc(case_id):
    if 'file' not in request.files:
        return jsonify({'ok': False, 'err': 'no file'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'ok': False, 'err': 'empty filename'}), 400
    safe = secure_filename(f.filename)
    case_dir = os.path.join(DOCS_DIR, case_id)
    os.makedirs(case_dir, exist_ok=True)
    base, ext = os.path.splitext(safe)
    candidate, n = safe, 1
    while os.path.exists(os.path.join(case_dir, candidate)):
        candidate = '{}_{}{}'.format(base, n, ext)
        n += 1
    f.save(os.path.join(case_dir, candidate))
    with get_db() as db:
        db.execute(
            'INSERT INTO case_docs (case_id, filename, original_name) VALUES (?,?,?)',
            (case_id, candidate, f.filename)
        )
    return jsonify({'ok': True, 'filename': candidate, 'name': f.filename})

@app.route('/api/case/<case_id>/docs/<filename>')
def serve_doc(case_id, filename):
    safe = secure_filename(filename)
    return send_from_directory(os.path.join(DOCS_DIR, case_id), safe)


# ── rebuttal deadline ─────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/deadline')
def get_deadline(case_id):
    with get_db() as db:
        row = db.execute('SELECT * FROM case_meta WHERE case_id=?', (case_id,)).fetchone()
    if not row or not row['rebuttal_due_date']:
        return jsonify(None)
    try:
        due = _date.fromisoformat(row['rebuttal_due_date'])
        days = max(0, (due - _date.today()).days)
    except ValueError:
        return jsonify(None)
    return jsonify({'days': days, 'cycle': row['rebuttal_cycle'], 'max_cycles': row['rebuttal_max']})

@app.route('/api/case/<case_id>/deadline', methods=['POST'])
def set_deadline(case_id):
    data = request.get_json(silent=True) or {}
    due   = data.get('due_date', '')
    cycle = int(data.get('cycle', 1))
    max_c = int(data.get('max_cycles', 3))
    with get_db() as db:
        db.execute(
            '''INSERT OR REPLACE INTO case_meta
               (case_id, rebuttal_due_date, rebuttal_cycle, rebuttal_max)
               VALUES (?,?,?,?)''',
            (case_id, due, cycle, max_c)
        )
    return jsonify({'ok': True})


# ── dynamic case files ────────────────────────────────────────────────────────

@app.route('/api/cases')
def list_cases():
    with get_db() as db:
        rows = db.execute('SELECT * FROM cases ORDER BY ts DESC').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/cases', methods=['POST'])
def create_case():
    data = request.get_json(silent=True) or {}
    site      = (data.get('site') or '').strip()
    applicant = (data.get('applicant') or '').strip()
    score     = float(data.get('score', 0.5))
    if not site or not applicant:
        return jsonify({'ok': False, 'err': 'site and applicant required'}), 400
    with get_db() as db:
        count = db.execute('SELECT COUNT(*) as n FROM cases').fetchone()['n']
        from datetime import datetime
        yr = datetime.now().strftime('%y')
        case_id = '{}-{}'.format(yr, 1000 + count + 1)
        db.execute(
            'INSERT INTO cases (case_id, site, applicant, score, stage) VALUES (?,?,?,?,?)',
            (case_id, site, applicant, score, 'Application')
        )
    return jsonify({'ok': True, 'case_id': case_id})


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
            'INSERT OR REPLACE INTO crm_state (fid, state) VALUES (?,?)',
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
    data = request.get_json(silent=True) or {}
    stage = (data.get('stage') or '').strip()
    if not stage:
        return jsonify({'ok': False, 'err': 'stage required'}), 400
    with get_db() as db:
        db.execute(
            'INSERT OR REPLACE INTO case_stage_overrides (case_id, stage) VALUES (?,?)',
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
    key = (data.get('key') or '').strip()
    if not key:
        return jsonify({'ok': False, 'err': 'key required'}), 400
    with get_db() as db:
        try:
            db.execute('INSERT INTO case_impasse_routes (item_key) VALUES (?)', (key,))
        except Exception:
            pass  # already routed, idempotent
    return jsonify({'ok': True})


# ── rebuttals ─────────────────────────────────────────────────────────────────

@app.route('/api/case/<case_id>/rebuttals')
def get_rebuttals(case_id):
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM case_rebuttals WHERE case_id=? ORDER BY id', (case_id,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/case/<case_id>/rebuttal', methods=['POST'])
def add_rebuttal(case_id):
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'ok': False, 'err': 'text required'}), 400
    with get_db() as db:
        cur = db.execute(
            'INSERT INTO case_rebuttals (case_id, text) VALUES (?,?)', (case_id, text)
        )
    return jsonify({'ok': True, 'id': cur.lastrowid})


# ── mandated study checks ──────────────────────────────────────────────────────

@app.route('/api/studies/checks')
def get_study_checks():
    with get_db() as db:
        rows = db.execute('SELECT study_name, section_idx FROM study_checks').fetchall()
    return jsonify([{'study_name': r['study_name'], 'section_idx': r['section_idx']} for r in rows])

@app.route('/api/studies/check', methods=['POST'])
def toggle_study_check():
    data = request.get_json(silent=True) or {}
    name = data.get('study_name', '')
    idx  = data.get('section_idx')
    now_checked = data.get('checked', True)
    if not name or idx is None:
        return jsonify({'ok': False, 'err': 'study_name and section_idx required'}), 400
    with get_db() as db:
        if now_checked:
            try:
                db.execute('INSERT INTO study_checks (study_name, section_idx) VALUES (?,?)', (name, idx))
            except Exception:
                pass  # already checked
        else:
            db.execute('DELETE FROM study_checks WHERE study_name=? AND section_idx=?', (name, idx))
    return jsonify({'ok': True})


# ── static file serving ────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(ROOT, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(ROOT, path)


# ── entrypoint ─────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(DOCS_DIR, exist_ok=True)
    init_db()
    print('Merascope server starting on http://localhost:8877')
    app.run(port=8877, debug=True, use_reloader=True)
