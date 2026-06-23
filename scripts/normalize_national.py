#!/usr/bin/env python3
"""
normalize_national.py — Add _nat score columns to all state GeoJSONs.

Re-normalizes scores using global p01-p99 clipping of raw physical values, so cells
can be ranked across state lines. Adds *_nat columns alongside existing state-normalized
columns (state scores are unchanged).

Binary gates (flood_score, protected_score) stay binary — not re-ranked.

Usage:
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -u scripts/normalize_national.py
"""

import json
import numpy as np
from pathlib import Path

STATES = [
    "WA","OR","TX","CA","NV","UT","ID","MT","AZ","CO","WY","NM","ND","SD","NE","KS","OK",
    "MN","IA","MO","AR","LA","MI","WI","IL","IN","KY","TN","MS","GA","OH",
    "AL","FL","SC","NC","VA","WV","PA","NY","NJ","CT","RI","MA","VT","NH","ME","DE","MD",
]

DATA_DIR = Path("data")

# (nat_col, raw_col, direction)
# direction 'direct': higher raw = higher score
# direction 'invert': lower raw = higher score
# raw_col=None: use existing state score as proxy (no physical raw available)
SCORE_MAP = [
    ("tx_score_nat",            "tx_dist_m",       "invert"),
    ("water_score_nat",         "ann_precip_mm",    "direct"),
    ("ej_score_nat",            None,               "direct"),   # no single raw; rank state scores
    ("pop_exposure_score_nat",  "pop_density",      "invert"),
    ("seismic_score_nat",       "seismic_pga_g",    "invert"),
    ("contamination_score_nat", "tri_dist_m",       "direct"),
    ("waterway_score_nat",      "river_dist_m",     "direct"),
    ("geothermal_score_nat",    "heatflow_mwm2",    "direct"),
    ("flatness_score_nat",      "flat_frac",        "direct"),   # missing in early 9 states
    ("slope_score_nat",         "flat_frac",        "direct"),   # same raw as flatness
    ("aquifer_score_nat",       "aquifer_depth_ft", "invert"),
    ("soil_score_nat",          None,               "direct"),   # rank state scores
    ("soil_profile_score_nat",  None,               "direct"),   # rank state scores
    ("ksat_score_nat",          "ksat_mean_ums",    "invert"),
    # Supplemental indicators (scripts 11-16, added 2026-06-23)
    ("substation_score_nat",    "substation_dist_m",  "invert"),  # closer = better
    ("superfund_score_nat",     "superfund_dist_m",   "direct"),  # farther = better
    ("rcra_score_nat",          "rcra_dist_m",        "direct"),  # farther = better
    ("fiber_score_nat",         "fac_dist_m",         "invert"),  # closer carrier hotel = better
    ("water_stress_score_nat",  "water_stress_raw",   "invert"),  # lower stress = better
    ("grid_capacity_score_nat", None,                 "direct"),  # rank state queue scores
]

# Binary — copy state value directly into _nat column, no re-ranking
BINARY_COPY = ["flood_score", "protected_score", "air_quality_score"]

# Scores whose nat col is derived from state score (no raw); use base col name
STATE_PROXY = {
    "ej_score_nat":            "ej_score",
    "soil_score_nat":          "soil_score",
    "soil_profile_score_nat":  "soil_profile_score",
    "grid_capacity_score_nat": "grid_capacity_score",
}


def load_geojsons():
    """Load all state GeoJSONs. Returns (state, features_list) pairs."""
    data = {}
    for st in STATES:
        path = DATA_DIR / st / "grid_scores.geojson"
        if not path.exists():
            print(f"  WARNING: {st} missing grid_scores.geojson — skipping")
            continue
        with open(path) as f:
            gj = json.load(f)
        data[st] = gj
    return data


def collect_global(all_gj, col):
    """Collect all non-null values of `col` across all states. Returns (values, cell_index).
    cell_index: list of (state, feat_idx) for each value."""
    vals, idx = [], []
    for st, gj in all_gj.items():
        for i, feat in enumerate(gj["features"]):
            v = feat["properties"].get(col)
            if v is not None and not (isinstance(v, float) and np.isnan(v)):
                vals.append(float(v))
                idx.append((st, i))
    return np.array(vals), idx


def minmax_nat(raw_vals, direction, p_lo=1, p_hi=99):
    """Normalize raw_vals to 0-1 using global p_lo/p_hi clipping."""
    lo = np.percentile(raw_vals, p_lo)
    hi = np.percentile(raw_vals, p_hi)
    span = hi - lo if hi > lo else 1.0
    normed = np.clip((raw_vals - lo) / span, 0.0, 1.0)
    if direction == "invert":
        normed = 1.0 - normed
    return normed


def main():
    print("Loading all state GeoJSONs...")
    all_gj = load_geojsons()
    print(f"  {len(all_gj)} states loaded")

    # Initialise _nat property dicts: all_nat[state][feat_idx] = {col: val}
    all_nat = {st: [{} for _ in gj["features"]] for st, gj in all_gj.items()}

    # Binary copy
    print("\nCopying binary gate scores...")
    for base_col in BINARY_COPY:
        nat_col = base_col + "_nat"
        for st, gj in all_gj.items():
            for i, feat in enumerate(gj["features"]):
                v = feat["properties"].get(base_col)
                all_nat[st][i][nat_col] = v

    # Raw-backed and state-proxy scores
    for nat_col, raw_col, direction in SCORE_MAP:
        src_col = raw_col if raw_col is not None else STATE_PROXY.get(nat_col)
        print(f"\n{nat_col} <- {src_col} ({direction})")

        vals, idx = collect_global(all_gj, src_col)
        if len(vals) == 0:
            print(f"  No data found for {src_col} — skipping")
            continue

        normed = minmax_nat(vals, direction)
        lo = np.percentile(vals, 1)
        hi = np.percentile(vals, 99)
        print(f"  {len(vals)} cells | raw p01={lo:.4g} p99={hi:.4g} | "
              f"nat range {normed.min():.3f}-{normed.max():.3f}")

        for (st, feat_i), nat_val in zip(idx, normed):
            all_nat[st][feat_i][nat_col] = round(float(nat_val), 4)

        # States missing the raw column get their state score copied as-is
        cells_with = {st for st, _ in idx}
        for st, gj in all_gj.items():
            if st not in cells_with:
                base = nat_col.replace("_nat", "")
                print(f"  {st}: no raw {src_col} — copying state {base}")
                for i, feat in enumerate(gj["features"]):
                    all_nat[st][i][nat_col] = feat["properties"].get(base)

    # Write back
    print("\nWriting _nat columns to GeoJSONs...")
    for st, gj in all_gj.items():
        for i, feat in enumerate(gj["features"]):
            feat["properties"].update(all_nat[st][i])
        path = DATA_DIR / st / "grid_scores.geojson"
        with open(path, "w") as f:
            json.dump(gj, f, separators=(",", ":"))
        print(f"  {st}: wrote {len(gj['features'])} cells")

    print("\nDone. National normalization complete.")


if __name__ == "__main__":
    main()
