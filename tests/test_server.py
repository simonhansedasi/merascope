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
    import psycopg2
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

    def test_happy_path(self, client):
        r = post_json(client, '/api/cases', {'site': 'Alpha', 'applicant': 'Corp', 'score': 0.6})
        assert r.status_code == 200
        d = r.get_json()
        assert d['ok'] is True
        assert 'case_id' in d

    def test_stage_defaults_to_site_inquiry(self, client):
        r = post_json(client, '/api/cases', {'site': 'Alpha', 'applicant': 'Corp', 'score': 0.6})
        case_id = r.get_json()['case_id']
        d = client.get('/api/cases').get_json()
        match = next(c for c in d['cases'] if c['case_id'] == case_id)
        assert match['stage'] == 'Site Inquiry'

    def test_missing_site_returns_400(self, client):
        r = post_json(client, '/api/cases', {'applicant': 'Corp'})
        assert r.status_code == 400

    def test_missing_applicant_returns_400(self, client):
        r = post_json(client, '/api/cases', {'site': 'Alpha'})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/cases
# ---------------------------------------------------------------------------

class TestListCases:

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
