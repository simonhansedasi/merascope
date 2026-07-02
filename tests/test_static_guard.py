"""Tests for the static-file catch-all allowlist.

The whole repo is rsynced to the server, so the catch-all route must refuse to
serve source, secrets, databases and docs even when those files sit in ROOT.
These tests need no database.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import pytest
import server as srv


@pytest.fixture
def client():
    srv.app.config['TESTING'] = True
    with srv.app.test_client() as c:
        yield c


# Real front-end assets that must keep serving.
ALLOWED = [
    'vendor/fonts.css',
    'vendor/leaflet.js',
    'vendor/leaflet.css',
    'merascope/data.js',
    'merascope/styles.css',
    'merascope/dist/bundle.js',
]

# Files present in the repo/root that must never be downloadable.
BLOCKED = [
    '.env',
    '.git/config',
    'server.py',
    'schema.sql',
    'manage_survey.py',
    'proton-recovery-phrase.pdf',
    'outreach_opcd_draft.md',
    'merascope_log.db',
    'data/survey.db',
    'merascope_for_tom.zip',
    'secrets/anything.pem',
    '../server.py',
]


@pytest.mark.parametrize('path', ALLOWED)
def test_allowed_assets_serve(client, path):
    if not os.path.exists(os.path.join(ROOT, path)):
        pytest.skip('asset not present: ' + path)
    r = client.get('/' + path)
    assert r.status_code == 200, path


@pytest.mark.parametrize('path', BLOCKED)
def test_blocked_paths_404(client, path):
    r = client.get('/' + path)
    assert r.status_code == 404, '{} was served ({})'.format(path, r.status_code)


def test_dotfile_blocked_even_with_allowed_extension(client):
    # A hidden file whose extension is on the allowlist must still be refused.
    assert client.get('/.secret.json').status_code == 404


def test_python_source_blocked(client):
    assert client.get('/server.py').status_code == 404
    assert client.get('/scripts/config.py').status_code == 404


# requirements.txt is .txt (allowlisted) — document that .txt at root is
# intentionally reachable, so nothing sensitive should ever be a root .txt.
def test_txt_extension_is_allowlisted(client):
    if os.path.exists(os.path.join(ROOT, 'requirements.txt')):
        assert client.get('/requirements.txt').status_code == 200
