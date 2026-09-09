"""
rescore_ej.py — Recompute ej_score with a real EJScreen-style formula.

The formula that shipped in 02_zcta_indicators.py was pure demographic
composition (poverty + minority rate), inverted, and mislabeled "Environmental
Justice" in docs/whitepaper despite having zero pollution/hazard data. This
script overwrites ej_score in place with:

  env_burden  = 1 - mean(contamination_score, superfund_score, rcra_score, air_quality_score)
  raw_burden  = demog_index * env_burden          # EJScreen's own multiplicative structure
  burden_norm = clip((raw_burden - p01) / (p99 - p01), 0, 1)
  ej_score    = 1 - burden_norm                   # sign preserved: higher = better/less burden

Only ej_score changes. Every other column (tx_score, water_score, the raw hazard
scores themselves, etc.) is left untouched. Does NOT re-run 02_zcta_indicators.py —
the 4 hazard scores it needs are already in every state's zcta/grid_scores.geojson
(scripts 04/12/13 already ran against ZCTA geometry for all 48 states).

demog_index is reused from 02_zcta_indicators.py's fetch_acs_zcta() (cached to
zcta/acs_demog.csv per state) via a dynamic import, since that module's filename
starts with a digit.

Usage:
  python rescore_ej.py WA
  python rescore_ej.py --all
"""

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS_DIR))
from normalize_zcta_national import STATES

_spec = importlib.util.spec_from_file_location(
    "zcta_indicators_02", Path(__file__).parent / "02_zcta_indicators.py"
)
_zcta02 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_zcta02)
fetch_acs_zcta = _zcta02.fetch_acs_zcta

PROJECT_ROOT = SCRIPTS_DIR.parent
ENV_HAZARD_COLS = ["contamination_score", "superfund_score", "rcra_score", "air_quality_score"]


def rescore_state(abbr):
    zcta_root = PROJECT_ROOT / "data" / abbr / "zcta"
    grid_path = zcta_root / "grid_scores.geojson"
    if not grid_path.exists():
        print(f"{abbr}: no {grid_path} — skipping")
        return

    with open(grid_path) as f:
        gj = json.load(f)
    feats = gj["features"]

    zcta_codes = {str(f["properties"]["zcta"]).zfill(5) for f in feats}
    df_acs = fetch_acs_zcta(zcta_codes, zcta_root)
    demog_by_zcta = dict(zip(df_acs["zcta"].astype(str).str.zfill(5), df_acs["demog_index"]))

    raw_burden = []
    for feat in feats:
        p = feat["properties"]
        zcta = str(p["zcta"]).zfill(5)
        demog = demog_by_zcta.get(zcta)
        hazard_vals = [p[c] for c in ENV_HAZARD_COLS if p.get(c) is not None]
        if demog is None or not hazard_vals:
            raw_burden.append(np.nan)
            continue
        env_burden = 1.0 - float(np.mean(hazard_vals))
        raw_burden.append(demog * env_burden)

    raw_burden = np.array(raw_burden, dtype=float)
    valid = raw_burden[~np.isnan(raw_burden)]
    if len(valid) == 0:
        print(f"{abbr}: no valid demog_index/hazard matches — skipping")
        return
    p01, p99 = np.percentile(valid, [1, 99])
    denom = max(p99 - p01, 1e-9)

    old_scores = [f["properties"].get("ej_score") for f in feats]
    for feat, rb in zip(feats, raw_burden):
        if np.isnan(rb):
            continue
        burden_norm = np.clip((rb - p01) / denom, 0, 1)
        feat["properties"]["ej_score"] = float(1.0 - burden_norm)
    median_score = float(np.nanmedian([f["properties"]["ej_score"] for f in feats]))
    for feat, rb in zip(feats, raw_burden):
        if np.isnan(rb):
            feat["properties"]["ej_score"] = median_score

    with open(grid_path, "w") as f:
        json.dump(gj, f)

    new_scores = [f["properties"]["ej_score"] for f in feats]
    changed = sum(1 for o, n in zip(old_scores, new_scores) if o is None or abs(o - n) > 1e-6)
    print(f"{abbr}: {len(feats)} ZCTAs, {changed} ej_score values changed "
          f"(new range {min(new_scores):.3f}-{max(new_scores):.3f})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state", nargs="?", help="State abbreviation (e.g. WA)")
    parser.add_argument("--all", action="store_true", help="Rescore all 48 states")
    args = parser.parse_args()

    if args.all:
        for st in STATES:
            rescore_state(st)
    elif args.state:
        rescore_state(args.state.upper())
    else:
        parser.error("specify a state or --all")


if __name__ == "__main__":
    main()
