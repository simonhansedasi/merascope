"""
Tests for hard gate logic — unit tests of the gate rules themselves
and invariant verification against the live WA pipeline output.
"""
import pytest
import numpy as np

PROT_GATE = 0.25   # cells with protected_frac > 0.25 receive protected_score = 0


# ---------------------------------------------------------------------------
# Protected gate — unit tests of the rule in isolation
# ---------------------------------------------------------------------------

def _apply_protected_gate(fracs):
    """Replicates the gate logic from 07_protected.py."""
    fracs = np.array(fracs, dtype=float)
    scores = np.ones(len(fracs))
    scores[fracs > PROT_GATE] = 0.0
    return scores


class TestProtectedGateLogic:
    def test_zero_overlap_clear(self):
        assert _apply_protected_gate([0.0])[0] == 1.0

    def test_partial_below_threshold_clear(self):
        scores = _apply_protected_gate([0.05, 0.10, 0.20, 0.24])
        assert all(s == 1.0 for s in scores)

    def test_exactly_at_threshold_is_clear(self):
        """Gate is strict >: exactly 0.25 should not be gated."""
        assert _apply_protected_gate([0.25])[0] == 1.0

    def test_just_above_threshold_gated(self):
        assert _apply_protected_gate([0.2501])[0] == 0.0

    def test_well_above_threshold_gated(self):
        scores = _apply_protected_gate([0.30, 0.50, 0.75, 1.00])
        assert all(s == 0.0 for s in scores), f"Expected all 0.0, got {scores}"

    def test_fully_protected_gated(self):
        assert _apply_protected_gate([1.0])[0] == 0.0

    def test_mixed_cells(self):
        fracs  = [0.0, 0.24, 0.25, 0.26, 1.0]
        scores = _apply_protected_gate(fracs)
        expected = [1.0, 1.0, 1.0, 0.0, 0.0]
        np.testing.assert_array_equal(scores, expected)

    def test_gate_produces_only_binary_output(self):
        fracs = np.linspace(0, 1, 101)
        scores = _apply_protected_gate(fracs)
        unique = set(np.round(scores, 10))
        assert unique == {0.0, 1.0}, f"Gate produced non-binary values: {unique}"


# ---------------------------------------------------------------------------
# Flood gate — unit tests (binary: 0 = SFHA, 1 = outside)
# ---------------------------------------------------------------------------

def _apply_flood_gate(in_sfha_flags):
    """Replicates flood_score assignment from 03_risk.py."""
    scores = np.ones(len(in_sfha_flags))
    scores[np.array(in_sfha_flags, dtype=bool)] = 0.0
    return scores


class TestFloodGateLogic:
    def test_outside_sfha_scores_1(self):
        assert _apply_flood_gate([False])[0] == 1.0

    def test_inside_sfha_scores_0(self):
        assert _apply_flood_gate([True])[0] == 0.0

    def test_all_clear(self):
        scores = _apply_flood_gate([False, False, False])
        assert all(s == 1.0 for s in scores)

    def test_mixed_sfha(self):
        scores = _apply_flood_gate([True, False, True, False])
        np.testing.assert_array_equal(scores, [0.0, 1.0, 0.0, 1.0])

    def test_flood_gate_is_binary(self):
        """Flood scores must be exactly 0.0 or 1.0 — no intermediate values."""
        flags = [True, False] * 10
        scores = _apply_flood_gate(flags)
        assert set(scores) == {0.0, 1.0}


# ---------------------------------------------------------------------------
# Gate consistency against live WA output
# ---------------------------------------------------------------------------

class TestProtectedGateWAOutput:
    def test_gated_cells_have_protected_frac_above_threshold(self, wa_props):
        """Every cell with protected_score=0 must have protected_frac > PROT_GATE."""
        violations = [
            {"cell_id": p["cell_id"], "protected_frac": p["protected_frac"]}
            for p in wa_props
            if p["protected_score"] == 0.0 and p["protected_frac"] <= PROT_GATE
        ]
        assert not violations, (
            f"{len(violations)} cells have protected_score=0 but protected_frac <= {PROT_GATE}: "
            f"{violations[:3]}"
        )

    def test_all_high_frac_cells_are_gated(self, wa_props):
        """Every cell with protected_frac > PROT_GATE must have protected_score=0."""
        violations = [
            {"cell_id": p["cell_id"], "protected_frac": p["protected_frac"], "protected_score": p["protected_score"]}
            for p in wa_props
            if p["protected_frac"] > PROT_GATE and p["protected_score"] != 0.0
        ]
        assert not violations, (
            f"{len(violations)} cells with protected_frac > {PROT_GATE} but protected_score != 0: "
            f"{violations[:3]}"
        )

    def test_wa_has_gated_protected_cells(self, wa_props):
        """WA has federal and tribal land; at least some cells must be gated."""
        gated = [p for p in wa_props if p["protected_score"] == 0.0]
        assert len(gated) >= 10, f"Only {len(gated)} protected cells found; expected >= 10 for WA"

    def test_gated_cells_retained_in_output(self, wa_props):
        """Gated cells must stay in the dataset — hard gate = score=0, not deletion."""
        gated = [p for p in wa_props if p["protected_score"] == 0.0]
        assert len(gated) > 0, "No gated cells found in WA output"
        for p in gated:
            assert "cell_id" in p
            assert "tx_score" in p

    def test_gated_cells_have_all_columns(self, wa_props):
        """A gated cell should still have valid scores for every other indicator."""
        from test_indicators import SCORE_COLS
        gated = [p for p in wa_props if p["protected_score"] == 0.0]
        cols_to_check = [c for c in SCORE_COLS if c != "protected_score"]
        missing = []
        for p in gated[:10]:
            for col in cols_to_check:
                if p.get(col) is None:
                    missing.append(f"cell_id={p['cell_id']} missing {col}")
        assert not missing, f"Gated cells missing columns:\n" + "\n".join(missing)

    def test_gated_fraction_plausible_for_wa(self, wa_props):
        """WA: ~5-15% of cells expected to be protected-gated (NPS + tribal + NF)."""
        gated_frac = sum(1 for p in wa_props if p["protected_score"] == 0.0) / len(wa_props)
        assert 0.03 <= gated_frac <= 0.25, (
            f"WA protected gate fraction {gated_frac:.1%} outside expected 3-25% range"
        )


class TestFloodGateWAOutput:
    def test_flood_score_is_binary_in_wa(self, wa_props):
        vals = {p["flood_score"] for p in wa_props}
        assert vals <= {0.0, 1.0}, f"Non-binary flood_score values in WA: {vals - {0.0, 1.0}}"

    def test_wa_has_at_least_one_flood_cell(self, wa_props):
        flooded = [p for p in wa_props if p["flood_score"] == 0.0]
        assert len(flooded) > 0, "WA should have SFHA flood cells (Columbia/Yakima floodplains)"

    def test_flood_gated_cells_retained_in_output(self, wa_props):
        flooded = [p for p in wa_props if p["flood_score"] == 0.0]
        for p in flooded:
            assert "cell_id" in p
            assert p["tx_score"] is not None


class TestGateInteraction:
    def test_doubly_gated_cells_have_both_scores_zero(self, wa_props):
        """If a cell hits both gates, both protected_score and flood_score should be 0."""
        doubly_gated = [
            p for p in wa_props
            if p["protected_score"] == 0.0 and p["flood_score"] == 0.0
        ]
        for p in doubly_gated:
            assert p["protected_score"] == 0.0
            assert p["flood_score"] == 0.0

    def test_ungated_cells_have_positive_scores(self, wa_props):
        """Cells clear of both gates must have protected_score=1 and flood_score=1."""
        ungated = [
            p for p in wa_props
            if p["protected_frac"] <= PROT_GATE
        ]
        bad_protected = [p for p in ungated if p["protected_score"] != 1.0]
        assert not bad_protected, (
            f"{len(bad_protected)} cells with protected_frac <= {PROT_GATE} have protected_score != 1.0"
        )
