"""
18_risk_tiers.py — Precompute the public ZIP exposure tiers.

The public risk surface never runs a model at request time. This script fits the
model once, writes a tier and a short factor list for every ZCTA, and server.py
just looks the answer up.

Why tiers and not a probability: the model is not well enough calibrated to put a
percentage next to somebody's ZIP code. Even after the multi-source relabelling
(scripts/17_datacenter_labels.py) the 0.2-0.3 bin still reads 0.238 predicted
against 0.174 observed. What IS defensible is the OBSERVED share of ZCTAs in a tier
that host a facility, quoted against the lowest tier — the same statistic on both
sides of the comparison, so no calibration dependency at all.

Two tiers are written per ZCTA:
  exposure  — from `has_dc`, facilities that exist now (strong: 254x top vs bottom)
  pipeline  — from `has_dc_forward`, proposed/permitted only (weak: 21x, 259 positives)

Output goes to data/.risk/. The leading dot matters: server.py's catch-all static
route refuses any path with a dot-segment at any depth, so the per-ZCTA file cannot
be bulk-downloaded even though .json is an allowed static extension. Bulk export is
deliberately not offered — the top-tier list must not circulate stripped of caveats.

Usage:
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -u scripts/18_risk_tiers.py
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import beta

ROOT = Path(__file__).parent.parent
# dcmodel.py owns the feature-group definitions. Importing it rather than copying
# them keeps the served product and the notebooks from silently drifting apart.
sys.path.insert(0, str(ROOT / "notebooks"))
import dcmodel as D  # noqa: E402

OUT_DIR = ROOT / "data" / ".risk"
N_TIERS = 10
N_FACTORS = 3
TOP_K_FEATURES = 14


def indicator_labels():
    """nat_col -> human label, parsed out of merascope/data.js INDICATORS.

    Parsed rather than duplicated so the wording on the public page always matches
    the wording everywhere else in the product.
    """
    out = {}
    path = ROOT / "merascope" / "data.js"
    if not path.exists():
        return out
    txt = path.read_text()
    for blk in re.findall(r"\{[^{}]*nat_col[^{}]*\}", txt):
        lab = re.search(r"label:\s*'([^']+)'", blk)
        nat = re.search(r"nat_col:\s*'([^']+)'", blk)
        if lab and nat:
            out[nat.group(1)] = lab.group(1)
    return out


# Raw physical columns have no INDICATORS entry; name them here.
RAW_LABELS = {
    "tx_dist_m": "Distance to transmission",
    "substation_dist_m": "Distance to substation",
    "substation_voltage_kv": "Nearby substation voltage",
    "iso_queue_mw": "Grid interconnection queue",
    "slope_mean_deg": "Terrain slope",
    "flat_frac": "Flat buildable land",
    "area_km2": "ZIP land area",
    "ann_precip_mm": "Annual precipitation",
    "aquifer_depth_ft": "Depth to groundwater",
    "river_dist_m": "Distance to river",
    "seismic_pga_g": "Seismic hazard",
    "heatflow_mwm2": "Geothermal heat flow",
    "protected_frac": "Protected land cover",
    "ksat_mean_ums": "Soil permeability",
    "water_stress_raw": "Water stress",
    "tri_dist_m": "Distance to industrial release site",
    "superfund_dist_m": "Distance to Superfund site",
    "rcra_dist_m": "Distance to hazardous waste site",
    "fac_dist_m": "Distance to network facility",
    "naaqs_nonattainment": "Air quality nonattainment",
}


def fit_out_of_fold(df, label, cols, blocks):
    """Spatially-blocked out-of-fold predictions.

    Out-of-fold matters: assigning tiers from in-sample scores and then reporting
    the observed rate per tier would be circular — the tiers would be fit on the
    same rows whose outcomes they are then used to describe.
    """
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.model_selection import GroupKFold, cross_val_predict

    X = D.feature_matrix(df, cols).to_numpy()
    y = df[label].to_numpy()
    clf = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.06, max_leaf_nodes=15,
        l2_regularization=1.0, random_state=0,
    )
    return cross_val_predict(clf, X, y, cv=GroupKFold(n_splits=8), groups=blocks,
                             method="predict_proba")[:, 1], y


def tier_stats(df, label, tier_col):
    rows = []
    for t, g in df.groupby(tier_col):
        n, k = len(g), int(g[label].sum())
        rows.append({
            "tier": int(t), "n": n, "observed": k / n,
            "ci_lo": float(beta.ppf(.025, k + .5, n - k + .5)),
            "ci_hi": float(beta.ppf(.975, k + .5, n - k + .5)),
        })
    return rows


def compute_factors(df, label, cols, labels_map):
    """Per-ZCTA plain-language reasons, from extreme percentiles of the features
    that actually drive the model.

    Deliberately not SHAP: adding that dependency to buy exact local attribution
    is not worth it for a three-bullet explanation. The direction of each feature
    is taken from its own correlation with the outcome, so a factor only ever
    fires in the direction associated with MORE exposure.
    """
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.inspection import permutation_importance

    X = D.feature_matrix(df, cols)
    y = df[label].to_numpy()
    clf = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.06, max_leaf_nodes=15,
        l2_regularization=1.0, random_state=0,
    ).fit(X.to_numpy(), y)
    pi = permutation_importance(clf, X.to_numpy(), y, n_repeats=5, random_state=0,
                                scoring="average_precision", n_jobs=4)
    imp = pd.Series(pi.importances_mean, index=cols).sort_values(ascending=False)
    top = [c for c in imp.head(TOP_K_FEATURES).index]

    pct, sign, weight = {}, {}, {}
    for c in top:
        v = pd.to_numeric(df[c], errors="coerce")
        pct[c] = v.rank(pct=True).fillna(0.5).to_numpy()
        sign[c] = 1.0 if np.corrcoef(v.fillna(v.median()), y)[0, 1] >= 0 else -1.0
        weight[c] = max(float(imp[c]), 0.0)

    name = {c: labels_map.get(c) or RAW_LABELS.get(c) or c for c in top}
    out = []
    for i in range(len(df)):
        scored = []
        for c in top:
            # distance above (or below, for inverted features) the median
            strength = (pct[c][i] - 0.5) * sign[c]
            if strength > 0.20:
                scored.append((strength * weight[c], name[c]))
        scored.sort(reverse=True)
        seen, picks = set(), []
        for _, nm in scored:
            if nm not in seen:
                seen.add(nm)
                picks.append(nm)
            if len(picks) == N_FACTORS:
                break
        out.append(picks)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Loading feature table + multi-source labels...")
    df = D.load_model_table()
    cols = [c for c in D.URBAN + D.POWER + D.PHYSICAL if c in df.columns]
    blocks = D.spatial_blocks(df)
    labels_map = indicator_labels()
    print(f"  {len(df)} ZCTAs, {len(cols)} features, {len(labels_map)} indicator labels from data.js")

    stats, tiers = {}, {}
    for key, label in [("exposure", "has_dc"), ("pipeline", "has_dc_forward")]:
        print(f"\nFitting {key} ({label}, {int(df[label].sum())} positives)...")
        p, y = fit_out_of_fold(df, label, cols, blocks)
        col = f"tier_{key}"
        # rank before qcut: raw scores are heavily tied near zero, which makes
        # qcut collapse the low tiers into one bin.
        df[col] = pd.qcut(p.argsort().argsort(), N_TIERS, labels=False) + 1
        st = tier_stats(df, label, col)
        stats[key] = {
            "label": label, "n_positives": int(y.sum()),
            "base_rate": float(y.mean()), "tiers": st,
        }
        tiers[key] = df[col].to_numpy()
        print(f"  tier 1 {100*st[0]['observed']:.2f}%  ->  tier {N_TIERS} {100*st[-1]['observed']:.2f}%"
              f"   ({st[-1]['observed']/max(st[0]['observed'], 1e-9):.0f}x)")

    print("\nComputing per-ZCTA factors...")
    factors = compute_factors(df, "has_dc", cols, labels_map)

    recs = {}
    for i, z in enumerate(df["zcta"].astype(str).str.zfill(5)):
        recs[z] = {
            "e": int(tiers["exposure"][i]),
            "p": int(tiers["pipeline"][i]),
            "s": df["state"].iloc[i],
            "f": factors[i],
            "n": int(df["n_built"].iloc[i]) if "n_built" in df.columns else 0,
            "w": int(df["n_forward"].iloc[i]) if "n_forward" in df.columns else 0,
            "lat": round(float(df["lat"].iloc[i]), 4),
            "lon": round(float(df["lon"].iloc[i]), 4),
        }

    # National map layer, deliberately AGGREGATED. A per-ZCTA layer would ship the
    # whole ranking to the browser, which is the bulk export the product declines to
    # offer. 0.25 degrees (~28 km) is coarse enough not to be a per-ZIP list and fine
    # enough to show where exposure actually concentrates.
    gcell = 0.25
    gdf_grid = pd.DataFrame({
        "gx": np.floor(df["lon"] / gcell).astype(int),
        "gy": np.floor(df["lat"] / gcell).astype(int),
        "tier": tiers["exposure"],
        "built": df["n_built"] if "n_built" in df.columns else 0,
    })
    agg = gdf_grid.groupby(["gx", "gy"]).agg(
        mean_tier=("tier", "mean"), n=("tier", "size"), built=("built", "sum"),
    ).reset_index()
    grid = [
        [int(r.gx), int(r.gy), round(float(r.mean_tier), 2), int(r.n), int(r.built)]
        for r in agg.itertuples()
    ]
    (OUT_DIR / "grid.json").write_text(json.dumps(
        {"cell": gcell, "fields": ["gx", "gy", "mean_tier", "n_zctas", "n_built"],
         "cells": grid}, separators=(",", ":")))
    print(f"wrote {OUT_DIR/'grid.json'} ({len(grid)} aggregated cells at {gcell} deg)")

    (OUT_DIR / "zcta_tiers.json").write_text(json.dumps(recs, separators=(",", ":")))
    (OUT_DIR / "tier_stats.json").write_text(json.dumps({
        "n_tiers": N_TIERS, "n_zctas": len(df), "stats": stats,
        "sources": ["OpenStreetMap (ODbL)", "PeeringDB", "IM3 Atlas (ODbL)",
                    "Compute Atlas (CC BY 4.0, (c) 2026 Edward Kubiak)"],
    }, indent=1))
    print(f"\nwrote {OUT_DIR/'zcta_tiers.json'} ({len(recs)} ZCTAs)")
    print(f"wrote {OUT_DIR/'tier_stats.json'}")


if __name__ == "__main__":
    main()
