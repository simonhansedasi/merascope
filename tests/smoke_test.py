"""
Merascope browser smoke test.

Starts a real Flask server on a temp port, uses Playwright Chromium (headless)
to check the site-screening surfaces (home, Builder workspace, portfolio
screening, screening report) and that the frozen steward/case routes are gone.

Run:
    /home/simonhans/anaconda3/envs/merascope/bin/python3 tests/smoke_test.py
"""
import json
import os
import socket
import sys
import tempfile
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# ── helpers ──────────────────────────────────────────────────────────────────

def free_port():
    s = socket.socket()
    s.bind(('', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def start_server(port, db_path):
    import server as srv
    srv.DB = db_path
    srv.init_db()
    srv.app.config['TESTING'] = False
    threading.Thread(
        target=lambda: srv.app.run(port=port, use_reloader=False, threaded=True),
        daemon=True
    ).start()
    for _ in range(40):
        try:
            s = socket.create_connection(('127.0.0.1', port), timeout=0.3)
            s.close()
            return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError('Server did not start in time')


FAKE_CELL = {
    'fid': 42,
    'lat': 47.5,
    'lon': -120.3,
    'stateRank': {'rank': 3, 'total': 500},
    'properties': {
        '_state': 'Washington',
        'cell_id': 41,
        'tx_score': 0.85,       'water_score': 0.72,       'ej_score': 0.60,
        'seismic_score': 0.90,  'flood_score': 0.95,       'protected_score': 0.88,
        'contamination_score': 0.75, 'waterway_score': 0.70,
        'geothermal_score': 0.65,    'aquifer_score': 0.80,
        'flatness_score': 0.55,      'slope_score': 0.78,
        'tx_score_nat': 0.85,        'water_score_nat': 0.72,
        'ej_score_nat': 0.60,        'seismic_score_nat': 0.90,
        'flood_score_nat': 0.95,     'protected_score_nat': 0.88,
        'contamination_score_nat': 0.75, 'waterway_score_nat': 0.70,
        'geothermal_score_nat': 0.65,    'aquifer_score_nat': 0.80,
        'flatness_score_nat': 0.55,      'slope_score_nat': 0.78,
        'protected_frac': 0.05,          'flat_frac': 0.70,
    },
}

PASS = '\033[92mPASS\033[0m'
FAIL = '\033[91mFAIL\033[0m'
results = []


def check(name, condition, detail=''):
    status = PASS if condition else FAIL
    line = f'  [{status}] {name}'
    if not condition and detail:
        line += f'\n         detail: {detail}'
    print(line)
    results.append((name, condition))


def nav(page, hash_path):
    """Navigate to a hash route without a full page reload."""
    page.evaluate(f"() => {{ location.hash = '{hash_path}'; }}")
    page.wait_for_timeout(700)


def switch_role(page, base, role, hash_path):
    """Change role in localStorage and reload the page, then navigate to hash."""
    page.evaluate(f"() => localStorage.setItem('mera_role', '{role}')")
    page.reload()
    page.wait_for_load_state('networkidle', timeout=8000)
    nav(page, hash_path)


def api_get(base, path):
    import urllib.request
    return json.loads(urllib.request.urlopen(base + path).read())


# ── smoke test ────────────────────────────────────────────────────────────────

def run(page, base):

    # ── 1. Home page ──────────────────────────────────────────────────────
    print('\n[1. Home page]')
    page.goto(base)
    page.wait_for_load_state('networkidle', timeout=10000)
    check('Page title contains Merascope',
          'merascope' in page.title().lower())
    check('No Babel compile error',
          page.locator('text=Uncaught SyntaxError').count() == 0)
    check('Builder door present on home page',
          page.locator('text=Enter the Builder workspace').count() > 0)
    check('Steward door removed from home page',
          page.locator('text=Enter the Steward console').count() == 0)
    check('No steward link in nav/footer',
          page.locator('a[href="#/steward"]').count() == 0)

    # ── 2. Builder workspace ──────────────────────────────────────────────
    print('\n[2. Builder workspace]')
    nav(page, '#/builder')
    check('"Portfolio screening" tab visible',
          page.locator('text=Portfolio screening').count() > 0)
    check('"My Inquiry" tab removed',
          page.locator('text=My Inquiry').count() == 0)
    check('Saved cell card "Washington" visible in workspace',
          page.locator('text=Washington').count() > 0)
    check('No "Submit inquiry" button on saved cell',
          page.locator('text=Submit inquiry').count() == 0)

    # ── 3. Portfolio screening ────────────────────────────────────────────
    print('\n[3. Portfolio screening]')
    nav(page, '#/builder/portfolio')
    page.wait_for_timeout(500)
    check('Portfolio page rendered',
          page.locator('text=Portfolio').count() > 0)
    check('No Babel/JS error on portfolio page',
          page.locator('text=Uncaught SyntaxError').count() == 0)

    # ── 4. Frozen surfaces are gone ───────────────────────────────────────
    print('\n[4. Frozen steward/case surfaces]')
    for hash_path in ('#/steward', '#/steward/inbox', '#/co-party', '#/evidence'):
        nav(page, hash_path)
        check(f'{hash_path} falls through to the landing page',
              page.locator('[data-screen-label="Landing"]').count() > 0
              or page.locator('text=Reproducible evidence').count() > 0)
    # /builder/case/ now resolves to the plain Workspace (the /builder prefix), not the old inquiry form
    nav(page, '#/builder/case/')
    check('#/builder/case/ no longer shows the inquiry form',
          page.locator('text=Find your inquiry').count() == 0
          and page.locator('text=Submit a site inquiry').count() == 0)
    page.goto(base)
    page.wait_for_load_state('networkidle', timeout=10000)

    # ── 4b. Pricing page ──────────────────────────────────────────────────
    print('\n[4b. Pricing page]')
    nav(page, '#/pricing')
    check('Pricing offers the screening batch',
          page.locator('text=Request a quote').count() > 0)
    check('No Steward console tier on pricing',
          page.locator('text=Steward console').count() == 0
          and page.locator('text=Performance participation').count() == 0)

    # ── 4c. Explorer minimum-score slider is 0-1 with 3 decimals ──────────
    print('\n[4c. Minimum score slider]')
    nav(page, '#/explorer')
    page.wait_for_timeout(1500)
    sl = page.locator('input[aria-label="Minimum site score"]')
    check('Minimum score slider present', sl.count() > 0)
    if sl.count() > 0:
        check('Slider runs 0 to 1, step 0.001',
              sl.first.get_attribute('min') == '0' and sl.first.get_attribute('max') == '1'
              and sl.first.get_attribute('step') == '0.001',
              f"min={sl.first.get_attribute('min')} max={sl.first.get_attribute('max')} step={sl.first.get_attribute('step')}")
        sl.first.evaluate("el => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '0.5'); el.dispatchEvent(new Event('input', { bubbles: true })); }")
        page.wait_for_timeout(400)
        check('Slider readout shows 3 decimals', page.locator('text=0.500').count() > 0)
    page.goto(base)
    page.wait_for_load_state('networkidle', timeout=10000)

    # ── 5. Site screening report ──────────────────────────────────────────
    print('\n[5. Site screening report]')
    import urllib.request
    html = urllib.request.urlopen(base + '/report?state=WA&lat=47.5&lon=-120.3&name=Smoke').read().decode()
    check('Report titled "Site Screening Report"', 'Site Screening Report' in html)
    check('Old "Permit Justification Report" title gone', 'Permit Justification Report' not in html)
    check('Scope and limitations section present', 'Scope and limitations' in html)


# ── entry point ───────────────────────────────────────────────────────────────

def main():
    port = free_port()
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    tmp.close()

    print(f'Starting server on :{port} with temp DB {tmp.name}')
    start_server(port, tmp.name)
    base = f'http://127.0.0.1:{port}'

    cells_json = json.dumps([FAKE_CELL])
    init_script = f"""(function() {{
        localStorage.setItem('mera_saved_v1', JSON.stringify({cells_json}));
        localStorage.setItem('mera_tour_done', '1');
        var r = localStorage.getItem('mera_role');
        if (!r || r === 'public') localStorage.setItem('mera_role', 'builder');
    }})();"""

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.add_init_script(script=init_script)
        page.on('pageerror', lambda e: print(f'  [page error] {e}'))

        try:
            run(page, base)
        except Exception as e:
            print(f'\n{FAIL} Unexpected crash: {e}')
            import traceback; traceback.print_exc()
            results.append(('unexpected crash', False))
        finally:
            browser.close()

    os.unlink(tmp.name)

    passed = sum(1 for _, ok in results if ok)
    total  = len(results)
    failed = [n for n, ok in results if not ok]
    print(f'\n{"=" * 52}')
    print(f'Smoke test: {passed}/{total} passed')
    if failed:
        print('Failed checks:')
        for n in failed:
            print(f'  - {n}')
    sys.exit(0 if not failed else 1)


if __name__ == '__main__':
    main()
