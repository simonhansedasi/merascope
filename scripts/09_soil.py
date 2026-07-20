"""
09_soil.py — Compute soil permeability score from USDA SSURGO hydrologic soil group.

Adds to grid_scores.geojson:
  soil_score — 0-1 (high = low permeability = low spill percolation risk to groundwater)

Method:
  - Per grid cell centroid, exact point-in-polygon mukey lookup via SDA's
    SDA_Get_Mukey_from_intersection_with_WktWgs84() spatial function (one call per
    cell, cached + resumable in soil_cell_mukeys.csv; downloading full SSURGO polygon
    boundaries isn't viable — a single state can have 500K+ polygon instances)
  - Batch-fetches hydgrpdcd for the resulting mukeys via muaggatt
  - Maps hydrologic group to numeric score:
      A → 0.00  (high permeability, highest contamination risk)
      B → 0.33
      C → 0.67
      D → 1.00  (low permeability, lowest contamination risk)
      A/D, B/D, C/D → split-class midpoints
  - Cells with no resolvable mukey (e.g. water) or unmapped hydgrpdcd → neutral 0.5

Previously used IDW from one representative point per mukey, which blended scores
across real soil-class boundaries (same class of bug fixed in water_score via
patch_water_score.py) — this replaces that with an exact per-cell class lookup.

Rationale: high-permeability soils (Group A) allow surface spills to reach groundwater
quickly; low-permeability soils (Group D) reduce that pathway.

Usage:
  python 09_soil.py WA
"""

import argparse
import sys
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

warnings.filterwarnings("ignore")
CRS    = "EPSG:4326"
DARK_BG = "#1a1a2e"
WHITE  = "white"

SDM_URL    = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/SDMTabularService/post.rest"
SDM_HDR    = {"Content-Type": "application/json"}
BATCH      = 100     # mukeys per hydgrpdcd batch call
SDA_WORKERS = 8       # concurrent point-in-polygon lookups (~0.5s/call; be polite to a gov API)

# Hydrologic group → soil_score (high = low permeability = low contamination risk)
HYDGRP_SCORE = {
    "A":   0.00,
    "B":   0.33,
    "C":   0.67,
    "D":   1.00,
    "A/D": 0.50,
    "B/D": 0.67,
    "C/D": 0.83,
}


# ── SDM helpers ────────────────────────────────────────────────────────────────

def sdm_query(q, timeout=120, retries=4):
    for attempt in range(retries):
        try:
            r = requests.post(SDM_URL, headers=SDM_HDR, json={"query": q, "FORMAT": "JSON"}, timeout=timeout)
            r.raise_for_status()
            if not r.text.strip():
                raise ValueError("Empty response from SDM")
            return r.json().get("Table", [])
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  SDM attempt {attempt+1} failed ({e}); retrying in {wait}s")
                time.sleep(wait)
            else:
                raise


def cell_key(lon, lat):
    return f"{lon:.6f},{lat:.6f}"


def sda_mukey_at_point(lon, lat, retries=3, timeout=30):
    """Exact point-in-polygon mukey lookup via SDA's canned spatial function."""
    q = f"SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point({lon} {lat})')"
    for attempt in range(retries):
        try:
            r = requests.post(SDM_URL, headers=SDM_HDR, json={"query": q, "FORMAT": "JSON"}, timeout=timeout)
            r.raise_for_status()
            rows = r.json().get("Table") or []
            return rows[0][0] if rows else None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"    point ({lon:.4f},{lat:.4f}) failed after {retries} tries: {e}")
                return None


def fetch_cell_mukeys(lons, lats, cache_path, workers=SDA_WORKERS):
    """Per-cell point-in-polygon mukey lookup, cached + resumable by rounded lon/lat."""
    keys = [cell_key(lon, lat) for lon, lat in zip(lons, lats)]

    cached = {}
    if cache_path.exists():
        df = pd.read_csv(cache_path, dtype={"mukey": str})
        cached = dict(zip(df["key"], df["mukey"]))
        print(f"  Loaded {len(cached)} cell->mukey pairs from cache")

    todo = [(i, lon, lat) for i, (lon, lat) in enumerate(zip(lons, lats)) if keys[i] not in cached]
    print(f"  {len(todo)} of {len(keys)} cells need point-in-polygon lookup...")

    def save():
        pd.DataFrame({"key": list(cached.keys()), "mukey": list(cached.values())}).to_csv(cache_path, index=False)

    if todo:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futures = {ex.submit(sda_mukey_at_point, lon, lat): keys[i] for i, lon, lat in todo}
            done = 0
            for fut in as_completed(futures):
                cached[futures[fut]] = fut.result()
                done += 1
                if done % 50 == 0:
                    print(f"    {done}/{len(todo)} resolved", end="\r")
                    save()
        print()
        save()

    return np.array([cached.get(k) for k in keys])


def fetch_hydgrp(mukeys, cache_path):
    """Batch-fetch hydgrpdcd for a set of mukeys."""
    if cache_path.exists():
        df = pd.read_csv(cache_path, dtype={"mukey": str})
        print(f"  Loaded {len(df)} mukey->hydgrp pairs from cache")
        return df

    mukeys = sorted(set(mukeys))
    n_batches = (len(mukeys) + BATCH - 1) // BATCH
    print(f"  Fetching hydgrpdcd for {len(mukeys)} mukeys in {n_batches} batches...")
    rows = []
    for i in range(n_batches):
        batch = mukeys[i*BATCH:(i+1)*BATCH]
        ids_str = ",".join(batch)
        q = f"SELECT mukey, hydgrpdcd FROM muaggatt WHERE mukey IN ({ids_str})"
        try:
            rows.extend(sdm_query(q, timeout=60))
        except Exception as e:
            print(f"\n    batch {i+1}/{n_batches} failed: {e}")
        time.sleep(0.05)

    df = pd.DataFrame(rows, columns=["mukey", "hydgrpdcd"])
    df.to_csv(cache_path, index=False)
    print(f"  Cached to {cache_path.name}")
    return df


# ── Plot ───────────────────────────────────────────────────────────────────────

def plot_soil(cfg, state, grid, processed):
    fig, ax = plt.subplots(figsize=(12, 10), facecolor=DARK_BG)
    ax.set_facecolor(DARK_BG)
    state.to_crs(cfg["utm_epsg"]).boundary.plot(ax=ax, color="#4a4a6a", linewidth=1.0)
    grid.to_crs(cfg["utm_epsg"]).plot(
        column="soil_score", ax=ax, cmap="RdYlGn",
        vmin=0, vmax=1, legend=True,
        legend_kwds={"shrink": 0.65, "label": "0=Group A (high perm) / 1=Group D (low perm)"},
        alpha=0.85,
    )
    ax.set_title(
        f"{cfg['name']}: Soil Permeability Score (SSURGO Hydrologic Group)\n"
        "(High = low-permeability soil = low surface-spill infiltration risk)",
        color=WHITE, fontsize=16, pad=10,
    )
    ax.tick_params(left=False, bottom=False, labelleft=False, labelbottom=False)
    out = processed / "soil_permeability.png"
    plt.tight_layout()
    plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close()
    print(f"  Saved {out.name}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    cache_cell_mukeys = raw / "soil_cell_mukeys.csv"
    cache_hydgrp = raw / "soil_mukeys.csv"
    print(f"\n=== 09_soil: {cfg['name']} ({cfg['abbr']}) ===")

    grid  = gpd.read_file(grid_path)
    state = gpd.read_file(raw / "state.geojson")
    print(f"Grid: {len(grid)} cells")

    centroids = grid.geometry.centroid
    lons, lats = centroids.x.values, centroids.y.values

    # Step 1: exact mukey per grid cell (point-in-polygon)
    print("  Point-in-polygon mukey lookup...")
    cell_mukeys = fetch_cell_mukeys(lons, lats, cache_cell_mukeys)
    found = pd.notna(cell_mukeys)
    print(f"  {found.sum()}/{len(cell_mukeys)} cells resolved to a mukey")

    # Step 2: hydgrpdcd for those mukeys
    df_hydgrp = fetch_hydgrp(cell_mukeys[found].tolist(), cache_hydgrp)
    hydgrp_by_mukey = dict(zip(df_hydgrp["mukey"], df_hydgrp["hydgrpdcd"]))

    hydgrps = [hydgrp_by_mukey.get(m) if pd.notna(m) else None for m in cell_mukeys]
    print(f"  Hydgrpdcd distribution:\n{pd.Series(hydgrps).dropna().value_counts().to_string()}")

    scores = pd.Series(hydgrps).map(HYDGRP_SCORE)
    grid["soil_score"] = scores.fillna(0.5).clip(0, 1).round(4).values
    print(f"  soil_score range: {grid.soil_score.min():.3f} - {grid.soil_score.max():.3f}")
    print(f"  mean: {grid.soil_score.mean():.3f}")

    grid.to_file(grid_path, driver="GeoJSON")
    print(f"\nSaved grid to {grid_path.name}")

    plot_soil(cfg, state, grid, processed)
    print("Done.")


if __name__ == "__main__":
    main()
