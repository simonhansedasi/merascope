"""Tests for the public ZIP exposure lookup.

This is the only ungated surface in the product, so the things worth pinning down
are the ones that would embarrass us in public: that the whole ranking cannot be
downloaded in one request, that an unknown ZIP explains itself instead of
returning a zero that reads as "no exposure", and that the copy never promises a
probability. These tests need no database.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import pytest
import server as srv

_RISK_BUILT = os.path.exists(os.path.join(ROOT, 'data', '.risk', 'zcta_tiers.json'))
needs_risk = pytest.mark.skipif(not _RISK_BUILT,
                                reason='run scripts/18_risk_tiers.py to build risk data')


@pytest.fixture
def client():
    srv.app.config['TESTING'] = True
    # Each test gets a clean limiter so ordering can't cause a spurious 429.
    srv._risk_rl_store.clear()
    with srv.app.test_client() as c:
        yield c


@needs_risk
def test_lookup_returns_tier_and_observed_rate(client):
    r = client.get('/api/risk/20147')          # Ashburn, VA
    assert r.status_code == 200
    d = r.get_json()
    assert d['ok'] is True and d['zip'] == '20147'
    assert 1 <= d['exposure']['tier'] <= d['exposure']['n_tiers']
    # The observed rate is what the page quotes; it must be present and a rate.
    assert 0.0 <= d['exposure']['observed'] <= 1.0
    assert 0.0 <= d['exposure']['lowest_tier_observed'] <= 1.0
    # There is one ranking now. A second per-ZIP tier is the thing this design
    # removed, so its absence is worth pinning down.
    assert 'pipeline' not in d


@needs_risk
def test_known_dense_zip_lands_near_the_top(client):
    """Ashburn VA carries 12 mapped facilities; it must score high.

    Top TWO tiers, not the exact top decile. Scores are out-of-fold under
    spatially-blocked CV, so a heavily-built ZIP sits wherever its held-out region
    puts it and can land either side of the 9/10 boundary — 20147 moved from 10 to
    9 when the state-assignment fix shifted features on ~10% of rows, while overall
    lift went UP (4.10x -> 4.18x). Pinning one ZIP to one decile tests the boundary,
    not the model.
    """
    d = client.get('/api/risk/20147').get_json()
    assert d['exposure']['tier'] >= d['exposure']['n_tiers'] - 1
    assert d['built_facilities'] > 0


@needs_risk
def test_attribution_is_returned(client):
    """CC BY 4.0 and ODbL both require attribution to travel with the data."""
    d = client.get('/api/risk/20147').get_json()
    joined = ' '.join(d['sources'])
    assert 'OpenStreetMap' in joined
    assert 'Compute Atlas' in joined


def test_bulk_ranking_is_not_downloadable(client):
    """The per-ZCTA file must not be reachable as a static asset. '.json' is an
    allowlisted extension, so the protection is the dot-directory rule."""
    for path in ('data/.risk/zcta_tiers.json',
                 'data/.risk/tier_stats.json',
                 '.risk/zcta_tiers.json'):
        assert client.get('/' + path).status_code == 404, path


@needs_risk
def test_no_bulk_listing_route(client):
    """There is deliberately no route that returns many ZIPs at once."""
    for path in ('/api/risk', '/api/risk/', '/api/risk/all', '/api/risk/*'):
        assert client.get(path).status_code in (301, 308, 400, 404, 405)


@pytest.mark.parametrize('bad', ['abc', '1234', '123456', '', 'null'])
def test_invalid_zip_rejected(client, bad):
    r = client.get('/api/risk/' + bad)
    assert r.status_code in (400, 404)


@needs_risk
def test_unknown_zip_explains_itself(client):
    """A ZIP with no ZCTA must not come back as a zero that reads as 'safe'."""
    r = client.get('/api/risk/00001')
    assert r.status_code == 404
    d = r.get_json()
    assert d['ok'] is False and d['err'] == 'no_zcta'
    assert 'PO-box' in d['msg'] or 'tabulation' in d['msg']
    assert 'tier' not in d


@needs_risk
def test_rate_limit_returns_429(client):
    limit = srv._RISK_RL_LIMIT
    codes = [client.get('/api/risk/20147').status_code for _ in range(limit + 5)]
    assert 429 in codes
    assert codes[0] == 200


@needs_risk
def test_tier_stats_are_monotonic(client):
    """The public table only makes sense if higher tiers really do host more.

    Applies to the BUILT rate only. The pipeline rate is deliberately not asserted
    monotonic — at 259 known projects nationally the low tiers sit inside each
    other's intervals, and pretending otherwise is what the old second ranking did.
    """
    d = client.get('/api/risk/tiers').get_json()
    obs = [t['observed'] for t in d['stats']['exposure']['tiers']]
    assert obs == sorted(obs), obs
    assert obs[-1] > obs[0] * 20


@needs_risk
def test_shared_bins_report_both_rates(client):
    """Both rates must ride the same row.

    This is the whole design: one group of ZIP codes described twice, so the built
    and pipeline columns can be read across. If a future change gives the pipeline
    its own bins, `n` stops being shared and this fails.
    """
    d = client.get('/api/risk/tiers').get_json()
    rows = d['stats']['exposure']['tiers']
    assert len(rows) == d['n_tiers']
    for r in rows:
        assert 0.0 <= r['observed'] <= 1.0
        assert 0.0 <= r['observed_pipeline'] <= 1.0
        assert 0.0 < r['ci_lo_pipeline'] <= r['ci_hi_pipeline'] <= 1.0
        # The Jeffreys interval is Beta(k+.5, n-k+.5), so at k=0 its lower bound
        # is small but strictly positive and does not cover the point estimate.
        # That is correct — a tier with no known proposals is not evidence that
        # the rate is exactly zero — so containment is only asserted above zero.
        if r['observed_pipeline'] > 0:
            assert r['ci_lo_pipeline'] <= r['observed_pipeline'] <= r['ci_hi_pipeline']
        assert r['n'] > 0                      # one n, serving both rates
        assert r['n_divergent'] >= 0
    # Equal-sized bins, so no row may be quoted as if it covered more ZIPs.
    assert max(r['n'] for r in rows) - min(r['n'] for r in rows) <= 1


@needs_risk
def test_no_separate_pipeline_ranking(client):
    """Regression guard against reintroducing a second scale.

    Two independent decile ladders looked comparable but were not — the two top
    tiers shared only 812 of 3,326 ZIPs, so the same tier number named different
    ZIP codes on each and the page had to explain the contradiction away.
    """
    d = client.get('/api/risk/tiers').get_json()
    assert 'pipeline' not in d['stats']
    assert list(d['stats'].keys()) == ['exposure']


@needs_risk
def test_divide_stats_are_published(client):
    """The page quotes these; each must come from the script, not from JSX."""
    d = client.get('/api/risk/tiers').get_json()
    v = d['divide']
    # Same statistic on both sides — each label's share of its own national total.
    assert 0.0 <= v['top_tier_share_pipeline'] < v['top_tier_share_built'] <= 1.0
    assert v['n_divergent'] > 0
    assert v['divergent_rural_share'] > v['hosting_rural_share']


@needs_risk
def test_divergence_flag_for_empty_zip_with_pipeline(client):
    """Nothing built, something proposed — the case the page calls out by name."""
    d = client.get('/api/risk/50261').get_json()      # Van Meter, IA
    assert d['built_facilities'] == 0
    assert d['pipeline_facilities'] > 0
    assert d['divergence'] is True


@needs_risk
def test_divergence_flag_is_false_where_already_built(client):
    d = client.get('/api/risk/20147').get_json()      # Ashburn, VA
    assert d['built_facilities'] > 0
    assert d['divergence'] is False


def test_page_copy_makes_no_probability_claim():
    """The model is not calibrated well enough to state a probability per ZIP.
    Guard the wording so it cannot drift back in."""
    src = open(os.path.join(ROOT, 'merascope', 'risk.jsx')).read()
    body = src.split('Do not reintroduce', 1)[-1].split('*/', 1)[-1].lower()
    for banned in ('probability', 'chance of', 'likely to be targeted', '% chance'):
        assert banned not in body, banned


@needs_risk
def test_map_layer_is_aggregated_not_per_zip(client):
    """The national map layer is the one place a bulk ranking could leak. It must
    stay coarse: cells, not ZIPs, and no ZIP identifiers anywhere in the payload."""
    d = client.get('/api/risk/grid').get_json()
    assert d['ok'] is True
    assert d['cell'] >= 0.25                       # ~28 km, not neighbourhood scale
    assert len(d['cells']) < 15000                 # far fewer than 33,252 ZCTAs
    assert 'zcta' not in d['fields'] and 'zip' not in d['fields']
    # Each cell is [gx, gy, mean_tier, n_zctas, n_built] — a mean, never a list.
    for row in d['cells'][:200]:
        assert len(row) == 5
        assert 1.0 <= row[2] <= 10.0


@needs_risk
def test_lookup_returns_coordinates_for_the_map(client):
    d = client.get('/api/risk/20147').get_json()
    assert 24 < d['lat'] < 50 and -125 < d['lon'] < -66
