#!/usr/bin/env python3
"""
Site-portfolio optimization: given Merascope's real, already-computed ZCTA
suitability scores for a state, select the best K-site portfolio for
development subject to a real, literal water-stress budget -- not a single
best site, a *portfolio* under a shared regional constraint.

Read-only against the live data files (data/{STATE}/zcta/grid_scores.geojson)
-- never writes back, never touches the app database, never deploys. This is
an analysis script proving out a real MIP formulation against real production
data, not a new live product feature.

Formulation (0/1 knapsack with a cardinality cap):
    x_i in {0,1} for each ZCTA i
    maximize   sum(composite_i * x_i)
    subject to sum(x_i) <= K                          (portfolio size cap)
               sum(water_stress_raw_i * x_i) <= BUDGET (regional water-stress budget)

composite_i is a real subset of Merascope's own weighted-indicator scheme
(transmission=60, community/EJ burden=40, from the same *_score_nat columns
the live app uses -- see server.py's _REPORT_INDICATORS), deliberately
excluding water/water_stress from the objective. Including them in both the
objective and the budget constraint double-counts the same signal and
produces a non-binding constraint (verified: WA's top-15-by-composite under
the "Water Durability" weight preset were already all at water_stress_raw=0,
so the budget did nothing). Water enters this problem exactly once, as an
external constraint -- the actual regulatory question this models: sites
are attractive on grid-access/community grounds, but the region can only
absorb so much cumulative water stress across everything it permits.

water_stress_raw is the real WRI Aqueduct 3.0 bws_score (higher = more
stressed) -- a literal, physically-meaningful per-site cost, not a 0-1
suitability score repurposed as a cost.
"""
import json
import os
import sys

import pulp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Objective deliberately does NOT include water/water_stress -- if it did,
# an unconstrained optimum would already avoid water-stressed sites (the
# objective would be penalizing the same thing the budget constrains), which
# produced a non-binding, uninteresting result on the first run: WA's
# highest-composite-under-water_durability-weights sites were already all at
# water_stress_raw=0. The real, non-redundant regulatory question is:
# sites are attractive on grid access + community burden grounds; SEPARATELY,
# the region has a finite water-stress budget for how much it can permit.
# That's also the actual tension RESUME_CONTEXT.md already documents for WA's
# Quincy/East Wenatchee corridor -- strong grid access from hydro
# infrastructure, but water-constrained.
GRID_COMMUNITY_WEIGHTS = {
    "tx_score_nat": 60,
    "ej_score_nat": 40,
}


def load_zctas(state_code):
    path = os.path.join(ROOT, "data", state_code, "zcta", "grid_scores.geojson")
    with open(path) as f:
        data = json.load(f)
    return [feat["properties"] for feat in data["features"]]


def composite_score(props, weights=GRID_COMMUNITY_WEIGHTS):
    total_w = sum(weights.values())
    return sum((props.get(col) or 0) * w for col, w in weights.items()) / total_w


def solve_portfolio(zctas, k, budget):
    """Returns (status, selected_zctas, total_composite, total_water_cost)."""
    n = len(zctas)
    composites = [composite_score(z) for z in zctas]
    costs = [z["water_stress_raw"] for z in zctas]

    prob = pulp.LpProblem("site_portfolio", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x_{i}", cat="Binary") for i in range(n)]

    prob += pulp.lpSum(composites[i] * x[i] for i in range(n))
    prob += pulp.lpSum(x) <= k
    prob += pulp.lpSum(costs[i] * x[i] for i in range(n)) <= budget

    prob.solve(pulp.PULP_CBC_CMD(msg=False))

    selected = [i for i in range(n) if x[i].value() == 1]
    total_composite = sum(composites[i] for i in selected)
    total_cost = sum(costs[i] for i in selected)
    return pulp.LpStatus[prob.status], selected, total_composite, total_cost


def self_check():
    """Ponytail-required check for the optimization logic: verify the MIP
    result against a brute-force search over a small toy instance, rather
    than a hand-guessed expected answer -- a hand-guess is exactly what got
    this wrong on the first pass (missed that a 3rd site legitimately fit
    the budget and raised the total)."""
    import itertools

    toy = [
        {"zcta": "A", "water_score_nat": 1.0, "water_stress_score_nat": 1.0,
         "tx_score_nat": 1.0, "ej_score_nat": 1.0, "water_stress_raw": 1.0},
        {"zcta": "B", "water_score_nat": 0.9, "water_stress_score_nat": 0.9,
         "tx_score_nat": 0.9, "ej_score_nat": 0.9, "water_stress_raw": 1.0},
        {"zcta": "C", "water_score_nat": 0.1, "water_stress_score_nat": 0.1,
         "tx_score_nat": 0.1, "ej_score_nat": 0.1, "water_stress_raw": 5.0},
        {"zcta": "D", "water_score_nat": 0.05, "water_stress_score_nat": 0.05,
         "tx_score_nat": 0.05, "ej_score_nat": 0.05, "water_stress_raw": 0.5},
    ]
    k, budget = 3, 2.5

    best_brute = -1
    for r in range(len(toy) + 1):
        for combo in itertools.combinations(range(len(toy)), r):
            if len(combo) > k:
                continue
            cost = sum(toy[i]["water_stress_raw"] for i in combo)
            if cost > budget:
                continue
            val = sum(composite_score(toy[i]) for i in combo)
            best_brute = max(best_brute, val)

    status, selected, total_c, total_cost = solve_portfolio(toy, k=k, budget=budget)
    assert status == "Optimal", f"solver did not reach optimality: {status}"
    assert total_cost <= budget + 1e-9, f"budget constraint violated: {total_cost}"
    assert len(selected) <= k, f"cardinality constraint violated: {len(selected)}"
    assert abs(total_c - best_brute) < 1e-6, (
        f"MIP result {total_c:.6f} does not match brute-force optimum {best_brute:.6f}")
    picked = sorted(toy[i]["zcta"] for i in selected)
    print(f"self-check passed: toy 4-site instance -> picked {picked}, "
          f"cost {total_cost:.2f}/{budget}, composite {total_c:.4f} "
          f"(matches brute-force optimum {best_brute:.4f})")


if __name__ == "__main__":
    self_check()

    state = sys.argv[1] if len(sys.argv) > 1 else "WA"
    print(f"\nLoading real {state} ZCTA data...")
    zctas = load_zctas(state)
    print(f"{len(zctas)} ZCTAs loaded from data/{state}/zcta/grid_scores.geojson")

    K = 15
    ranked = sorted(zctas, key=composite_score, reverse=True)[:K]
    unconstrained_cost = sum(z["water_stress_raw"] for z in ranked)
    unconstrained_composite = sum(composite_score(z) for z in ranked)
    print(f"\nUnconstrained top {K} by grid+community score alone: "
          f"total composite {unconstrained_composite:.3f}, "
          f"total water-stress cost {unconstrained_cost:.3f}")

    # Efficient frontier: sweep the budget from very tight to unconstrained,
    # rather than picking one arbitrary budget -- a single loose budget (first
    # attempt: 50%) barely bound at all, because so many top-composite WA
    # sites already sit at zero water stress. Sweeping shows where the real
    # tradeoff actually bites instead of asserting one might exist.
    print(f"\nEfficient frontier (budget as % of unconstrained cost "
          f"{unconstrained_cost:.3f}):")
    print(f"{'budget %':>9}  {'budget':>8}  {'composite':>10}  "
          f"{'vs unconstrained':>17}  {'water cost used':>16}")
    for pct in [0, 5, 10, 25, 50, 100]:
        budget = unconstrained_cost * pct / 100
        status, selected, total_composite, total_cost = solve_portfolio(zctas, K, budget)
        gap = unconstrained_composite - total_composite
        gap_pct = gap / unconstrained_composite if unconstrained_composite else 0
        print(f"{pct:>8}%  {budget:>8.3f}  {total_composite:>10.3f}  "
              f"{-gap_pct:>16.1%}  {total_cost:>16.3f}")

    print("\nSelected portfolio (ZCTA, composite, water_stress_raw):")
    for i in sorted(selected, key=lambda i: composite_score(zctas[i]), reverse=True):
        z = zctas[i]
        print(f"  {z['zcta']}  composite={composite_score(z):.3f}  "
              f"water_stress_raw={z['water_stress_raw']:.3f}")
