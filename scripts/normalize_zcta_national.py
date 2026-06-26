#!/usr/bin/env python3
"""
normalize_zcta_national.py — Add *_nat columns to all state ZCTA GeoJSONs.

Computes global p01-p99 percentiles across all ~33k ZCTAs and normalizes each
indicator score to [0, 1] for cross-state comparison. Binary gates are copied
directly without re-ranking.

Must be run AFTER all 48 states have been scored by run_zcta_study.py.
Output: *_nat columns written in-place to data/{STATE}/zcta/grid_scores.geojson.

Usage:
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -u scripts/normalize_zcta_national.py
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -u scripts/normalize_zcta_national.py --states WA OR
"""

import argparse
import json
import numpy as np
from pathlib import Path

STATES = [
    "WA","OR","TX","CA","NV","UT","ID","MT","AZ","CO","WY","NM","ND","SD","NE","KS","OK",
    "MN","IA","MO","AR","LA","MI","WI","IL","IN","KY","TN","MS","GA","OH",
    "AL","FL","SC","NC","VA","WV","PA","NY","NJ","CT","RI","MA","VT","NH","ME","DE","MD",
]

DATA_DIR = Path("data")

# (score_col, binary)
# binary=True: copy value directly to *_nat without re-ranking
INDICATORS = [
    ("tx_score",           False),
    ("water_score",        False),
    ("ej_score",           False),
    ("pop_exposure_score", False),
    ("seismic_score",      False),
    ("flood_score",        True),
    ("contamination_score",False),
    ("waterway_score",     False),
    ("geothermal_score",   False),
    ("flatness_score",     False),
    ("slope_score",        False),
    ("protected_score",    True),
    ("aquifer_score",      False),
    ("soil_score",         False),
    ("soil_profile_score", False),
    ("ksat_score",         False),
    ("substation_score",   False),
    ("superfund_score",    False),
    ("rcra_score",         False),
    ("air_quality_score",  True),
    ("fiber_score",        False),
    ("water_stress_score", False),
    ("grid_capacity_score",False),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--states", nargs="+", default=None,
                        help="Limit to specific states (e.g. --states WA OR)")
    args = parser.parse_args()

    target_states = [s.upper() for s in args.states] if args.states else STATES

    # Load all ZCTA GeoJSONs
    state_data = {}
    for state in target_states:
        path = DATA_DIR / state / "zcta" / "grid_scores.geojson"
        if not path.exists():
            print(f"{state}: no ZCTA grid_scores.geojson — skipping")
            continue
        with open(path) as f:
            state_data[state] = json.load(f)
        print(f"{state}: {len(state_data[state]['features'])} ZCTAs loaded")

    if not state_data:
        print("No ZCTA data found. Run run_zcta_study.py for each state first.")
        return

    # Collect all values per indicator across all loaded states
    print("\nCollecting global distributions...")
    all_vals = {col: [] for col, _ in INDICATORS}
    for state, gj in state_data.items():
        for feat in gj["features"]:
            p = feat["properties"]
            for col, binary in INDICATORS:
                if not binary and col in p and p[col] is not None:
                    all_vals[col].append(float(p[col]))

    # Compute global p01 / p99 per indicator
    stats = {}
    for col, binary in INDICATORS:
        if binary:
            continue
        vals = np.array(all_vals[col])
        if len(vals) == 0:
            print(f"  WARNING: no values for {col} — nat column will be 0")
            stats[col] = (0.0, 1.0)
            continue
        p01, p99 = np.percentile(vals, [1, 99])
        stats[col] = (p01, p99)
        print(f"  {col}: p01={p01:.4f}, p99={p99:.4f}  (n={len(vals)})")

    # Write *_nat columns back to each state file
    print("\nWriting *_nat columns...")
    for state, gj in state_data.items():
        for feat in gj["features"]:
            p = feat["properties"]
            for col, binary in INDICATORS:
                nat_col = col + "_nat"
                val = p.get(col)
                if val is None:
                    p[nat_col] = 0.0
                elif binary:
                    p[nat_col] = float(val)
                else:
                    p01, p99 = stats[col]
                    rng = p99 - p01
                    if rng < 1e-9:
                        p[nat_col] = 0.0
                    else:
                        p[nat_col] = float(np.clip((float(val) - p01) / rng, 0.0, 1.0))

        out_path = DATA_DIR / state / "zcta" / "grid_scores.geojson"
        with open(out_path, "w") as f:
            json.dump(gj, f, separators=(",", ":"))
        print(f"  {state}: wrote {out_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
