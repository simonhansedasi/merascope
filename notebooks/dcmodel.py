"""
dcmodel.py — Shared helpers for the "which ZCTAs get targeted for data centers"
model. Notebooks 01-03 are thin drivers over these functions.

Feature source: the live product's per-state ZCTA scores
(data/{STATE}/zcta/grid_scores.geojson), cached locally under notebooks/cache/zcta/.
Label source: OSM man_made=data_centre / telecom=data_center, re-queried WITH
geometry (scripts/01_basemap.py uses `out center` and discards footprint area,
which is the only thing separating a hyperscale campus from a one-rack colo
suite in a downtown office tower).
"""

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

HERE = Path(__file__).parent
CACHE = HERE / "cache"
ZCTA_DIR = CACHE / "zcta"

STATES = [
    "WA","OR","TX","CA","NV","UT","ID","MT","AZ","CO","WY","NM","ND","SD","NE","KS","OK",
    "MN","IA","MO","AR","LA","MI","WI","IL","IN","KY","TN","MS","GA","OH",
    "AL","FL","SC","NC","VA","WV","PA","NY","NJ","CT","RI","MA","VT","NH","ME","DE","MD",
]

# The 23 national-normalized indicator columns — the product's own feature set.
NAT_COLS = [
    "tx_score_nat", "water_score_nat", "ej_score_nat", "pop_exposure_score_nat",
    "seismic_score_nat", "flood_score_nat", "contamination_score_nat",
    "waterway_score_nat", "geothermal_score_nat", "flatness_score_nat",
    "slope_score_nat", "protected_score_nat", "aquifer_score_nat", "soil_score_nat",
    "soil_profile_score_nat", "ksat_score_nat", "substation_score_nat",
    "superfund_score_nat", "rcra_score_nat", "air_quality_score_nat",
    "fiber_score_nat", "water_stress_score_nat", "grid_capacity_score_nat",
]

# Raw physical columns — unit-ful, not state-relative, so they carry information
# the *_nat columns lose to per-state percentile stretching.
RAW_COLS = [
    "tx_dist_m", "ann_precip_mm", "seismic_pga_g", "aquifer_depth_ft", "tri_dist_m",
    "river_dist_m", "heatflow_mwm2", "flat_frac", "slope_mean_deg", "protected_frac",
    "ksat_mean_ums", "substation_dist_m", "substation_voltage_kv", "superfund_dist_m",
    "rcra_dist_m", "naaqs_nonattainment", "fac_dist_m", "water_stress_raw", "iso_queue_mw",
]

EQUAL_AREA = "EPSG:5070"  # CONUS Albers — for honest areas and distances


def state_boundaries(verbose=True):
    """Census TIGER state polygons, cached under notebooks/cache/.

    Same source as scripts/01_basemap.py. Needed because the per-state ZCTA files
    cannot resolve their own overlaps — see load_zctas.
    """
    import io
    import zipfile

    import requests

    path = CACHE / "tiger_states.geojson"
    if path.exists():
        return gpd.read_file(path)
    if verbose:
        print("  Downloading Census TIGER state boundaries...")
    url = "https://www2.census.gov/geo/tiger/TIGER2022/STATE/tl_2022_us_state.zip"
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        z.extractall(CACHE / "_tiger_states")
    g = gpd.read_file(CACHE / "_tiger_states" / "tl_2022_us_state.shp")
    g = g[["STUSPS", "geometry"]].rename(columns={"STUSPS": "state"}).to_crs("EPSG:4326")
    g.to_file(path, driver="GeoJSON")
    return g


def _resolve_duplicate_states(gdf, verbose=True):
    """Keep one row per ZCTA: the copy from the state it mostly lies in.

    Only the duplicated ZCTAs are overlaid against the state polygons — roughly a
    tenth of the table — so the unique majority costs nothing.
    """
    dup_mask = gdf.duplicated("zcta", keep=False)
    if not dup_mask.any():
        return gdf
    dups = gdf.loc[dup_mask, ["zcta", "state", "geometry"]].copy()

    bounds = state_boundaries(verbose=verbose)
    bounds = bounds[bounds["state"].isin(gdf["state"].unique())]

    # One geometry per duplicated ZCTA (they are identical across copies), cut
    # against each candidate state; the largest piece wins.
    uniq = dups.drop_duplicates("zcta")[["zcta", "geometry"]]
    inter = gpd.overlay(
        gpd.GeoDataFrame(uniq, geometry="geometry", crs=gdf.crs),
        bounds, how="intersection", keep_geom_type=False,
    )
    inter["overlap"] = inter.to_crs(EQUAL_AREA).geometry.area
    winner = (inter.sort_values("overlap", ascending=False)
                   .drop_duplicates("zcta", keep="first")
                   .set_index("zcta")["state"])

    keep = gdf["zcta"].map(winner)
    # A ZCTA whose overlay found nothing (offshore slivers, geometry errors) has
    # no winner; fall back to its first listed copy rather than dropping the row.
    fallback = ~gdf["zcta"].isin(winner.index)
    take = (~dup_mask) | (gdf["state"] == keep) | fallback
    out = gdf[take].drop_duplicates("zcta", keep="first")
    if verbose:
        moved = int((winner.values != gdf.loc[dup_mask].drop_duplicates("zcta")
                     .set_index("zcta").loc[winner.index, "state"].values).sum())
        print(f"  {len(winner)} duplicated ZCTAs resolved by state overlap "
              f"({moved} changed state vs the old first-listed rule)")
    return out


def load_zctas(states=None, verbose=True):
    """Load every state's ZCTA scores into one national GeoDataFrame.

    ZCTAs straddling a state line appear in BOTH states' files (build_zcta.py
    joins with `intersects`, not `within`), with different score values because
    normalization is state-relative.

    Deduplication is by TRUE overlap with the state boundary: each duplicate is
    assigned to the state containing the largest share of its area, and that
    state's copy of the scores is the one kept.

    This used to sort on the ZCTA's own area and keep the first row, on the theory
    that the per-state files held state-clipped geometry so the bigger copy meant
    "mostly in this state". They do not — the geometry is the FULL ZCTA polygon,
    byte-identical in every file that contains it. Measured 2026-08-24: all 3,365
    duplicated ZCTAs had identical area in every copy, so the sort was a tie
    throughout and pandas' stable ordering handed each one to whichever state came
    first in STATES. That is why 73717 and 74056 (both Oklahoma) came out labelled
    KS, and 84313 (Utah) came out NV.

    The cost was not only the label. 18 of the 23 `_nat` columns differ between two
    copies of the same ZCTA — tx_score_nat by up to 0.968 on a 0-1 scale — so the
    arbitrary pick also chose arbitrary FEATURE VALUES for about 10% of the rows.
    """
    states = states or STATES
    frames = []
    for st in states:
        path = ZCTA_DIR / f"{st}.geojson"
        if not path.exists():
            if verbose:
                print(f"  {st}: MISSING {path.name}")
            continue
        g = gpd.read_file(path)
        g["state"] = st
        frames.append(g)
    gdf = pd.concat(frames, ignore_index=True)
    gdf = gpd.GeoDataFrame(gdf, geometry="geometry", crs="EPSG:4326")
    gdf["zcta"] = gdf["zcta"].astype(str).str.zfill(5)

    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    proj = gdf.to_crs(EQUAL_AREA)
    gdf["area_km2"] = proj.geometry.area / 1e6

    before = len(gdf)
    gdf = _resolve_duplicate_states(gdf, verbose=verbose)
    gdf = gdf.reset_index(drop=True)
    if verbose:
        print(f"  {before} rows -> {len(gdf)} unique ZCTAs "
              f"({before - len(gdf)} cross-state duplicates resolved by overlap)")

    cent = gdf.to_crs(EQUAL_AREA).geometry.representative_point()
    gdf["x_m"], gdf["y_m"] = cent.x.values, cent.y.values
    ll = gpd.GeoSeries(cent, crs=EQUAL_AREA).to_crs(4326)
    gdf["lon"], gdf["lat"] = ll.x.values, ll.y.values
    return gdf


def load_datacenters():
    """OSM data centers with footprint area (m^2). Nodes have no area (NaN)."""
    dc = gpd.read_file(CACHE / "osm_datacenters.geojson")
    dc["area_m2"] = pd.to_numeric(dc["area_m2"], errors="coerce")
    return dc


def attach_labels(gdf, dc, thresholds=(1e4, 1e5)):
    """Spatial-join data centers onto ZCTAs and build the label variants.

    Returns gdf with: dc_count, dc_area_sum, dc_area_max, and one binary
    `has_dc*` column per threshold plus the unfiltered `has_dc_any`.
    """
    pts = dc.copy()
    pts["geometry"] = pts.geometry.representative_point()
    pts = pts.set_geometry("geometry")

    j = gpd.sjoin(pts[["area_m2", "geometry"]], gdf[["zcta", "geometry"]],
                  how="inner", predicate="within")

    agg = j.groupby("zcta").agg(
        dc_count=("area_m2", "size"),
        dc_area_sum=("area_m2", "sum"),
        dc_area_max=("area_m2", "max"),
    )
    out = gdf.merge(agg, on="zcta", how="left")
    out["dc_count"] = out["dc_count"].fillna(0).astype(int)
    out["dc_area_sum"] = out["dc_area_sum"].fillna(0.0)
    out["dc_area_max"] = out["dc_area_max"].fillna(0.0)
    out["has_dc_any"] = (out["dc_count"] > 0).astype(int)

    for t in thresholds:
        big = j[j["area_m2"] >= t].groupby("zcta").size().rename("n")
        col = f"has_dc_{int(t):d}"
        out[col] = out["zcta"].map(big).fillna(0).gt(0).astype(int)

    matched = len(j)
    print(f"  {matched}/{len(pts)} data centers fell inside a ZCTA "
          f"({len(pts) - matched} outside — offshore/AK/HI/geometry gaps)")
    return out


def feature_matrix(df, cols):
    """Numeric feature frame with NaNs left intact (HistGradientBoosting handles them)."""
    X = df[cols].apply(pd.to_numeric, errors="coerce")
    return X


# ── Feature groups ────────────────────────────────────────────────────────────
# Split deliberately so a nested comparison can answer the only question that
# matters: do the PHYSICAL siting indicators explain anything that plain
# urbanization does not?

# Proxies for "this ZCTA is urban / industrial". Every one of these is high
# wherever people and factories are, independent of data-center suitability.
URBAN = [
    "pop_exposure_score_nat", "ej_score_nat", "contamination_score_nat",
    "rcra_score_nat", "superfund_score_nat", "air_quality_score_nat", "area_km2",
]

# PeeringDB colocation facilities overlap the OSM data centers we label with:
# 20.6% of OSM data centers sit within 100 m of one (same building), 43% within 1 km.
# So fiber_score/fac_dist_m is PARTLY the label measured a second way. Measured
# against the full label it triples lift (4.88x -> 14.97x); measured against only
# non-colocated data centers it still adds a real +33% (5.63x -> 7.48x). It is
# neither clean nor worthless — quarantined here so it is always reported separately.
COLO = ["fiber_score_nat", "fac_dist_m"]
LEAKY = COLO  # backwards-compatible alias

# Grid access — genuinely causal for data centers, but also urban-correlated.
POWER = ["tx_score_nat", "substation_score_nat", "grid_capacity_score_nat",
         "tx_dist_m", "substation_dist_m", "substation_voltage_kv", "iso_queue_mw"]

# The physical-suitability core: what Merascope is actually built to score.
PHYSICAL = [
    "water_score_nat", "seismic_score_nat", "flood_score_nat", "waterway_score_nat",
    "geothermal_score_nat", "flatness_score_nat", "slope_score_nat",
    "protected_score_nat", "aquifer_score_nat", "soil_score_nat",
    "soil_profile_score_nat", "ksat_score_nat", "water_stress_score_nat",
    "ann_precip_mm", "seismic_pga_g", "aquifer_depth_ft", "river_dist_m",
    "heatflow_mwm2", "flat_frac", "slope_mean_deg", "protected_frac",
    "ksat_mean_ums", "water_stress_raw",
]


def spatial_blocks(df, n_blocks=25, seed=0):
    """Contiguous spatial folds via KMeans on projected centroids.

    A random split leaks badly here: data centers cluster (Ashburn, Santa Clara,
    New Albany), so a neighbouring ZCTA of a training positive lands in test and
    the model looks far better than it is.
    """
    from sklearn.cluster import KMeans
    xy = df[["x_m", "y_m"]].to_numpy()
    return KMeans(n_clusters=n_blocks, n_init=10, random_state=seed).fit_predict(xy)


def eval_groups(df, label, groups, n_blocks=25, seed=0):
    """Spatially-blocked CV average precision for each named feature group."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.model_selection import GroupKFold, cross_val_predict
    from sklearn.metrics import average_precision_score, roc_auc_score

    y = df[label].to_numpy()
    blocks = spatial_blocks(df, n_blocks=n_blocks, seed=seed)
    cv = GroupKFold(n_splits=8)
    base = y.mean()

    out = []
    for name, cols in groups.items():
        cols = [c for c in cols if c in df.columns]
        X = feature_matrix(df, cols).to_numpy()
        clf = HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.06, max_leaf_nodes=15,
            l2_regularization=1.0, random_state=seed,
        )
        p = cross_val_predict(clf, X, y, cv=cv, groups=blocks, method="predict_proba")[:, 1]
        out.append({
            "group": name, "n_feat": len(cols),
            "AP": average_precision_score(y, p),
            "lift": average_precision_score(y, p) / base,
            "ROC_AUC": roc_auc_score(y, p),
        })
    return pd.DataFrame(out), base


def attach_colocation(df, geom, dc, fac_csv=None, min_dist_m=1000):
    """Add `has_dc_noncolo`: a data center at least `min_dist_m` from any PeeringDB
    facility. Evaluating against this label is what makes fiber_score honest —
    it strips the positives where the "feature" and the label are the same building.
    """
    from scipy.spatial import cKDTree
    fac = pd.read_csv(fac_csv or (CACHE / "peeringdb_fac.csv"))
    fg = gpd.GeoDataFrame(fac, geometry=gpd.points_from_xy(fac.longitude, fac.latitude),
                          crs=4326).to_crs(EQUAL_AREA)
    d = dc.to_crs(EQUAL_AREA)
    pts = d.geometry.representative_point()
    dist, _ = cKDTree(np.c_[fg.geometry.x, fg.geometry.y]).query(np.c_[pts.x, pts.y])

    far = d[dist >= min_dist_m].copy()
    far["geometry"] = far.geometry.representative_point()
    j = gpd.sjoin(far.to_crs(4326)[["geometry"]], geom[["zcta", "geometry"]],
                  how="inner", predicate="within")
    hit = set(j["zcta"].astype(str).str.zfill(5))
    df = df.copy()
    df["has_dc_noncolo"] = df["zcta"].isin(hit).astype(int)
    return df, dist


# ── Multi-source labels (scripts/17_datacenter_labels.py) ─────────────────────
# The OSM-only label (`has_dc_any`) left the model badly overconfident at the top
# of its score range. These are the replacements, built from OSM + PeeringDB +
# IM3 Atlas + Compute Atlas.
#
#   has_dc          any built facility (operational / under construction)
#   has_dc_multi    built AND asserted by >= 2 independent sources
#   has_dc_forward  proposed or permitted — the genuinely forward-looking label
LABELS = ["has_dc", "has_dc_multi", "has_dc_forward"]
LABEL_COLS = LABELS + ["n_built", "n_forward", "max_sources", "capacity_mw", "max_area_m2"]


def load_model_table(with_labels=True):
    """Feature table joined to the multi-source labels.

    Falls back to the OSM-only table if the label build has not been run yet.
    """
    df = pd.read_csv(CACHE / "model_table.csv", dtype={"zcta": str})
    lab_path = HERE.parent / "data" / "datacenters" / "zcta_labels.csv"
    if not with_labels or not lab_path.exists():
        print("  multi-source labels not found — OSM-only `has_dc_any` still available")
        return df
    lab = pd.read_csv(lab_path, dtype={"zcta": str})
    lab["zcta"] = lab["zcta"].str.zfill(5)
    df = df.merge(lab, on="zcta", how="left")
    for c in LABELS + ["n_built", "n_forward", "max_sources"]:
        if c in df.columns:
            df[c] = df[c].fillna(0).astype(int)
    return df


def tier_table(df, label, p_col="p", n_tiers=10):
    """Deciles of the out-of-fold score with the OBSERVED rate per tier.

    This is what the public product shows. Reporting the observed share of ZCTAs
    in a tier that host a facility — rather than the model's own probability —
    is the same statistic on both sides, so it sidesteps calibration entirely.
    """
    from scipy.stats import beta
    d = df.copy()
    d["tier"] = pd.qcut(d[p_col].argsort().argsort(), n_tiers, labels=False) + 1
    rows = []
    for t, g in d.groupby("tier"):
        n, k = len(g), int(g[label].sum())
        rows.append({
            "tier": t, "n": n, "observed": k / n,
            "ci_lo": beta.ppf(.025, k + .5, n - k + .5),
            "ci_hi": beta.ppf(.975, k + .5, n - k + .5),
            "ej_mean": g["ej_score_nat"].mean(),
        })
    return pd.DataFrame(rows)
