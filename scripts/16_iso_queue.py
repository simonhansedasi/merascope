"""
16_iso_queue.py — Grid capacity / interconnection queue pressure score.

Adds to grid_scores.geojson:
  iso_queue_mw        — total planned/proposed capacity (MW) queued in the state (EIA-860M)
  grid_capacity_score — normalized score (0-1, higher = less queue pressure = better)

Note: this is a state-level indicator, not cell-level — every cell in a state gets
the identical iso_queue_mw / grid_capacity_score value (EIA-860M doesn't report
queue position at finer-than-state granularity), unlike most other indicators
which vary per grid cell.

Method: EIA Form 860M (Monthly Electric Generator Report) contains a 'Planned' sheet
with proposed/under-construction generators. The ratio (planned_mw / operating_mw)
per state is a proxy for interconnection queue pressure: states with more planned
capacity relative to existing base face more interconnection competition and higher
probability of curtailment delays for new large loads.

Source: EIA Form 860M monthly — current file, stable URL pattern
  https://www.eia.gov/electricity/data/eia860m/xls/december_generator2026.xlsx

Usage:
  python 16_iso_queue.py WA
"""

import argparse
import re
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"

# EIA Form 860M — scrape current URL from landing page once. The fallback is a
# dated URL that WILL go stale (EIA renames the file every month); it only
# matters if _get_latest_860m_url()'s regex scrape of the landing page fails,
# so bump the month/year here if both start failing.
EIA860M_INDEX = "https://www.eia.gov/electricity/data/eia860m/"
EIA860M_FALLBACK = ("https://www.eia.gov/electricity/data/eia860m/xls/"
                    "april_generator2026.xlsx")
SHARED_SUMMARY = "eia860m_state_capacity.csv"


def _get_latest_860m_url():
    """Scrape the EIA-860M landing page for the most recent working Excel file URL."""
    try:
        r = requests.get(EIA860M_INDEX, timeout=30,
                         headers={"User-Agent": "datacenter-siting-research/1.0"})
        r.raise_for_status()
        links = re.findall(r'href=["\']([^"\']*?_generator\d{4}\.xlsx)["\']', r.text, re.I)
        # Try each link (newest first) until we get a 200
        for link in links:
            if not link.startswith("http"):
                link = "https://www.eia.gov" + link
            try:
                head = requests.head(link, timeout=15,
                                     headers={"User-Agent": "datacenter-siting-research/1.0"},
                                     allow_redirects=True)
                if head.status_code == 200:
                    return link
            except Exception:
                continue
        return None
    except Exception as e:
        print(f"  WARNING: Could not scrape 860M index: {e}")
        return None


def fetch_eia860m_capacity(shared_dir):
    """
    Download EIA Form 860M and compute (state, operating_mw, planned_mw) summary.
    Cached to data/shared/eia860m_state_capacity.csv.
    """
    cache_path = shared_dir / SHARED_SUMMARY
    if cache_path.exists():
        df = pd.read_csv(cache_path)
        print(f"  Cached: EIA 860M capacity summary ({len(df)} states)")
        return df

    url = _get_latest_860m_url()
    if url is None:
        url = EIA860M_FALLBACK

    print(f"  Downloading EIA Form 860M from {url}...")
    try:
        r = requests.get(url, timeout=180,
                         headers={"User-Agent": "datacenter-siting-research/1.0"})
        r.raise_for_status()

        import io
        buf = io.BytesIO(r.content)

        # 860M has multiple sheets: "Operating", "Planned", "Retired"
        xls = pd.ExcelFile(buf, engine="openpyxl")
        print(f"  Sheets: {xls.sheet_names}")

        def _read_sheet(name_fragment):
            """Find and read a sheet by partial name match."""
            match = next(
                (s for s in xls.sheet_names if name_fragment in s.lower()), None
            )
            if match is None:
                return pd.DataFrame()
            for skip in [2, 1, 0]:
                try:
                    df = xls.parse(match, header=skip)
                    cols_lower = [str(c).lower() for c in df.columns]
                    # Confirm we found the right header row by checking for key columns
                    if any("state" in c for c in cols_lower) and any("capacity" in c for c in cols_lower):
                        return df
                except Exception:
                    continue
            return pd.DataFrame()

        def _state_mw(df):
            """Return {state_abbr: total_mw} from a 860M sheet."""
            if df.empty:
                return {}
            df.columns = [str(c).strip() for c in df.columns]
            state_col = next(
                (c for c in df.columns
                 if c.lower() in ("state", "plant state", "plant_state",
                                  "plant  state")), None
            )
            cap_col = next(
                (c for c in df.columns
                 if "nameplate" in c.lower() and "capacity" in c.lower()), None
            )
            if cap_col is None:
                cap_col = next(
                    (c for c in df.columns if "capacity" in c.lower()), None
                )
            if state_col is None or cap_col is None:
                return {}
            df["_s"] = df[state_col].astype(str).str.strip().str.upper()
            df["_mw"] = pd.to_numeric(df[cap_col], errors="coerce").fillna(0)
            return df.groupby("_s")["_mw"].sum().to_dict()

        op = _state_mw(_read_sheet("operat"))
        pl = _state_mw(_read_sheet("plan"))

        if not op and not pl:
            print("  WARNING: Could not parse 860M sheets")
            return pd.DataFrame(columns=["state", "operating_mw", "planned_mw"])

        all_states = sorted(set(list(op.keys()) + list(pl.keys())))
        summary = pd.DataFrame({
            "state": all_states,
            "operating_mw": [round(op.get(s, 0), 1) for s in all_states],
            "planned_mw":   [round(pl.get(s, 0), 1) for s in all_states],
        })
        summary.to_csv(cache_path, index=False)
        print(f"  EIA 860M: {len(summary)} states summarized")
        return summary

    except Exception as e:
        print(f"  EIA 860M failed: {e}")
        return pd.DataFrame(columns=["state", "operating_mw", "planned_mw"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    shared_dir = root / "data" / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n=== 16_iso_queue: {cfg['name']} ({cfg['abbr']}) ===")

    grid = gpd.read_file(grid_path)
    if "grid_capacity_score" in grid.columns:
        print("  grid_capacity_score already present; skipping.")
        return
    print(f"  Grid: {len(grid)} cells")

    capacity = fetch_eia860m_capacity(shared_dir)
    abbr = cfg["abbr"]

    row = capacity[capacity["state"] == abbr]
    if len(row) == 0 or len(capacity) == 0:
        print(f"  No EIA 860M data for {abbr}; grid_capacity_score=0.5 (neutral)")
        grid["iso_queue_mw"] = np.nan
        grid["grid_capacity_score"] = 0.5
    else:
        operating_mw = float(row["operating_mw"].iloc[0])
        planned_mw   = float(row["planned_mw"].iloc[0])
        grid["iso_queue_mw"] = round(planned_mw, 1)

        # Ratio: planned / (operating + 1) → higher ratio = more pipeline pressure
        ratio = planned_mw / max(operating_mw + 1, 1)

        # Normalize across all states in the summary
        all_ratios = (
            capacity["planned_mw"] / (capacity["operating_mw"] + 1)
        ).values
        all_ratios = all_ratios[np.isfinite(all_ratios)]
        p95 = np.percentile(all_ratios, 95) if len(all_ratios) > 0 else 1.0
        normalized = float(np.clip(ratio / max(p95, 0.001), 0, 1))

        # Invert: lower pressure = higher score
        grid["grid_capacity_score"] = round(1.0 - normalized, 4)

        print(f"  {abbr}: {operating_mw:,.0f} MW operating, {planned_mw:,.0f} MW planned")

    print(f"  grid_capacity_score: {grid['grid_capacity_score'].iloc[0]:.3f}")
    grid.to_file(grid_path, driver="GeoJSON")
    print(f"  Saved {grid_path.name}")


if __name__ == "__main__":
    main()
