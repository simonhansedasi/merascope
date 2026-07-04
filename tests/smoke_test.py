"""
Merascope browser smoke test.

Starts a real Flask server on a temp port, uses Playwright Chromium (headless)
to drive the full builder inquiry -> steward docket flow.

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

    # ── 2. Builder tab ────────────────────────────────────────────────────
    print('\n[2. Builder tab navigation]')
    nav(page, '#/builder')
    check('"My Inquiry" tab visible in builder nav',
          page.locator('text=My Inquiry').count() > 0)

    # ── 3. Submit form renders ────────────────────────────────────────────
    print('\n[3. Submit form]')
    nav(page, '#/builder/case/')
    check('"Submit site inquiry" tab button exists',
          page.locator('button:has-text("Submit site inquiry")').count() > 0)
    check('"Find your inquiry" heading exists',
          page.locator('text=Find your inquiry').count() > 0)

    page.locator('button:has-text("Submit site inquiry")').first.click()
    page.wait_for_timeout(500)

    check('"Submit a site inquiry" heading visible',
          page.locator('text=Submit a site inquiry').count() > 0)
    check('Step 1 "Select saved site" label visible',
          page.locator('text=1. Select saved site').count() > 0)
    check('Seeded cell card "Washington #42" visible',
          page.locator('text=Washington').count() > 0)

    # ── 4. Progressive reveal ─────────────────────────────────────────────
    print('\n[4. Progressive reveal]')
    check('Step 2 hidden before cell selected',
          page.locator('text=2. Confirm project details').count() == 0)
    check('Submit button hidden before cell selected',
          page.locator('button[onclick*="submit"], button:has-text("Submit site inquiry")').count() == 0
          or page.locator('text=4. Your details').count() == 0)

    page.locator('text=Washington').first.click()
    page.wait_for_timeout(600)

    check('Step 2 "Confirm project details" appears after click',
          page.locator('text=2. Confirm project details').count() > 0)
    check('Step 3 "Lead agency" appears',
          page.locator('text=3. Lead agency').count() > 0)
    check('Step 4 "Your details" appears',
          page.locator('text=4. Your details').count() > 0)
    check('Submit button appears after cell selected',
          page.locator('button:has-text("Submit site inquiry")').last.is_visible())

    # ── 4b. Submit deep-link prefills the saved cell ──────────────────────
    # Leave the case view entirely, then arrive via the deep link — a fresh
    # mount must land on the submit tab with cell 42 already selected.
    print('\n[4b. Submit deep-link]')
    nav(page, '#/builder')
    page.wait_for_timeout(400)
    nav(page, '#/builder/case/?submit=42')
    page.wait_for_timeout(900)
    check('Deep-linked cell is pre-selected',
          page.locator('text=Selected').count() > 0)
    check('Step 2 visible without manual cell click',
          page.locator('text=2. Confirm project details').count() > 0)

    # ── 5. Submit the inquiry ─────────────────────────────────────────────
    print('\n[5. Inquiry submission]')
    page.fill('input[placeholder="e.g. Cascade Summit Data LLC"]', 'Smoke Test Corp')
    page.fill('input[placeholder="jane@example.com"]', 'smoke@test.com')
    page.locator('button:has-text("Submit site inquiry")').last.click()
    page.wait_for_timeout(2000)

    submitted = (
        page.locator('text=Site inquiry submitted').count() > 0
        or page.locator('text=Site inquiry received').count() > 0
        or page.locator('text=In intake').count() > 0
    )
    check('Confirmation shown after submit', submitted)

    # ── 6. API round-trip ─────────────────────────────────────────────────
    print('\n[6. API round-trip]')
    cases = api_get(base, '/api/cases').get('cases', [])
    check('Submitted case in /api/cases', len(cases) >= 1)

    case_id = None
    if cases:
        row = cases[0]
        case_id = row['case_id']
        check('Stage is "Site Inquiry"',
              row['stage'] == 'Site Inquiry', f'got: {row.get("stage")}')

        detail = api_get(base, '/api/builder/case/' + case_id)
        check('GET /api/builder/case returns correct applicant',
              detail.get('applicant') == 'Smoke Test Corp',
              f'got: {detail.get("applicant")}')
        check('contact_email persisted',
              detail.get('contact_email') == 'smoke@test.com')

    # ── 7. Steward docket ─────────────────────────────────────────────────
    print('\n[7. Steward docket]')
    switch_role(page, base, 'steward', '#/steward')

    check('Docket page rendered',
          page.locator('text=Docket').count() > 0
          or page.locator('[data-screen-label*="Docket"]').count() > 0)

    if case_id:
        # Docket fetches /api/cases on mount — give it a moment
        page.wait_for_timeout(1200)
        # CaseCard shows k.site (Washington #42) and k.applicant (Smoke Test Corp)
        check('Submitted case visible on docket',
              page.locator('text=Smoke Test Corp').count() > 0
              or page.locator('text=Washington #42').count() > 0
              or page.locator(f'text={case_id}').count() > 0)

    # ── 7b. Permitter inbox ────────────────────────────────────────────────
    print('\n[7b. Permitter inbox]')
    nav(page, '#/steward/inbox')
    page.wait_for_timeout(1000)
    check('Inbox page rendered',
          page.locator('[data-screen-label*="Inbox"]').count() > 0)
    check('"New inquiries" bucket visible',
          page.locator('text=New inquiries').count() > 0)
    check('"Stuck" bucket visible',
          page.locator('text=Stuck').count() > 0)
    check('No Babel/JS error on inbox page',
          page.locator('text=Uncaught SyntaxError').count() == 0)

    # ── 7c. Bulk import page ────────────────────────────────────────────────
    print('\n[7c. Bulk import page]')
    nav(page, '#/steward/bulk-import')
    page.wait_for_timeout(500)
    check('Bulk import page rendered',
          page.locator('[data-screen-label*="Bulk import"]').count() > 0)
    check('Upload CSV control visible',
          page.locator('text=Upload CSV').count() > 0)

    # ── 8. Steward intake case view ───────────────────────────────────────
    if case_id:
        print('\n[8. Steward intake case view]')
        nav(page, '#/steward/case/' + case_id)
        page.wait_for_timeout(1000)

        check('"New site inquiry received" callout visible',
              page.locator('text=New site inquiry received').count() > 0)
        check('Applicant name visible',
              page.locator('text=Smoke Test Corp').count() > 0)
        check('"Advance stage" section present',
              page.locator('text=Advance stage').count() > 0)
        check('Stage buttons exist',
              page.locator('button:has-text("Move to")').count() > 0)
        check('Permit justification report link present',
              page.locator('a[href^="/report/"]').count() > 0)

    # ── 9. Builder lookup ─────────────────────────────────────────────────
    if case_id:
        print('\n[9. Builder case lookup]')
        switch_role(page, base, 'builder', '#/builder/case/')
        page.wait_for_timeout(400)

        page.fill('input[placeholder="e.g. 26-0142"]', case_id)
        page.locator('button:has-text("Look up")').click()
        page.wait_for_timeout(1200)

        check('Intake view loads for submitted case',
              page.locator('text=Site inquiry received').count() > 0
              or page.locator('text=In intake').count() > 0,
              page.content()[:200])


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
