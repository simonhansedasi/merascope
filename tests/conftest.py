"""Shared fixtures for Merascope pipeline tests."""
import json
import sys
import pytest
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

WA_GEOJSON = ROOT / "data" / "WA" / "grid_scores.geojson"


@pytest.fixture(scope="session")
def wa_props():
    if not WA_GEOJSON.exists():
        pytest.skip("data/WA/grid_scores.geojson not present — run pipeline for WA first")
    with open(WA_GEOJSON) as f:
        d = json.load(f)
    return [feat["properties"] for feat in d["features"]]
