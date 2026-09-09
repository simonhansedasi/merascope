"""
Self-check for scripts/zcta/rescore_ej.py — run after rescoring a state.
Guards the real EJ formula (demog_index x env_burden) against regressing back
to a degenerate/no-op score. WA must already be rescored (data/WA/zcta/grid_scores.geojson).
"""
import json
import sys
import importlib.util
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).parent.parent
GRID_PATH = ROOT / "data" / "WA" / "zcta" / "grid_scores.geojson"

sys.path.insert(0, str(ROOT / "scripts" / "zcta"))
_spec = importlib.util.spec_from_file_location("rescore_ej", ROOT / "scripts" / "zcta" / "rescore_ej.py")
_rescore = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rescore)
ENV_HAZARD_COLS = _rescore.ENV_HAZARD_COLS


@pytest.fixture(scope="module")
def wa_props():
    if not GRID_PATH.exists():
        pytest.skip(f"{GRID_PATH} not found")
    gj = json.load(open(GRID_PATH))
    return [f["properties"] for f in gj["features"]]


def test_ej_score_in_unit_interval(wa_props):
    scores = [p["ej_score"] for p in wa_props]
    assert all(0.0 <= s <= 1.0 for s in scores)


def test_ej_score_not_degenerate(wa_props):
    scores = np.array([p["ej_score"] for p in wa_props])
    assert scores.std() > 0.05, "ej_score has near-zero spread — looks like a constant fallback"


def test_ej_score_tracks_hazard_burden(wa_props):
    """Higher = better on both sides: mean hazard score (farther = better) should
    correlate POSITIVELY with ej_score, since a ZCTA far from all 4 hazard types
    should also score well on the combined burden."""
    hazard_mean = np.array([
        np.mean([p[c] for c in ENV_HAZARD_COLS if p.get(c) is not None])
        for p in wa_props
    ])
    ej = np.array([p["ej_score"] for p in wa_props])
    corr = np.corrcoef(hazard_mean, ej)[0, 1]
    assert corr > 0.2, f"ej_score barely tracks hazard burden (corr={corr:.3f}) — formula may be wrong"


def test_named_examples_match_expected_direction(wa_props):
    """Inchelium (99138, rural reservation, real burden) should score worse than
    Madison Park (98112, wealthy Seattle, low real burden) despite both having
    similar or better-than-average hazard proximity."""
    by_zcta = {p["zcta"]: p for p in wa_props}
    inchelium = by_zcta.get("99138")
    madison_park = by_zcta.get("98112")
    if inchelium is None or madison_park is None:
        pytest.skip("named ZCTAs not present in WA data")
    assert inchelium["ej_score"] < madison_park["ej_score"]
