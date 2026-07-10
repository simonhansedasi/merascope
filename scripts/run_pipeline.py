#!/usr/bin/env python3
"""
run_pipeline.py — Master script: runs the 10 CORE siting analysis scripts in sequence.

Usage:
  python run_pipeline.py WA
  python run_pipeline.py TX --start 03     # resume from script 03 onward
  python run_pipeline.py CA --only 06 07   # run only specific scripts

IMPORTANT: call this script with the merascope conda Python directly.
Do NOT use conda run (output buffering bug). Example:
  /home/simonhans/anaconda3/envs/merascope/bin/python3 -u scripts/run_pipeline.py WA

Output: data/{STATE}/grid_scores.geojson (10 core score columns + raw physical values)

IMPORTANT — this only runs scripts 01-10. The 6 supplemental indicators
(11_substations through 16_iso_queue, added after this orchestrator was
written) are run separately for all 48 states via run_new_indicators.sh —
they read national datasets cached once in data/shared/ rather than
per-state raw/, so they didn't fit this script's per-state subprocess loop.
After running new/changed states through either path, normalize_national.py
must be re-run so *_nat columns reflect the full 48-state distribution.

Note: delete SRTM tiles after step 06 to free disk:
  rm -rf data/{STATE}/raw/srtm_tiles/
"""

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

PIPELINE = [
    ("01", "01_basemap.py",      "State boundary, OSM data centers + transmission, EIA plants"),
    ("02", "02_indicators.py",   "Fishnet grid + tx_score, water_score (PRISM), ej_score, pop_exposure_score"),
    ("03", "03_risk.py",         "seismic_score, flood_score"),
    ("04", "04_environment.py",  "contamination_score, waterway_score"),
    ("05", "05_geothermal.py",   "geothermal_score (IHFC heat flow)"),
    ("06", "06_terrain.py",      "flatness_score, slope_score (SRTM1 tiled; delete tiles after)"),
    ("07", "07_protected.py",    "protected_score (federal + tribal hard gate)"),
    ("08", "08_aquifer.py",      "aquifer_score (USGS NWIS depth to water)"),
    ("09", "09_soil.py",         "soil_score (SSURGO hydrologic group)"),
    ("10", "10_soilprofile.py",  "soil_profile_score, ksat_score (SSURGO horizons)"),
]


def run_step(script_file, state_abbr):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / script_file), state_abbr],
        check=False,
    )
    return result.returncode


def main():
    parser = argparse.ArgumentParser(
        description="Run the data center siting pipeline for a US state.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py WA                 # full run
  python run_pipeline.py OR --deploy        # run + print rsync deploy reminder
  python run_pipeline.py TX --start 03      # resume from risk step
  python run_pipeline.py CA --only 06 07    # terrain + protected only
        """,
    )
    parser.add_argument("state", help="Two-letter state abbreviation (e.g. WA, OR, TX)")
    parser.add_argument("--deploy", action="store_true",
                        help="Print rsync reminder after completion")
    parser.add_argument("--start", metavar="NN", default="01",
                        help="Start from this step number (e.g. 03 to resume)")
    parser.add_argument("--only", nargs="+", metavar="NN",
                        help="Run only these step numbers (e.g. --only 06 07)")
    args = parser.parse_args()

    state_abbr = args.state.upper()

    # Determine which steps to run
    if args.only:
        steps = [s for s in PIPELINE if s[0] in args.only]
    else:
        steps = [s for s in PIPELINE if s[0] >= args.start]

    if not steps:
        print(f"No matching steps. Available: {[s[0] for s in PIPELINE]}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  Data Center Siting Pipeline — {state_abbr}")
    print(f"  Steps: {[s[0] for s in steps]}")
    print(f"{'='*60}\n")

    for step_id, script_file, description in steps:
        print(f"\n{'─'*60}")
        print(f"  Step {step_id}: {description}")
        print(f"{'─'*60}")
        rc = run_step(script_file, state_abbr)
        if rc != 0:
            print(f"\nERROR: Step {step_id} ({script_file}) exited with code {rc}")
            print("Pipeline halted. Fix the error and re-run with --start", step_id)
            sys.exit(rc)

    # Always retrofit raw physical-value columns after a full run.
    # patch_raws.py is idempotent: it skips columns already present.
    # Skip only when the user ran a partial subset (--only or --start > 01).
    is_full_run = not args.only and args.start == "01"
    if is_full_run:
        print(f"\n{'─'*60}")
        print(f"  Post-processing: patch_raws.py {state_abbr}")
        print(f"{'─'*60}")
        rc = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "patch_raws.py"), state_abbr],
            check=False,
        ).returncode
        if rc != 0:
            print(f"\nWARNING: patch_raws.py exited with code {rc}.")
            print("Raw physical-value columns may be incomplete.")

    if args.deploy:
        project_root = SCRIPTS_DIR.parent
        print(f"\nDeploy reminder — rsync data/{state_abbr}/ to server:")
        print(f"  rsync -av --exclude='srtm_tiles/' {project_root}/data/{state_abbr}/ "
              f"root@<SERVER>:/path/to/merascope/data/{state_abbr}/")
        print("\nAlso add to merascope/map.jsx GRID_URLS:")
        print(f"  'data/{state_abbr}/grid_scores.geojson',")

    print(f"\n{'='*60}")
    print(f"  Pipeline complete for {state_abbr}.")
    grid_path_display = SCRIPTS_DIR.parent / "data" / state_abbr / "grid_scores.geojson"
    print(f"  Output: {grid_path_display}")
    print("\n  Remember: delete SRTM tiles if not already done:")
    print(f"  rm -rf data/{state_abbr}/raw/srtm_tiles/")
    print("\n  Add to merascope/map.jsx GRID_URLS:")
    print(f"  'data/{state_abbr}/grid_scores.geojson',")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
