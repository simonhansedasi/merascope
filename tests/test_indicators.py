"""
Unit tests for core pipeline functions (create_fishnet, sample_prism, idw_k)
and a full schema/integrity smoke test against the WA GeoJSON output.
"""
import sys
import importlib.util
import pytest
import numpy as np
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))


def _load(script_name):
    path = ROOT / "scripts" / f"{script_name}.py"
    spec = importlib.util.spec_from_file_location(script_name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_ind = _load("02_indicators")
_risk = _load("03_risk")

create_fishnet = _ind.create_fishnet
sample_prism   = _ind.sample_prism
idw_k          = _risk.idw_k

PRISM_WEST  = _ind.PRISM_WEST
PRISM_NORTH = _ind.PRISM_NORTH
PRISM_PIXEL = _ind.PRISM_PIXEL

SCORE_COLS = [
    "tx_score", "water_score", "ej_score", "pop_exposure_score",
    "seismic_score", "flood_score", "contamination_score", "waterway_score",
    "geothermal_score", "flatness_score", "slope_score", "protected_score",
    "aquifer_score", "soil_score", "soil_profile_score", "ksat_score",
]
RAW_COLS = [
    "tx_dist_m", "ann_precip_mm", "pop_density", "seismic_pga_g",
    "tri_dist_m", "river_dist_m", "heatflow_mwm2", "protected_frac",
    "aquifer_depth_ft", "ksat_mean_ums",
]
NAT_COLS = [c + "_nat" for c in SCORE_COLS]


# ---------------------------------------------------------------------------
# Fishnet
# ---------------------------------------------------------------------------

def _state_gdf(west, south, east, north):
    import geopandas as gpd
    from shapely.geometry import box
    return gpd.GeoDataFrame({"geometry": [box(west, south, east, north)]}, crs="EPSG:4326")


class TestCreateFishnet:
    def test_all_centroids_within_boundary(self):
        state = _state_gdf(-122.0, 47.0, -121.0, 48.0)
        grid = create_fishnet(state, cell_size=0.15)
        assert len(grid) > 0
        state_union = state.geometry.unary_union
        outside = sum(1 for g in grid.geometry if not g.centroid.within(state_union))
        assert outside == 0, f"{outside} centroids outside state boundary"

    def test_cell_id_is_zero_indexed_sequential(self):
        state = _state_gdf(-122.0, 47.0, -121.0, 48.0)
        grid = create_fishnet(state, cell_size=0.15)
        assert list(grid["cell_id"]) == list(range(len(grid)))

    def test_cell_dimensions_exactly_0p15_degrees(self):
        state = _state_gdf(-120.0, 46.0, -118.0, 48.0)
        grid = create_fishnet(state, cell_size=0.15)
        for geom in grid.geometry[:20]:
            minx, miny, maxx, maxy = geom.bounds
            assert abs((maxx - minx) - 0.15) < 1e-9, f"Cell width {maxx - minx:.10f} != 0.15"
            assert abs((maxy - miny) - 0.15) < 1e-9, f"Cell height {maxy - miny:.10f} != 0.15"

    def test_no_duplicate_centroids(self):
        state = _state_gdf(-120.0, 46.0, -118.0, 48.0)
        grid = create_fishnet(state, cell_size=0.15)
        centroids = [(round(g.centroid.x, 8), round(g.centroid.y, 8)) for g in grid.geometry]
        assert len(centroids) == len(set(centroids)), "Duplicate cell centroids found"

    def test_all_geometries_are_valid_polygons(self):
        from shapely.geometry import Polygon
        state = _state_gdf(-120.0, 46.0, -118.0, 48.0)
        grid = create_fishnet(state, cell_size=0.15)
        invalid = [i for i, g in enumerate(grid.geometry) if not g.is_valid or not isinstance(g, Polygon)]
        assert not invalid, f"Invalid geometries at indices: {invalid[:10]}"

    def test_cell_count_scales_with_area(self):
        """A 2°×2° box should contain roughly 4× more cells than a 1°×1° box."""
        small = create_fishnet(_state_gdf(-120.0, 47.0, -119.0, 48.0), cell_size=0.15)
        large = create_fishnet(_state_gdf(-120.0, 47.0, -118.0, 49.0), cell_size=0.15)
        ratio = len(large) / max(len(small), 1)
        assert 3.0 <= ratio <= 5.0, f"Cell count ratio {ratio:.2f} unexpected for 4× area"


# ---------------------------------------------------------------------------
# PRISM sampling
# ---------------------------------------------------------------------------

class TestSamplePrism:
    def _arr(self, nrows=10, ncols=10, fill=500.0):
        return np.full((nrows, ncols), fill, dtype=np.float32)

    def test_origin_maps_to_arr_0_0(self):
        arr = self._arr(); arr[0, 0] = 999.0
        vals = sample_prism(arr, np.array([PRISM_WEST]), np.array([PRISM_NORTH]))
        assert vals[0] == 999.0

    def test_exact_pixel_offset(self):
        """Coordinate 3 pixels right and 2 pixels down should return arr[2, 3]."""
        arr = self._arr(); arr[2, 3] = 777.0
        lon = PRISM_WEST + 3 * PRISM_PIXEL
        lat = PRISM_NORTH - 2 * PRISM_PIXEL
        vals = sample_prism(arr, np.array([lon]), np.array([lat]))
        assert vals[0] == 777.0

    def test_fill_value_becomes_nan(self):
        arr = np.array([[-9999.0, 500.0]], dtype=np.float32)
        lons = np.array([PRISM_WEST, PRISM_WEST + PRISM_PIXEL])
        lats = np.array([PRISM_NORTH, PRISM_NORTH])
        vals = sample_prism(arr, lons, lats)
        assert np.isnan(vals[0]), "Fill value -9999 should become NaN"
        assert vals[1] == 500.0, "Valid pixel should not become NaN"

    def test_values_below_minus_9000_all_nan(self):
        arr = np.array([[-9001.0, -12000.0, -9999.0]], dtype=np.float32)
        lons = np.array([PRISM_WEST + i * PRISM_PIXEL for i in range(3)])
        lats = np.full(3, PRISM_NORTH)
        vals = sample_prism(arr, lons, lats)
        assert all(np.isnan(v) for v in vals), "All sub-9000 values should be NaN"

    def test_out_of_bounds_west_clips_to_col_0(self):
        arr = self._arr(fill=42.0)
        vals = sample_prism(arr, np.array([-200.0]), np.array([PRISM_NORTH]))
        assert vals[0] == 42.0

    def test_out_of_bounds_south_clips_to_last_row(self):
        arr = self._arr(nrows=5, fill=0.0); arr[4, 0] = 33.0
        vals = sample_prism(arr, np.array([PRISM_WEST]), np.array([0.0]))
        assert vals[0] == 33.0

    def test_vectorized_batch_correct(self):
        arr = self._arr(ncols=6)
        for i in range(6):
            arr[0, i] = float(i * 10)
        lons = np.array([PRISM_WEST + i * PRISM_PIXEL for i in range(6)])
        vals = sample_prism(arr, lons, np.full(6, PRISM_NORTH))
        np.testing.assert_array_equal(vals, [0., 10., 20., 30., 40., 50.])


# ---------------------------------------------------------------------------
# IDW
# ---------------------------------------------------------------------------

class TestIDW:
    def test_exact_coincidence_dominates(self):
        """Target at same location as one source: that source's value should dominate.
        Uses k=2 (realistic): coincident source gets dist=1e-6, remote gets dist=sqrt(2).
        Weight ratio ~1e12:0.5 → result within 1e-9 of coincident source value."""
        src = np.array([[0.0, 0.0], [1.0, 1.0]])
        result = idw_k(src, np.array([42.0, 99.0]), np.array([[0.0, 0.0]]), k=2)
        assert abs(result[0] - 42.0) < 1e-6, f"Coincident source should dominate; got {result[0]:.6f}"

    def test_equidistant_sources_average(self):
        """Two sources equidistant from target → unweighted average."""
        src = np.array([[-1.0, 0.0], [1.0, 0.0]])
        result = idw_k(src, np.array([0.0, 10.0]), np.array([[0.0, 0.0]]), k=2)
        assert abs(result[0] - 5.0) < 1e-6

    def test_closer_source_dominates(self):
        """Source at d=0.1 vs d=10 (power=2): weight ratio 10000:1, result ≈ val_close."""
        src = np.array([[0.1, 0.0], [10.0, 0.0]])
        result = idw_k(src, np.array([0.0, 1.0]), np.array([[0.0, 0.0]]), k=2, power=2)
        assert result[0] < 0.01, f"Near source (val=0) should dominate; got {result[0]:.6f}"

    def test_power_two_weights_verified(self):
        """d1=1, d2=2, power=2: w1=1/1=1, w2=1/4; normalized w1=0.8, w2=0.2."""
        src = np.array([[1.0, 0.0], [2.0, 0.0]])
        result = idw_k(src, np.array([0.0, 100.0]), np.array([[0.0, 0.0]]), k=2, power=2)
        expected = 0.0 * 0.8 + 100.0 * 0.2
        assert abs(result[0] - expected) < 1e-4, f"got {result[0]:.6f}, expected {expected:.6f}"

    def test_power_one_weights_verified(self):
        """d1=1, d2=2, power=1: w1=1, w2=0.5; normalized w1=2/3, w2=1/3."""
        src = np.array([[1.0, 0.0], [2.0, 0.0]])
        result = idw_k(src, np.array([0.0, 90.0]), np.array([[0.0, 0.0]]), k=2, power=1)
        expected = 0.0 * (2.0 / 3.0) + 90.0 * (1.0 / 3.0)
        assert abs(result[0] - expected) < 1e-4

    def test_k_capped_at_available_sources(self):
        """k=8 with only 3 sources should not raise; result should be in value range."""
        src = np.array([[1.0, 0.0], [2.0, 0.0], [3.0, 0.0]])
        result = idw_k(src, np.array([1.0, 2.0, 3.0]), np.array([[0.0, 0.0]]), k=8)
        assert result.shape == (1,)
        assert 1.0 <= result[0] <= 3.0

    def test_output_shape_matches_target_count(self):
        src = np.array([[0.0, 0.0], [5.0, 5.0]])
        tgt = np.random.default_rng(0).random((47, 2)) * 5
        result = idw_k(src, np.array([0.0, 1.0]), tgt, k=2)
        assert result.shape == (47,)

    def test_result_bounded_by_source_range(self):
        """IDW is a convex combination: output must be within [min_val, max_val]."""
        rng = np.random.default_rng(42)
        src = rng.random((20, 2)) * 100
        vals = rng.random(20) * 50
        tgt = rng.random((100, 2)) * 100
        result = idw_k(src, vals, tgt, k=8)
        assert result.min() >= vals.min() - 1e-9
        assert result.max() <= vals.max() + 1e-9


# ---------------------------------------------------------------------------
# WA GeoJSON smoke test — schema and value ranges
# ---------------------------------------------------------------------------

class TestWAGeoJSONSchema:
    def test_expected_score_columns_present(self, wa_props):
        missing = [c for c in SCORE_COLS if c not in wa_props[0]]
        assert not missing, f"Missing score columns: {missing}"

    def test_expected_raw_columns_present(self, wa_props):
        missing = [c for c in RAW_COLS if c not in wa_props[0]]
        assert not missing, f"Missing raw columns: {missing}"

    def test_national_norm_columns_present(self, wa_props):
        missing = [c for c in NAT_COLS if c not in wa_props[0]]
        assert not missing, f"Missing national norm columns: {missing}"

    def test_cell_id_sequential_from_zero(self, wa_props):
        ids = [p["cell_id"] for p in wa_props]
        assert ids == list(range(len(ids))), "cell_id is not sequential from 0"

    def test_no_null_score_values(self, wa_props):
        nulls = {c: sum(1 for p in wa_props if p[c] is None) for c in SCORE_COLS}
        bad = {c: n for c, n in nulls.items() if n > 0}
        assert not bad, f"Null values in score columns: {bad}"

    def test_all_scores_in_unit_interval(self, wa_props):
        violations = {}
        for col in SCORE_COLS:
            out = [p[col] for p in wa_props if not (0.0 <= p[col] <= 1.0)]
            if out:
                violations[col] = (min(out), max(out))
        assert not violations, f"Scores outside [0,1]: {violations}"

    def test_national_scores_in_unit_interval(self, wa_props):
        violations = {}
        for col in NAT_COLS:
            out = [p[col] for p in wa_props if p[col] is not None and not (0.0 <= p[col] <= 1.0)]
            if out:
                violations[col] = (min(out), max(out))
        assert not violations, f"National scores outside [0,1]: {violations}"

    def test_score_columns_not_all_identical(self, wa_props):
        """Each score column must have variation — a constant column signals a pipeline failure."""
        flat = [c for c in SCORE_COLS if len({p[c] for p in wa_props}) == 1]
        assert not flat, f"Score columns with no variation: {flat}"

    def test_wa_has_meaningful_cell_count(self, wa_props):
        # WA grid: expected ~900-1100 cells from known pipeline output
        assert 800 <= len(wa_props) <= 1200, f"Unexpected cell count: {len(wa_props)}"


class TestWARawColumns:
    def test_distances_positive(self, wa_props):
        for col in ("tx_dist_m", "tri_dist_m", "river_dist_m"):
            bad = [p[col] for p in wa_props if p[col] is not None and p[col] < 0]
            assert not bad, f"{col} has negative values: {bad[:5]}"

    def test_precip_positive_everywhere(self, wa_props):
        """WA is a wet state; no cell should have zero or negative annual precip."""
        bad = [p["ann_precip_mm"] for p in wa_props if p["ann_precip_mm"] is not None and p["ann_precip_mm"] <= 0]
        assert not bad, f"Non-positive ann_precip_mm values in WA: {bad[:5]}"

    def test_wa_precip_range_plausible(self, wa_props):
        """WA annual precip: Olympic Peninsula ~4000+ mm/yr, Eastern WA ~170 mm/yr."""
        vals = [p["ann_precip_mm"] for p in wa_props if p["ann_precip_mm"] is not None]
        assert min(vals) > 100, f"Suspiciously low WA precip: {min(vals):.1f} mm/yr"
        assert max(vals) > 2000, f"Suspiciously low WA max precip: {max(vals):.1f} mm/yr"

    def test_wa_seismic_pga_positive(self, wa_props):
        """WA is seismically active; every cell should have non-zero PGA."""
        bad = [p["seismic_pga_g"] for p in wa_props if p["seismic_pga_g"] is not None and p["seismic_pga_g"] <= 0]
        assert not bad, f"Non-positive seismic_pga_g in WA: {bad[:5]}"

    def test_protected_frac_in_0_1(self, wa_props):
        bad = [p["protected_frac"] for p in wa_props if not (0.0 <= p["protected_frac"] <= 1.0)]
        assert not bad, f"protected_frac outside [0,1]: {bad[:5]}"

    def test_aquifer_depth_positive(self, wa_props):
        bad = [p["aquifer_depth_ft"] for p in wa_props if p["aquifer_depth_ft"] is not None and p["aquifer_depth_ft"] <= 0]
        assert not bad, f"Non-positive aquifer_depth_ft: {bad[:5]}"

    def test_ksat_positive(self, wa_props):
        bad = [p["ksat_mean_ums"] for p in wa_props if p["ksat_mean_ums"] is not None and p["ksat_mean_ums"] <= 0]
        assert not bad, f"Non-positive ksat_mean_ums: {bad[:5]}"
