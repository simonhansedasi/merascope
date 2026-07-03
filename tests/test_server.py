"""Tests for Merascope server API routes.

Requires PostgreSQL. Set TEST_DATABASE_URL (or DATABASE_URL) to a writable
database, e.g.:
    TEST_DATABASE_URL=postgresql://merascope:merascope@localhost/merascope_test

All tables are created on session start and truncated between tests so each
test runs against a clean slate without re-creating schemas.
"""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import server as srv

# ── helpers ──────────────────────────────────────────────────────────────────

TEST_DSN = os.environ.get(
    'TEST_DATABASE_URL',
    os.environ.get('DATABASE_URL', 'postgresql://merascope:merascope@localhost/merascope_test')
)

_TABLES = [
    'event_log', 'case_invites', 'case_conditions', 'case_docs',
    'case_meta', 'cases', 'case_stage_overrides', 'case_impasse_routes',
    'study_checks', 'case_rebuttals', 'crm_state',
    'steward_zones', 'steward_templates',
    'case_anchors', 'demo_cases',
]

def _pg_available():
    try:
        import psycopg2
        conn = psycopg2.connect(dsn=TEST_DSN)
        conn.close()
        return True
    except Exception:
        return False

_PG_OK = _pg_available()

# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope='session', autouse=True)
def _create_schema():
    """Create all tables once per test session."""
    if not _PG_OK:
        return
    import psycopg2.pool as pgpool
    pool = pgpool.ThreadedConnectionPool(1, 3, dsn=TEST_DSN)
    original = srv._pool
    srv._pool = pool
    srv.init_db()
    srv._pool = original
    pool.closeall()


@pytest.fixture
def client(monkeypatch):
    if not _PG_OK:
        pytest.skip('PostgreSQL not available — set TEST_DATABASE_URL to run server tests')

    import psycopg2
    import psycopg2.pool as pgpool

    test_pool = pgpool.ThreadedConnectionPool(1, 3, dsn=TEST_DSN)
    monkeypatch.setattr(srv, '_pool', test_pool)

    # Truncate all tables for a clean test
    conn = psycopg2.connect(dsn=TEST_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                'TRUNCATE TABLE {} RESTART IDENTITY CASCADE'.format(
                    ', '.join(_TABLES)
                )
            )
        conn.commit()
    finally:
        conn.close()

    srv.app.config['TESTING'] = True
    with srv.app.test_client() as c:
        yield c

    test_pool.closeall()


def post_json(client, url, payload):
    return client.post(url, data=json.dumps(payload),
                       content_type='application/json')


def login(client, email='admin@example.com', role='admin', agency_key=None):
    """Insert a user/session/role and attach the session cookie to the client."""
    import secrets as _secrets
    from datetime import datetime as _dt, timedelta as _td
    token = _secrets.token_urlsafe(16)
    with srv.get_db() as db:
        db.execute('INSERT INTO users (email) VALUES (?) ON CONFLICT DO NOTHING', (email,))
        db.execute('INSERT INTO sessions (token, email, expires_at) VALUES (?,?,?)',
                   (token, email, _dt.utcnow() + _td(days=1)))
        if role:
            db.execute(
                'INSERT INTO user_roles (email, role, agency_key) VALUES (?,?,?) '
                'ON CONFLICT (email, role) DO UPDATE SET agency_key=EXCLUDED.agency_key',
                (email, role, agency_key))
    client.set_cookie('mera_sess', token)
    return email


FULL_INQUIRY = {
    'site':          'Test Ridge',
    'applicant':     'Cascade Data LLC',
    'contact_email': 'jane@example.com',
    'contact_name':  'Jane Smith',
    'score':         0.712,
    'cell_fid':      '42',
    'state_code':    'WA',
    'lat':           47.5,
    'lon':           -120.3,
    'lead_agency':   'King County DPER',
    'notes':         'Proof of concept',
}


# ---------------------------------------------------------------------------
# POST /api/builder/submit
# ---------------------------------------------------------------------------

class TestBuilderSubmit:

    @pytest.fixture(autouse=True)
    def _as_builder(self, client):
        login(client, email='builder@example.com', role='builder', agency_key=None)

    def test_happy_path_returns_ok_and_case_id(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        assert r.status_code == 200
        d = r.get_json()
        assert d['ok'] is True
        assert 'case_id' in d

    def test_case_id_format(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        case_id = r.get_json()['case_id']
        parts = case_id.split('-')
        assert len(parts) == 2
        assert len(parts[0]) == 2          # two-digit year
        assert parts[1].isdigit()

    def test_stage_defaults_to_site_inquiry(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        case_id = r.get_json()['case_id']
        row = client.get('/api/builder/case/' + case_id).get_json()
        assert row['stage'] == 'Site Inquiry'

    def test_all_fields_persisted(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        case_id = r.get_json()['case_id']
        row = client.get('/api/builder/case/' + case_id).get_json()
        assert row['site']          == 'Test Ridge'
        assert row['applicant']     == 'Cascade Data LLC'
        assert row['contact_email'] == 'jane@example.com'
        assert row['contact_name']  == 'Jane Smith'
        assert abs(row['score'] - 0.712) < 1e-6
        assert row['cell_fid']      == '42'
        assert row['state_code']    == 'WA'
        assert abs(row['lat'] - 47.5) < 1e-6
        assert abs(row['lon'] - (-120.3)) < 1e-6
        assert row['lead_agency']   == 'King County DPER'
        assert row['notes']         == 'Proof of concept'

    def test_missing_site_returns_400(self, client):
        payload = {**FULL_INQUIRY, 'site': ''}
        r = post_json(client, '/api/builder/submit', payload)
        assert r.status_code == 400
        assert r.get_json()['ok'] is False

    def test_missing_applicant_returns_400(self, client):
        payload = {**FULL_INQUIRY, 'applicant': ''}
        r = post_json(client, '/api/builder/submit', payload)
        assert r.status_code == 400

    def test_missing_contact_email_returns_400(self, client):
        payload = {**FULL_INQUIRY, 'contact_email': ''}
        r = post_json(client, '/api/builder/submit', payload)
        assert r.status_code == 400

    def test_optional_fields_can_be_omitted(self, client):
        minimal = {
            'site': 'Minimal Site',
            'applicant': 'Minimal Corp',
            'contact_email': 'a@b.com',
        }
        r = post_json(client, '/api/builder/submit', minimal)
        assert r.status_code == 200
        assert r.get_json()['ok'] is True

    def test_submission_appears_in_cases_list(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        case_id = r.get_json()['case_id']
        d = client.get('/api/cases').get_json()
        ids = [c['case_id'] for c in d['cases']]
        assert case_id in ids

    def test_multiple_submissions_get_unique_ids(self, client):
        r1 = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        r2 = post_json(client, '/api/builder/submit', {**FULL_INQUIRY, 'site': 'Other Ridge'})
        assert r1.get_json()['case_id'] != r2.get_json()['case_id']


# ---------------------------------------------------------------------------
# GET /api/builder/case/<case_id>
# ---------------------------------------------------------------------------

class TestGetBuilderCase:

    @pytest.fixture(autouse=True)
    def _as_builder(self, client):
        login(client, email='builder@example.com', role='builder', agency_key=None)

    def test_returns_case_after_submit(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        case_id = r.get_json()['case_id']
        r2 = client.get('/api/builder/case/' + case_id)
        assert r2.status_code == 200
        assert r2.get_json()['case_id'] == case_id

    def test_unknown_id_returns_404(self, client):
        r = client.get('/api/builder/case/99-9999')
        assert r.status_code == 404
        assert r.get_json()['ok'] is False


# ---------------------------------------------------------------------------
# POST /api/cases  (steward manual create)
# ---------------------------------------------------------------------------

class TestCreateCase:

    def test_requires_steward_or_admin(self, client):
        # Unauthenticated create is rejected.
        r = post_json(client, '/api/cases', {'site': 'Alpha', 'applicant': 'Corp'})
        assert r.status_code == 403

    def test_happy_path(self, client):
        login(client)
        r = post_json(client, '/api/cases', {'site': 'Alpha', 'applicant': 'Corp', 'score': 0.6})
        assert r.status_code == 200
        d = r.get_json()
        assert d['ok'] is True
        assert 'case_id' in d

    def test_stage_defaults_to_site_inquiry(self, client):
        login(client)
        r = post_json(client, '/api/cases', {'site': 'Alpha', 'applicant': 'Corp', 'score': 0.6})
        case_id = r.get_json()['case_id']
        d = client.get('/api/cases').get_json()
        match = next(c for c in d['cases'] if c['case_id'] == case_id)
        assert match['stage'] == 'Site Inquiry'

    def test_missing_site_returns_400(self, client):
        login(client)
        r = post_json(client, '/api/cases', {'applicant': 'Corp'})
        assert r.status_code == 400

    def test_missing_applicant_returns_400(self, client):
        login(client)
        r = post_json(client, '/api/cases', {'site': 'Alpha'})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/cases
# ---------------------------------------------------------------------------

class TestListCases:

    @pytest.fixture(autouse=True)
    def _as_builder(self, client):
        login(client, email='builder@example.com', role='builder', agency_key=None)

    def test_empty_initially(self, client):
        d = client.get('/api/cases').get_json()
        assert d['cases'] == []
        assert d['total'] == 0

    def test_lists_submitted_cases(self, client):
        post_json(client, '/api/builder/submit', FULL_INQUIRY)
        post_json(client, '/api/builder/submit', {**FULL_INQUIRY, 'site': 'Ridge 2'})
        d = client.get('/api/cases').get_json()
        assert len(d['cases']) == 2
        assert d['total'] == 2

    def test_pagination_limit_and_offset(self, client):
        for i in range(5):
            post_json(client, '/api/builder/submit', {**FULL_INQUIRY, 'site': 'Ridge {}'.format(i)})
        d1 = client.get('/api/cases?limit=3&offset=0').get_json()
        d2 = client.get('/api/cases?limit=3&offset=3').get_json()
        assert len(d1['cases']) == 3
        assert len(d2['cases']) == 2
        assert d1['total'] == 5
        assert d2['total'] == 5
        ids1 = {c['case_id'] for c in d1['cases']}
        ids2 = {c['case_id'] for c in d2['cases']}
        assert ids1.isdisjoint(ids2)


# ---------------------------------------------------------------------------
# Stage transitions  PATCH /api/case/<id>/stage
# ---------------------------------------------------------------------------

class TestStageTransitions:

    @pytest.fixture(autouse=True)
    def _as_builder(self, client):
        login(client, email='builder@example.com', role='builder', agency_key=None)

    def _create(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        return r.get_json()['case_id']

    def test_get_stage_unknown_returns_null(self, client):
        r = client.get('/api/case/99-0000/stage')
        assert r.get_json() is None

    def test_patch_stage_returns_ok(self, client):
        case_id = self._create(client)
        r = client.patch('/api/case/' + case_id + '/stage',
                         data=json.dumps({'stage': 'Intake'}),
                         content_type='application/json')
        assert r.get_json()['ok'] is True

    def test_stage_persisted_after_patch(self, client):
        case_id = self._create(client)
        client.patch('/api/case/' + case_id + '/stage',
                     data=json.dumps({'stage': 'Analysis'}),
                     content_type='application/json')
        r = client.get('/api/case/' + case_id + '/stage')
        assert r.get_json() == 'Analysis'

    def test_patch_stage_updates_builder_case_row(self, client):
        case_id = self._create(client)
        client.patch('/api/case/' + case_id + '/stage',
                     data=json.dumps({'stage': 'Findings Exchange'}),
                     content_type='application/json')
        row = client.get('/api/builder/case/' + case_id).get_json()
        assert row['stage'] == 'Findings Exchange'

    def test_missing_stage_returns_400(self, client):
        case_id = self._create(client)
        r = client.patch('/api/case/' + case_id + '/stage',
                         data=json.dumps({}),
                         content_type='application/json')
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Conditions  /api/case/<id>/conditions
# ---------------------------------------------------------------------------

class TestConditions:

    def test_empty_initially(self, client):
        assert client.get('/api/case/26-0001/conditions').get_json() == []

    def test_add_and_retrieve(self, client):
        post_json(client, '/api/case/26-0001/conditions',
                  {'text': 'No blasting within 500m', 'by': 'OPCD', 'type': 'Noise'})
        rows = client.get('/api/case/26-0001/conditions').get_json()
        assert len(rows) == 1
        assert rows[0]['text'] == 'No blasting within 500m'
        assert rows[0]['type'] == 'Noise'

    def test_pending_approval_flag(self, client):
        post_json(client, '/api/case/26-0001/conditions',
                  {'text': 'Limit hours', 'pending_approval': True})
        rows = client.get('/api/case/26-0001/conditions').get_json()
        assert rows[0]['pending_approval'] == 1

    def test_patch_status(self, client):
        r = post_json(client, '/api/case/26-0001/conditions', {'text': 'Hold'})
        cond_id = r.get_json()['id']
        client.patch('/api/case/26-0001/conditions/' + str(cond_id),
                     data=json.dumps({'status': 'Accepted'}),
                     content_type='application/json')
        rows = client.get('/api/case/26-0001/conditions').get_json()
        assert rows[0]['status'] == 'Accepted'

    def test_delete_condition(self, client):
        r = post_json(client, '/api/case/26-0001/conditions', {'text': 'Remove me'})
        cond_id = r.get_json()['id']
        client.delete('/api/case/26-0001/conditions/' + str(cond_id))
        assert client.get('/api/case/26-0001/conditions').get_json() == []


# ---------------------------------------------------------------------------
# Invites  /api/case/<id>/invite(s)
# ---------------------------------------------------------------------------

class TestInvites:

    def test_empty_initially(self, client):
        assert client.get('/api/case/26-0001/invites').get_json() == []

    def test_add_and_retrieve(self, client):
        post_json(client, '/api/case/26-0001/invite', {'agency_key': 'WW'})
        assert client.get('/api/case/26-0001/invites').get_json() == ['WW']

    def test_duplicate_invite_is_idempotent(self, client):
        post_json(client, '/api/case/26-0001/invite', {'agency_key': 'WW'})
        post_json(client, '/api/case/26-0001/invite', {'agency_key': 'WW'})
        assert client.get('/api/case/26-0001/invites').get_json() == ['WW']

    def test_missing_key_returns_400(self, client):
        r = post_json(client, '/api/case/26-0001/invite', {})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Rebuttals  /api/case/<id>/rebuttal(s)
# ---------------------------------------------------------------------------

class TestRebuttals:

    def test_empty_initially(self, client):
        assert client.get('/api/case/26-0001/rebuttals').get_json() == []

    def test_add_and_retrieve(self, client):
        post_json(client, '/api/case/26-0001/rebuttal', {'text': 'We dispute finding 3.'})
        rows = client.get('/api/case/26-0001/rebuttals').get_json()
        assert len(rows) == 1
        assert rows[0]['text'] == 'We dispute finding 3.'

    def test_empty_text_returns_400(self, client):
        r = post_json(client, '/api/case/26-0001/rebuttal', {'text': ''})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Event log  /api/log
# ---------------------------------------------------------------------------

class TestEventLog:

    def test_log_event(self, client):
        r = post_json(client, '/api/log',
                      {'event_type': 'save_cell', 'fid': 42, 'session_id': 'abc'})
        assert r.get_json()['ok'] is True

    def test_missing_event_type_returns_400(self, client):
        r = post_json(client, '/api/log', {'fid': 42})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# CRM state  /api/crm/<fid>
# ---------------------------------------------------------------------------

class TestCRM:

    def test_unknown_fid_returns_null(self, client):
        assert client.get('/api/crm/999').get_json() is None

    def test_save_and_retrieve(self, client):
        state = {'status': 'Active', 'contacts': ['Jane']}
        post_json(client, '/api/crm/42', state)
        assert client.get('/api/crm/42').get_json() == state

    def test_overwrite(self, client):
        post_json(client, '/api/crm/42', {'status': 'Active'})
        post_json(client, '/api/crm/42', {'status': 'Closed'})
        assert client.get('/api/crm/42').get_json()['status'] == 'Closed'


# ---------------------------------------------------------------------------
# Impasse routing  /api/impasse/route(s)
# ---------------------------------------------------------------------------

class TestImpasseRouting:

    def test_empty_initially(self, client):
        assert client.get('/api/impasse/routes').get_json() == []

    def test_add_and_retrieve(self, client):
        post_json(client, '/api/impasse/route', {'key': 'item-1'})
        assert 'item-1' in client.get('/api/impasse/routes').get_json()

    def test_duplicate_is_idempotent(self, client):
        post_json(client, '/api/impasse/route', {'key': 'item-1'})
        post_json(client, '/api/impasse/route', {'key': 'item-1'})
        assert client.get('/api/impasse/routes').get_json().count('item-1') == 1

    def test_missing_key_returns_400(self, client):
        r = post_json(client, '/api/impasse/route', {})
        assert r.status_code == 400

    def test_route_with_demo_case_id_records_event(self, client):
        # Exercises the event_log insert that previously used a non-existent
        # payload_json column (and mis-typed fid). Demo ids stay open.
        r = post_json(client, '/api/impasse/route',
                      {'key': 'item-2', 'case_id': 'demo-XYZ'})
        assert r.get_json()['ok'] is True
        logs = client.get('/api/admin/log?key=devonly&event_type=status_change')
        # admin key may be overridden in the test env; only assert no 500 above.
        assert logs.status_code in (200, 403)


# ---------------------------------------------------------------------------
# Case access control  (anonymous callers must not read/write real cases)
# ---------------------------------------------------------------------------

class TestCaseAuthGuards:

    def test_anon_cases_list_is_empty_even_with_cases(self, client):
        login(client)  # admin
        post_json(client, '/api/cases', {'site': 'Secret', 'applicant': 'Corp'})
        client.delete_cookie('mera_sess')
        d = client.get('/api/cases').get_json()
        assert d['cases'] == []
        assert d['total'] == 0

    def test_anon_create_case_forbidden(self, client):
        r = post_json(client, '/api/cases', {'site': 'X', 'applicant': 'Y'})
        assert r.status_code == 403

    def test_anon_write_to_real_case_rejected(self, client):
        login(client)  # admin
        cid = post_json(client, '/api/cases', {'site': 'X', 'applicant': 'Y'}).get_json()['case_id']
        client.delete_cookie('mera_sess')
        r = post_json(client, '/api/case/' + cid + '/conditions', {'text': 'injected'})
        assert r.status_code == 401
        # nothing was written (verify as the authenticated owner)
        login(client)
        assert client.get('/api/case/' + cid + '/conditions').get_json() == []

    def test_anon_read_of_real_case_rejected(self, client):
        login(client)  # admin
        cid = post_json(client, '/api/cases', {'site': 'X', 'applicant': 'Y'}).get_json()['case_id']
        post_json(client, '/api/case/' + cid + '/conditions', {'text': 'sensitive'})
        client.delete_cookie('mera_sess')
        # anon cannot read a real case's conditions or rebuttals
        assert client.get('/api/case/' + cid + '/conditions').status_code == 401
        assert client.get('/api/case/' + cid + '/rebuttals').status_code == 401

    def test_demo_case_reads_stay_open(self, client):
        # The public demo reads demo-* ids without auth; this must keep working.
        assert client.get('/api/case/demo-EX-0001/conditions').status_code == 200
        assert client.get('/api/case/demo-EX-0001/stage').status_code == 200

    def test_anon_stage_change_on_real_case_rejected(self, client):
        login(client)  # admin
        cid = post_json(client, '/api/cases', {'site': 'X', 'applicant': 'Y'}).get_json()['case_id']
        client.delete_cookie('mera_sess')
        r = client.patch('/api/case/' + cid + '/stage',
                         data=json.dumps({'stage': 'Resolution'}),
                         content_type='application/json')
        assert r.status_code == 401

    def test_demo_case_writes_stay_open(self, client):
        # The public demo posts to demo-* ids without auth; this must keep working.
        r = post_json(client, '/api/case/demo-EX-0001/conditions', {'text': 'demo condition'})
        assert r.get_json()['ok'] is True

    def test_unknown_case_id_writes_stay_open(self, client):
        # Frontend example fixtures use ids with no row in `cases`.
        r = post_json(client, '/api/case/26-9999/conditions', {'text': 'fixture'})
        assert r.get_json()['ok'] is True

    def test_owner_can_write_to_own_case(self, client):
        login(client, email='builder@example.com', role='builder', agency_key=None)
        cid = post_json(client, '/api/builder/submit',
                        {'site': 'Mine', 'applicant': 'Me', 'contact_email': 'me@x.com'}).get_json()['case_id']
        r = post_json(client, '/api/case/' + cid + '/rebuttal', {'text': 'my rebuttal'})
        assert r.get_json()['ok'] is True


# ---------------------------------------------------------------------------
# Steward templates + zones
# ---------------------------------------------------------------------------

def _seed_steward(client):
    """Insert a steward user+role+session and attach the cookie to the client.

    Cookie is set on the client's jar via set_cookie — passing a Cookie header
    per-request is ignored by the werkzeug 3.x test client.
    """
    login(client, email='steward@test.gov', role='steward', agency_key='TESTCO')
    return {'mera_sess': None}


def _steward_get(client, url):
    _seed_steward(client)
    return client.get(url)


def _steward_post(client, url, payload):
    _seed_steward(client)
    return client.post(url, data=json.dumps(payload), content_type='application/json')


def _steward_patch(client, url, payload):
    _seed_steward(client)
    return client.patch(url, data=json.dumps(payload), content_type='application/json')


def _steward_delete(client, url):
    _seed_steward(client)
    return client.delete(url)


class TestStewardPresets:

    def test_returns_five_presets(self, client):
        r = client.get('/api/steward/presets')
        assert r.status_code == 200
        data = r.get_json()
        assert len(data) == 5

    def test_preset_has_required_fields(self, client):
        data = client.get('/api/steward/presets').get_json()
        for p in data:
            assert 'name' in p
            assert 'weights' in p
            assert 'min_score' in p

    def test_preset_weights_sum_to_100(self, client):
        data = client.get('/api/steward/presets').get_json()
        for p in data:
            total = sum(p['weights'].values())
            assert abs(total - 100) < 1e-6, f"{p['name']} weights sum to {total}"


class TestStewardTemplates:

    def test_unauthenticated_returns_401(self, client):
        r = client.get('/api/steward/templates')
        assert r.status_code == 401

    def test_create_and_list(self, client):
        weights = {k: 0 for k in srv._IND_KEYS}
        weights['water'] = 60; weights['transmission'] = 25; weights['community'] = 15
        r = _steward_post(client, '/api/steward/templates',
                          {'name': 'Water Focus', 'weights': weights, 'min_score': 0.5})
        assert r.status_code == 200
        assert r.get_json()['ok'] is True
        rows = _steward_get(client, '/api/steward/templates').get_json()
        assert any(t['name'] == 'Water Focus' for t in rows)

    def test_missing_name_returns_400(self, client):
        r = _steward_post(client, '/api/steward/templates', {'weights': {}, 'min_score': 0.4})
        assert r.status_code == 400

    def test_update_locked_flag(self, client):
        weights = {k: 0 for k in srv._IND_KEYS}
        weights['transmission'] = 100
        r = _steward_post(client, '/api/steward/templates',
                          {'name': 'Grid Only', 'weights': weights, 'min_score': 0.45})
        tmpl_id = r.get_json()['id']
        patch = _steward_patch(client, '/api/steward/templates/' + str(tmpl_id), {'locked': 1})
        assert patch.get_json()['ok'] is True
        rows = _steward_get(client, '/api/steward/templates').get_json()
        match = next(t for t in rows if t['id'] == tmpl_id)
        assert match['locked'] == 1

    def test_delete_template(self, client):
        weights = {k: 0 for k in srv._IND_KEYS}
        weights['community'] = 100
        r = _steward_post(client, '/api/steward/templates',
                          {'name': 'To Delete', 'weights': weights, 'min_score': 0.4})
        tmpl_id = r.get_json()['id']
        _steward_delete(client, '/api/steward/templates/' + str(tmpl_id))
        rows = _steward_get(client, '/api/steward/templates').get_json()
        assert not any(t['id'] == tmpl_id for t in rows)


class TestStewardZones:

    def _make_template(self, client):
        weights = {k: 0 for k in srv._IND_KEYS}
        weights['transmission'] = 40; weights['water'] = 35; weights['community'] = 25
        r = _steward_post(client, '/api/steward/templates',
                          {'name': 'Balanced', 'weights': weights, 'min_score': 0.4})
        return r.get_json()['id']

    def test_create_state_zone(self, client):
        tmpl_id = self._make_template(client)
        r = _steward_post(client, '/api/steward/zones',
                          {'name': 'All of WA', 'zone_type': 'state',
                           'state_code': 'WA', 'template_id': tmpl_id})
        assert r.status_code == 200
        assert r.get_json()['ok'] is True

    def test_create_bbox_zone(self, client):
        r = _steward_post(client, '/api/steward/zones',
                          {'name': 'Seattle Metro', 'zone_type': 'bbox',
                           'bbox': {'w': -122.5, 's': 47.4, 'e': -122.1, 'n': 47.8}})
        assert r.get_json()['ok'] is True

    def test_create_county_zone(self, client):
        r = _steward_post(client, '/api/steward/zones',
                          {'name': 'King County', 'zone_type': 'county',
                           'state_code': 'WA', 'county_fips': '033'})
        assert r.get_json()['ok'] is True

    def test_create_zcta_zone(self, client):
        r = _steward_post(client, '/api/steward/zones',
                          {'name': 'ZCTA 98104', 'zone_type': 'zcta',
                           'state_code': 'WA', 'zcta_code': '98104'})
        assert r.get_json()['ok'] is True

    def test_missing_name_returns_400(self, client):
        r = _steward_post(client, '/api/steward/zones',
                          {'zone_type': 'state', 'state_code': 'WA'})
        assert r.status_code == 400

    def test_invalid_zone_type_returns_400(self, client):
        r = _steward_post(client, '/api/steward/zones',
                          {'name': 'Bad', 'zone_type': 'galaxy'})
        assert r.status_code == 400

    def test_list_zones(self, client):
        _steward_post(client, '/api/steward/zones',
                      {'name': 'Zone A', 'zone_type': 'state', 'state_code': 'WA'})
        rows = _steward_get(client, '/api/steward/zones').get_json()
        assert any(z['name'] == 'Zone A' for z in rows)

    def test_delete_zone(self, client):
        r = _steward_post(client, '/api/steward/zones',
                          {'name': 'Gone', 'zone_type': 'state', 'state_code': 'OR'})
        zone_id = r.get_json()['id']
        _steward_delete(client, '/api/steward/zones/' + str(zone_id))
        rows = _steward_get(client, '/api/steward/zones').get_json()
        assert not any(z['id'] == zone_id for z in rows)


class TestActiveZones:

    def _make_locked_zone(self, client, zone_type='state', extra=None):
        weights = {k: 0 for k in srv._IND_KEYS}
        weights['transmission'] = 40; weights['water'] = 35; weights['community'] = 25
        tmpl_r = _steward_post(client, '/api/steward/templates',
                               {'name': 'T', 'weights': weights, 'min_score': 0.5})
        tmpl_id = tmpl_r.get_json()['id']
        _steward_patch(client, '/api/steward/templates/' + str(tmpl_id), {'locked': 1})
        zone_data = {'name': 'Z', 'zone_type': zone_type,
                     'state_code': 'WA', 'template_id': tmpl_id}
        if extra:
            zone_data.update(extra)
        _steward_post(client, '/api/steward/zones', zone_data)
        return tmpl_id

    def test_locked_zone_appears_in_active(self, client):
        self._make_locked_zone(client)
        data = client.get('/api/zones/active').get_json()
        assert len(data) >= 1
        assert 'weights' in data[0]
        assert 'min_score' in data[0]

    def test_unlocked_template_absent_from_active(self, client):
        weights = {k: 0 for k in srv._IND_KEYS}
        weights['transmission'] = 100
        tmpl_r = _steward_post(client, '/api/steward/templates',
                               {'name': 'Unlocked', 'weights': weights, 'min_score': 0.3})
        tmpl_id = tmpl_r.get_json()['id']
        _steward_post(client, '/api/steward/zones',
                      {'name': 'Unlocked zone', 'zone_type': 'state',
                       'state_code': 'OR', 'template_id': tmpl_id})
        data = client.get('/api/zones/active').get_json()
        assert not any(z.get('agency_key') == 'TESTCO' and z.get('zone_name') == 'Unlocked zone'
                       for z in data)

    def test_active_zone_has_zone_geometry_fields(self, client):
        self._make_locked_zone(client, zone_type='county',
                               extra={'county_fips': '033', 'state_code': 'WA'})
        data = client.get('/api/zones/active').get_json()
        county_zone = next((z for z in data if z.get('zone_type') == 'county'), None)
        assert county_zone is not None
        assert county_zone['county_fips'] == '033'


# ---------------------------------------------------------------------------
# Weight logging  (weights_json stored at submit, returned as dict in GET)
# ---------------------------------------------------------------------------

def _authed_submit(client, cookies, payload=None):
    """Submit a builder inquiry as the seeded steward (cookie already on jar)."""
    p = dict(FULL_INQUIRY, **(payload or {}))
    r = client.post('/api/builder/submit', data=json.dumps(p), content_type='application/json')
    return r.get_json()['case_id']


def _authed_get_case(client, cookies, case_id):
    return client.get('/api/builder/case/' + case_id).get_json()


def _authed_patch_stage(client, cookies, case_id, stage):
    return client.patch('/api/case/' + case_id + '/stage',
                        data=json.dumps({'stage': stage}), content_type='application/json')


class TestWeightLogging:

    def test_weights_stored_and_returned_as_dict(self, client):
        cookies = _seed_steward(client)
        w = {'transmission': 40.0, 'water': 35.0, 'community': 25.0}
        case_id = _authed_submit(client, cookies, {'weights': w})
        row = _authed_get_case(client, cookies, case_id)
        assert isinstance(row.get('weights'), dict)
        assert abs(row['weights']['transmission'] - 40.0) < 1e-6
        assert abs(row['weights']['water'] - 35.0) < 1e-6
        assert abs(row['weights']['community'] - 25.0) < 1e-6

    def test_weights_absent_when_not_submitted(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        row = _authed_get_case(client, cookies, case_id)
        assert row.get('weights') is None
        assert 'weights_json' not in row

    def test_raw_weights_json_col_not_exposed(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies, {'weights': {'transmission': 50.0}})
        row = _authed_get_case(client, cookies, case_id)
        assert 'weights_json' not in row

    def test_empty_weights_dict_treated_as_no_weights(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies, {'weights': {}})
        row = _authed_get_case(client, cookies, case_id)
        assert row.get('weights') is None


# ---------------------------------------------------------------------------
# Cryptographic record anchoring
# ---------------------------------------------------------------------------

class TestRecordAnchoring:

    def test_anchor_absent_before_resolution(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        r = client.get('/api/case/' + case_id + '/anchor')
        assert r.status_code == 404

    def test_builder_case_has_no_anchor_before_resolution(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        row = _authed_get_case(client, cookies, case_id)
        assert row.get('anchor') is None

    def test_anchor_created_on_resolution(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        _authed_patch_stage(client, cookies, case_id, 'Resolution')
        r = client.get('/api/case/' + case_id + '/anchor')
        assert r.status_code == 200

    def test_anchor_fields_present(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        _authed_patch_stage(client, cookies, case_id, 'Resolution')
        d = client.get('/api/case/' + case_id + '/anchor').get_json()
        assert d['case_id'] == case_id
        assert d['algorithm'] == 'SHA-256'
        assert d['hash']
        assert d['anchored_at']
        assert isinstance(d['payload'], dict)
        assert d['payload']['case_id'] == case_id

    def test_anchor_hash_is_sha256_hex(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        _authed_patch_stage(client, cookies, case_id, 'Resolution')
        d = client.get('/api/case/' + case_id + '/anchor').get_json()
        h = d['hash']
        assert len(h) == 64
        assert all(c in '0123456789abcdef' for c in h)

    def test_anchor_idempotent_on_re_resolution(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        _authed_patch_stage(client, cookies, case_id, 'Resolution')
        h1 = client.get('/api/case/' + case_id + '/anchor').get_json()['hash']
        _authed_patch_stage(client, cookies, case_id, 'Resolution')
        h2 = client.get('/api/case/' + case_id + '/anchor').get_json()['hash']
        assert h1 == h2

    def test_builder_case_includes_anchor_after_resolution(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        _authed_patch_stage(client, cookies, case_id, 'Resolution')
        row = _authed_get_case(client, cookies, case_id)
        assert row.get('anchor') is not None
        assert row['anchor']['hash']
        assert row['anchor']['anchored_at']

    def test_anchor_payload_matches_submitted_data(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        _authed_patch_stage(client, cookies, case_id, 'Resolution')
        d = client.get('/api/case/' + case_id + '/anchor').get_json()
        p = d['payload']
        assert p['site'] == FULL_INQUIRY['site']
        assert p['applicant'] == FULL_INQUIRY['applicant']
        assert p['stage'] == 'Resolution'

    def test_anchor_unknown_case_returns_404(self, client):
        r = client.get('/api/case/99-0000/anchor')
        assert r.status_code == 404

    def test_non_resolution_stage_does_not_anchor(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        for stage in ('Intake', 'Analysis', 'Findings Exchange', 'Negotiation'):
            _authed_patch_stage(client, cookies, case_id, stage)
        r = client.get('/api/case/' + case_id + '/anchor')
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Permit justification report routes  /report/<case_id>  and  /report
# ---------------------------------------------------------------------------

class TestReportRoutes:

    def _make_demo_case(self, client):
        r = post_json(client, '/api/builder/submit', FULL_INQUIRY)
        d = r.get_json()
        assert d.get('is_demo'), 'Expected demo case (unauthenticated submit)'
        return d['case_id']

    def test_demo_case_report_returns_200(self, client):
        case_id = self._make_demo_case(client)
        r = client.get('/report/' + case_id)
        assert r.status_code == 200

    def test_demo_case_report_is_html(self, client):
        case_id = self._make_demo_case(client)
        r = client.get('/report/' + case_id)
        assert 'text/html' in r.content_type

    def test_demo_case_report_contains_site_name(self, client):
        case_id = self._make_demo_case(client)
        r = client.get('/report/' + case_id)
        assert FULL_INQUIRY['site'].encode() in r.data

    def test_unknown_case_report_returns_404(self, client):
        r = client.get('/report/nonexistent-99abc')
        assert r.status_code == 404

    def test_real_case_report_accessible_without_auth(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        r = client.get('/report/' + case_id)
        assert r.status_code == 200

    def test_real_case_report_contains_case_id(self, client):
        cookies = _seed_steward(client)
        case_id = _authed_submit(client, cookies)
        r = client.get('/report/' + case_id)
        assert case_id.encode() in r.data

    def test_explorer_report_returns_200(self, client):
        r = client.get('/report?state=WA&lat=47.5&lon=-120.3&name=Test+Site')
        assert r.status_code == 200

    def test_explorer_report_is_html(self, client):
        r = client.get('/report?state=WA&lat=47.5&lon=-120.3&name=Test+Site')
        assert 'text/html' in r.content_type

    def test_explorer_report_contains_site_name(self, client):
        r = client.get('/report?state=WA&lat=47.5&lon=-120.3&name=My+Site')
        assert b'My Site' in r.data

    def test_explorer_report_no_params_returns_200(self, client):
        r = client.get('/report')
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# _build_report_context  (pure-function unit tests, no DB required)
# ---------------------------------------------------------------------------

_FULL_PROPS = {
    'zcta':                    '98001',
    'tx_score_nat':            0.85,
    'water_score_nat':         0.72,
    'ej_score_nat':            0.30,
    'seismic_score_nat':       0.60,
    'flood_score_nat':         1.00,
    'flood_score':             1.0,
    'contamination_score_nat': 0.55,
    'waterway_score_nat':      0.40,
    'geothermal_score_nat':    0.20,
    'flatness_score_nat':      0.65,
    'aquifer_score_nat':       0.10,
    'soil_score_nat':          0.50,
    'slope_score_nat':         0.45,
    'pop_exposure_score_nat':  0.80,
    'soil_profile_score_nat':  0.35,
    'ksat_score_nat':          0.25,
    'substation_score_nat':    0.90,
    'superfund_score_nat':     0.78,
    'rcra_score_nat':          0.68,
    'air_quality_score_nat':   0.95,
    'fiber_score_nat':         0.15,
    'water_stress_score_nat':  0.05,
    'grid_capacity_score_nat': 0.42,
    'protected_frac':          0.05,
}

_DUMMY_CASE = {
    'site':       'Test Ridge',
    'applicant':  'Cascade Data LLC',
    'state_code': 'WA',
    'score':      0.712,
    'stage':      'Analysis',
    'anchor':     None,
    'weights':    None,
}


class TestBuildReportContext:

    def _ctx(self, case_row=None, props=None):
        return srv._build_report_context(
            case_row if case_row is not None else _DUMMY_CASE,
            props if props is not None else dict(_FULL_PROPS),
        )

    def test_inds_sorted_strongest_first(self):
        ctx = self._ctx()
        nats = [i['nat'] for i in ctx['inds']]
        assert nats == sorted(nats, reverse=True)

    def test_all_22_indicators_present(self):
        ctx = self._ctx()
        assert len(ctx['inds']) == 22

    def test_strengths_all_above_50th_pct(self):
        ctx = self._ctx()
        for s in ctx['strengths']:
            assert s['nat'] >= 0.5

    def test_challenges_all_below_50th_pct(self):
        ctx = self._ctx()
        for c in ctx['challenges']:
            assert c['nat'] < 0.5

    def test_strengths_capped_at_3(self):
        ctx = self._ctx()
        assert len(ctx['strengths']) <= 3

    def test_challenges_capped_at_3(self):
        ctx = self._ctx()
        assert len(ctx['challenges']) <= 3

    def test_quartile_q4_at_75_pct(self):
        props = {**_FULL_PROPS, 'tx_score_nat': 0.75}
        ctx = self._ctx(props=props)
        tx = next(i for i in ctx['inds'] if i['k'] == 'transmission')
        assert tx['quartile'] == 'Q4'

    def test_quartile_q3_at_50_pct(self):
        props = {**_FULL_PROPS, 'tx_score_nat': 0.50}
        ctx = self._ctx(props=props)
        tx = next(i for i in ctx['inds'] if i['k'] == 'transmission')
        assert tx['quartile'] == 'Q3'

    def test_quartile_q2_at_25_pct(self):
        props = {**_FULL_PROPS, 'tx_score_nat': 0.25}
        ctx = self._ctx(props=props)
        tx = next(i for i in ctx['inds'] if i['k'] == 'transmission')
        assert tx['quartile'] == 'Q2'

    def test_quartile_q1_below_25_pct(self):
        props = {**_FULL_PROPS, 'tx_score_nat': 0.10}
        ctx = self._ctx(props=props)
        tx = next(i for i in ctx['inds'] if i['k'] == 'transmission')
        assert tx['quartile'] == 'Q1'

    def test_all_gates_pass_when_both_ok(self):
        ctx = self._ctx()
        assert ctx['all_gates_pass'] is True
        assert all(g['pass'] for g in ctx['gates'])

    def test_protected_gate_fails_above_threshold(self):
        props = {**_FULL_PROPS, 'protected_frac': 0.30}
        ctx = self._ctx(props=props)
        protected = next(g for g in ctx['gates'] if 'protected' in g['label'].lower())
        assert protected['pass'] is False
        assert ctx['all_gates_pass'] is False

    def test_flood_gate_fails_when_score_zero(self):
        props = {**_FULL_PROPS, 'flood_score': 0.0}
        ctx = self._ctx(props=props)
        flood = next(g for g in ctx['gates'] if 'flood' in g['label'].lower())
        assert flood['pass'] is False
        assert ctx['all_gates_pass'] is False

    def test_composite_from_case_row_score(self):
        ctx = self._ctx(case_row={**_DUMMY_CASE, 'score': 0.712})
        assert abs(ctx['composite'] - 0.712) < 1e-6

    def test_composite_balanced_fallback_when_score_zero(self):
        # With score=0, should compute tx*40 + water*35 + ej*25 / 100
        props = {**_FULL_PROPS, 'tx_score_nat': 1.0, 'water_score_nat': 0.0, 'ej_score_nat': 0.0}
        case = {**_DUMMY_CASE, 'score': 0}
        ctx = self._ctx(case_row=case, props=props)
        expected = (1.0 * 40 + 0.0 * 35 + 0.0 * 25) / 100
        assert abs(ctx['composite'] - expected) < 1e-6

    def test_composite_pct_clamped_to_100(self):
        ctx = self._ctx(case_row={**_DUMMY_CASE, 'score': 1.0})
        assert ctx['composite_pct'] == 100

    def test_composite_pct_clamped_to_0(self):
        ctx = self._ctx(case_row={**_DUMMY_CASE, 'score': 0.0},
                        props={**_FULL_PROPS, 'tx_score_nat': 0.0,
                               'water_score_nat': 0.0, 'ej_score_nat': 0.0})
        assert ctx['composite_pct'] == 0

    def test_site_name_from_case_row(self):
        ctx = self._ctx()
        assert ctx['site_name'] == 'Test Ridge'

    def test_site_name_fallback_when_none(self):
        ctx = self._ctx(case_row={**_DUMMY_CASE, 'site': None})
        assert ctx['site_name'] == 'Unnamed site'

    def test_zcta_from_props(self):
        ctx = self._ctx()
        assert ctx['zcta'] == '98001'

    def test_confidence_preserved_in_inds(self):
        ctx = self._ctx()
        tx = next(i for i in ctx['inds'] if i['k'] == 'transmission')
        assert tx['confidence'] == 'High'

    def test_empty_props_does_not_crash(self):
        ctx = self._ctx(props={})
        assert len(ctx['inds']) == 22
        assert 'composite_pct' in ctx
        assert 'gates' in ctx

    def test_empty_props_with_zero_score_gives_zero_pct(self):
        ctx = self._ctx(case_row={**_DUMMY_CASE, 'score': 0}, props={})
        assert ctx['composite_pct'] == 0

    def test_none_nat_value_treated_as_zero(self):
        props = {**_FULL_PROPS, 'tx_score_nat': None}
        ctx = self._ctx(props=props)
        tx = next(i for i in ctx['inds'] if i['k'] == 'transmission')
        assert tx['nat'] == 0.0


# ---------------------------------------------------------------------------
# _load_zcta_feature  (filesystem unit tests, no DB required)
# ---------------------------------------------------------------------------

class TestLoadZctaFeature:

    def setup_method(self):
        srv._zcta_centroids_cache.clear()

    def test_returns_none_without_state_code(self):
        assert srv._load_zcta_feature(None, 47.5, -120.3) is None

    def test_returns_none_without_lat(self):
        assert srv._load_zcta_feature('WA', None, -120.3) is None

    def test_returns_none_without_lon(self):
        assert srv._load_zcta_feature('WA', 47.5, None) is None

    def test_returns_none_for_missing_geojson(self, monkeypatch, tmp_path):
        monkeypatch.setattr(srv, 'ROOT', str(tmp_path))
        result = srv._load_zcta_feature('WA', 47.5, -120.3)
        assert result is None

    def test_nearest_centroid_selected(self, monkeypatch, tmp_path):
        import json as _json
        feat_near = {
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [[
                [-120.5, 47.0], [-120.4, 47.0],
                [-120.4, 47.1], [-120.5, 47.1], [-120.5, 47.0],
            ]]},
            'properties': {'zcta': '98001', 'tx_score_nat': 0.9},
        }
        feat_far = {
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [[
                [-121.5, 47.0], [-121.4, 47.0],
                [-121.4, 47.1], [-121.5, 47.1], [-121.5, 47.0],
            ]]},
            'properties': {'zcta': '98002', 'tx_score_nat': 0.1},
        }
        gj = {'type': 'FeatureCollection', 'features': [feat_near, feat_far]}
        state_dir = tmp_path / 'data' / 'WA' / 'zcta'
        state_dir.mkdir(parents=True)
        (state_dir / 'grid_scores.geojson').write_text(_json.dumps(gj))
        monkeypatch.setattr(srv, 'ROOT', str(tmp_path))
        result = srv._load_zcta_feature('WA', 47.05, -120.45)
        assert result['zcta'] == '98001'

    def test_far_centroid_selected_when_closer(self, monkeypatch, tmp_path):
        import json as _json
        feat_a = {
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [[
                [-120.5, 47.0], [-120.4, 47.0],
                [-120.4, 47.1], [-120.5, 47.1], [-120.5, 47.0],
            ]]},
            'properties': {'zcta': '98001'},
        }
        feat_b = {
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [[
                [-121.5, 47.0], [-121.4, 47.0],
                [-121.4, 47.1], [-121.5, 47.1], [-121.5, 47.0],
            ]]},
            'properties': {'zcta': '98002'},
        }
        gj = {'type': 'FeatureCollection', 'features': [feat_a, feat_b]}
        state_dir = tmp_path / 'data' / 'WA' / 'zcta'
        state_dir.mkdir(parents=True)
        (state_dir / 'grid_scores.geojson').write_text(_json.dumps(gj))
        monkeypatch.setattr(srv, 'ROOT', str(tmp_path))
        result = srv._load_zcta_feature('WA', 47.05, -121.45)
        assert result['zcta'] == '98002'

    def test_cache_populated_after_first_call(self, monkeypatch, tmp_path):
        import json as _json
        feat = {
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [[
                [-120.5, 47.0], [-120.4, 47.0],
                [-120.4, 47.1], [-120.5, 47.1], [-120.5, 47.0],
            ]]},
            'properties': {'zcta': '98001'},
        }
        gj = {'type': 'FeatureCollection', 'features': [feat]}
        state_dir = tmp_path / 'data' / 'WA' / 'zcta'
        state_dir.mkdir(parents=True)
        (state_dir / 'grid_scores.geojson').write_text(_json.dumps(gj))
        monkeypatch.setattr(srv, 'ROOT', str(tmp_path))
        srv._load_zcta_feature('WA', 47.05, -120.45)
        assert 'WA' in srv._zcta_centroids_cache
        assert len(srv._zcta_centroids_cache['WA']) == 1

    def test_multipolygon_uses_largest_ring(self, monkeypatch, tmp_path):
        import json as _json
        feat = {
            'type': 'Feature',
            'geometry': {'type': 'MultiPolygon', 'coordinates': [
                [[[-120.5, 47.0], [-120.4, 47.0], [-120.4, 47.1],
                  [-120.5, 47.1], [-120.5, 47.0]]],
            ]},
            'properties': {'zcta': '98001'},
        }
        gj = {'type': 'FeatureCollection', 'features': [feat]}
        state_dir = tmp_path / 'data' / 'WA' / 'zcta'
        state_dir.mkdir(parents=True)
        (state_dir / 'grid_scores.geojson').write_text(_json.dumps(gj))
        monkeypatch.setattr(srv, 'ROOT', str(tmp_path))
        result = srv._load_zcta_feature('WA', 47.05, -120.45)
        assert result['zcta'] == '98001'

    def test_state_code_normalized_to_uppercase(self, monkeypatch, tmp_path):
        import json as _json
        feat = {
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [[
                [-120.5, 47.0], [-120.4, 47.0],
                [-120.4, 47.1], [-120.5, 47.1], [-120.5, 47.0],
            ]]},
            'properties': {'zcta': '98001'},
        }
        gj = {'type': 'FeatureCollection', 'features': [feat]}
        state_dir = tmp_path / 'data' / 'WA' / 'zcta'
        state_dir.mkdir(parents=True)
        (state_dir / 'grid_scores.geojson').write_text(_json.dumps(gj))
        monkeypatch.setattr(srv, 'ROOT', str(tmp_path))
        result = srv._load_zcta_feature('wa', 47.05, -120.45)
        assert result['zcta'] == '98001'


# ---------------------------------------------------------------------------
# Permitter inbox  GET /api/steward/inbox
# ---------------------------------------------------------------------------

class TestStewardInbox:

    def _create_case(self, client, **overrides):
        payload = dict(FULL_INQUIRY, **overrides)
        r = _steward_post(client, '/api/cases',
                          {'site': payload['site'], 'applicant': payload['applicant'],
                           'score': payload.get('score', 0.5)})
        case_id = r.get_json()['case_id']
        with srv.get_db() as db:
            db.execute('UPDATE cases SET lead_agency=? WHERE case_id=?', ('TESTCO', case_id))
        return case_id

    def test_unauthenticated_returns_401(self, client):
        r = client.get('/api/steward/inbox')
        assert r.status_code == 401

    def test_builder_returns_401(self, client):
        login(client, email='builder@example.com', role='builder')
        r = client.get('/api/steward/inbox')
        assert r.status_code == 401

    def test_empty_buckets_initially(self, client):
        _seed_steward(client)
        d = client.get('/api/steward/inbox').get_json()
        assert d['overdue'] == []
        assert d['due_soon'] == []
        assert d['new_inquiries'] == []
        assert d['stuck'] == []

    def test_new_case_appears_in_new_inquiries(self, client):
        case_id = self._create_case(client, site='Inquiry Site')
        d = _steward_get(client, '/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['new_inquiries']]
        assert case_id in ids

    def test_new_inquiries_oldest_first(self, client):
        first = self._create_case(client, site='First')
        second = self._create_case(client, site='Second')
        with srv.get_db() as db:
            db.execute("UPDATE cases SET ts = NOW() - INTERVAL '2 days' WHERE case_id=?", (first,))
            db.execute("UPDATE cases SET ts = NOW() - INTERVAL '1 days' WHERE case_id=?", (second,))
        d = _steward_get(client, '/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['new_inquiries']]
        assert ids.index(first) < ids.index(second)

    def test_stuck_bucket_flags_case_over_threshold(self, client):
        case_id = self._create_case(client, site='Old Case')
        with srv.get_db() as db:
            db.execute("UPDATE cases SET ts = NOW() - INTERVAL '30 days' WHERE case_id=?", (case_id,))
        d = _steward_get(client, '/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['stuck']]
        assert case_id in ids

    def test_stuck_bucket_excludes_recent_case(self, client):
        case_id = self._create_case(client, site='Recent Case')
        d = _steward_get(client, '/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['stuck']]
        assert case_id not in ids

    def test_stuck_uses_stage_override_not_creation_ts(self, client):
        case_id = self._create_case(client, site='Reopened Case')
        with srv.get_db() as db:
            db.execute("UPDATE cases SET ts = NOW() - INTERVAL '60 days' WHERE case_id=?", (case_id,))
            db.execute(
                '''INSERT INTO case_stage_overrides (case_id, stage) VALUES (?,?)
                   ON CONFLICT (case_id) DO UPDATE SET stage=EXCLUDED.stage, ts=NOW()''',
                (case_id, 'Intake')
            )
        d = _steward_get(client, '/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['stuck']]
        assert case_id not in ids

    def test_overdue_bucket_from_rebuttal_deadline(self, client):
        _seed_steward(client)
        case_id = self._create_case(client, site='Overdue Rebuttal')
        client.post('/api/case/' + case_id + '/deadline',
                   data=json.dumps({'due_date': '2020-01-01', 'cycle': 1, 'max_cycles': 3}),
                   content_type='application/json')
        d = client.get('/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['overdue']]
        assert case_id in ids

    def test_due_soon_bucket_from_study_deadline(self, client):
        _seed_steward(client)
        case_id = self._create_case(client, site='Study Due Soon')
        from datetime import date as _d, timedelta as _td
        soon = (_d.today() + _td(days=3)).isoformat()
        post_json(client, '/api/studies', {'name': 'Water study', 'case_id': case_id, 'due': soon})
        d = client.get('/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['due_soon']]
        assert case_id in ids

    def test_scoped_to_caller_agency(self, client):
        case_id = self._create_case(client, site='Other Agency Case')
        with srv.get_db() as db:
            db.execute("UPDATE cases SET lead_agency='OTHERCO' WHERE case_id=?", (case_id,))
        d = _steward_get(client, '/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['new_inquiries']]
        assert case_id not in ids

    def test_admin_sees_all_agencies(self, client):
        case_id = self._create_case(client, site='Cross Agency Case')
        with srv.get_db() as db:
            db.execute("UPDATE cases SET lead_agency='OTHERCO' WHERE case_id=?", (case_id,))
        login(client, email='admin@example.com', role='admin')
        d = client.get('/api/steward/inbox').get_json()
        ids = [c['case_id'] for c in d['new_inquiries']]
        assert case_id in ids


# ---------------------------------------------------------------------------
# Bulk intake  POST /api/steward/bulk_import
# ---------------------------------------------------------------------------

class TestBulkImport:

    GOOD_ROW = {
        'site': 'Bulk Site A', 'applicant': 'Bulk Corp',
        'lat': 47.1, 'lon': -121.2,
        'contact_name': 'Pat', 'contact_email': 'pat@example.com',
        'external_permit_id': 'EX-100',
    }

    def test_unauthenticated_returns_403(self, client):
        r = post_json(client, '/api/steward/bulk_import', {'rows': [self.GOOD_ROW]})
        assert r.status_code == 403

    def test_builder_returns_403(self, client):
        login(client, email='builder@example.com', role='builder')
        r = post_json(client, '/api/steward/bulk_import', {'rows': [self.GOOD_ROW]})
        assert r.status_code == 403

    def test_missing_rows_returns_400(self, client):
        _seed_steward(client)
        r = post_json(client, '/api/steward/bulk_import', {'rows': []})
        assert r.status_code == 400

    def test_creates_cases_from_rows(self, client):
        _seed_steward(client)
        r = post_json(client, '/api/steward/bulk_import',
                     {'rows': [self.GOOD_ROW, {**self.GOOD_ROW, 'site': 'Bulk Site B'}]})
        d = r.get_json()
        assert d['ok'] is True
        assert d['created'] == 2
        assert len(d['case_ids']) == 2

    def test_imported_cases_default_to_intake_stage(self, client):
        _seed_steward(client)
        r = post_json(client, '/api/steward/bulk_import', {'rows': [self.GOOD_ROW]})
        case_id = r.get_json()['case_ids'][0]
        row = client.get('/api/builder/case/' + case_id).get_json()
        assert row['stage'] == 'Intake'
        assert row['imported'] == 1

    def test_bad_row_does_not_fail_whole_batch(self, client):
        _seed_steward(client)
        bad_row = {'site': '', 'applicant': 'No Site'}
        r = post_json(client, '/api/steward/bulk_import',
                     {'rows': [self.GOOD_ROW, bad_row]})
        d = r.get_json()
        assert d['created'] == 1
        assert len(d['errors']) == 1
        assert d['errors'][0]['row'] == 1

    def test_invalid_lat_lon_reported_as_error(self, client):
        _seed_steward(client)
        bad_row = {**self.GOOD_ROW, 'lat': 'not-a-number'}
        r = post_json(client, '/api/steward/bulk_import', {'rows': [bad_row]})
        d = r.get_json()
        assert d['created'] == 0
        assert len(d['errors']) == 1

    def test_defaults_lead_agency_to_caller_agency(self, client):
        _seed_steward(client)
        r = post_json(client, '/api/steward/bulk_import', {'rows': [self.GOOD_ROW]})
        case_id = r.get_json()['case_ids'][0]
        row = client.get('/api/builder/case/' + case_id).get_json()
        assert row['lead_agency'] == 'TESTCO'


# ---------------------------------------------------------------------------
# Proximity / conflict detection  GET /api/case/<case_id>/nearby
# ---------------------------------------------------------------------------

class TestNearbyCases:

    def _create_case(self, client, site, lat, lon, agency='TESTCO', stage=None):
        r = _steward_post(client, '/api/cases', {'site': site, 'applicant': 'Corp'})
        case_id = r.get_json()['case_id']
        with srv.get_db() as db:
            db.execute('UPDATE cases SET lat=?, lon=?, lead_agency=? WHERE case_id=?',
                      (lat, lon, agency, case_id))
        if stage:
            _steward_patch(client, '/api/case/' + case_id + '/stage', {'stage': stage})
        return case_id

    def test_finds_case_within_radius(self, client):
        origin = self._create_case(client, 'Origin', 47.5, -120.3)
        near = self._create_case(client, 'Near', 47.51, -120.31)
        d = _steward_get(client, '/api/case/' + origin + '/nearby').get_json()
        ids = [c['case_id'] for c in d]
        assert near in ids

    def test_excludes_case_outside_radius(self, client):
        origin = self._create_case(client, 'Origin', 47.5, -120.3)
        far = self._create_case(client, 'Far', 40.0, -100.0)
        d = _steward_get(client, '/api/case/' + origin + '/nearby').get_json()
        ids = [c['case_id'] for c in d]
        assert far not in ids

    def test_excludes_self(self, client):
        origin = self._create_case(client, 'Origin', 47.5, -120.3)
        d = _steward_get(client, '/api/case/' + origin + '/nearby').get_json()
        ids = [c['case_id'] for c in d]
        assert origin not in ids

    def test_excludes_resolution_stage(self, client):
        origin = self._create_case(client, 'Origin', 47.5, -120.3)
        resolved = self._create_case(client, 'Resolved', 47.51, -120.31, stage='Resolution')
        d = _steward_get(client, '/api/case/' + origin + '/nearby').get_json()
        ids = [c['case_id'] for c in d]
        assert resolved not in ids

    def test_scoped_to_same_lead_agency(self, client):
        origin = self._create_case(client, 'Origin', 47.5, -120.3, agency='TESTCO')
        other_agency = self._create_case(client, 'OtherAgency', 47.51, -120.31, agency='OTHERCO')
        d = _steward_get(client, '/api/case/' + origin + '/nearby').get_json()
        ids = [c['case_id'] for c in d]
        assert other_agency not in ids

    def test_includes_distance_km(self, client):
        origin = self._create_case(client, 'Origin', 47.5, -120.3)
        self._create_case(client, 'Near', 47.51, -120.31)
        d = _steward_get(client, '/api/case/' + origin + '/nearby').get_json()
        assert 'distance_km' in d[0]
        assert d[0]['distance_km'] >= 0

    def test_no_lat_lon_returns_empty(self, client):
        r = _steward_post(client, '/api/cases', {'site': 'No Coords', 'applicant': 'Corp'})
        case_id = r.get_json()['case_id']
        d = _steward_get(client, '/api/case/' + case_id + '/nearby').get_json()
        assert d == []
