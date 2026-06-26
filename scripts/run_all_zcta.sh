#!/bin/bash
# run_all_zcta.sh — Full ZCTA national scoring pipeline.
#
# Runs steps per-state individually so SRTM tiles can be deleted after step 06.
# All output streams live to stdout AND logs/zcta_master.log — run in tmux and tail it.
#
# Usage (on Hetzner, from repo root):
#   tmux new -s zcta
#   bash scripts/run_all_zcta.sh 2>&1 | tee logs/zcta_master.log
#
# WA resumes at step 10 (already has steps 02-09).
# All other states run steps 02-16 from scratch.

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON=$(which python3)
echo "Using Python: $PYTHON  ($(${PYTHON} --version 2>&1))"
ROOT="$(dirname "$SCRIPTS_DIR")"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

ALL_STATES=(AL AR AZ CA CO CT DE FL GA IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY)

ts() { date '+%H:%M:%S'; }

run_step() {
    local state=$1 step_num=$2 script=$3
    local env_prefix=""
    [ "$step_num" != "02" ] && env_prefix="DC_SUBDIR=zcta"
    echo "[$(ts)] $state  step $step_num: $script"
    env $env_prefix $PYTHON -u "$script" "$state"
}

score_state() {
    local STATE=$1
    local START=${2:-02}

    echo ""
    echo "========================================"
    echo " $(ts)  SCORING: $STATE  (start step $START)"
    echo "========================================"

    # Steps before terrain
    for step_num in 02 03 04 05; do
        [ "$step_num" -lt "$START" ] 2>/dev/null && continue
        case $step_num in
            02) run_step "$STATE" 02 "$SCRIPTS_DIR/zcta/02_zcta_indicators.py" || return 1 ;;
            03) run_step "$STATE" 03 "$SCRIPTS_DIR/03_risk.py"                 || return 1 ;;
            04) run_step "$STATE" 04 "$SCRIPTS_DIR/04_environment.py"          || return 1 ;;
            05) run_step "$STATE" 05 "$SCRIPTS_DIR/05_geothermal.py"           || return 1 ;;
        esac
    done

    # Step 06: terrain (SRTM — large download; delete tiles after)
    if [ "$START" -le "06" ] 2>/dev/null; then
        run_step "$STATE" 06 "$SCRIPTS_DIR/06_terrain.py" || return 1
        SRTM_DIR="$ROOT/data/$STATE/raw/srtm_tiles"
        if [ -d "$SRTM_DIR" ]; then
            echo "[$(ts)] $STATE  deleting SRTM tiles: $SRTM_DIR"
            rm -rf "$SRTM_DIR"
            echo "[$(ts)] $STATE  SRTM tiles deleted"
        fi
    fi

    # Steps 07-16
    for step_num in 07 08 09 10 11 12 13 14 15 16; do
        [ "$step_num" -lt "$START" ] 2>/dev/null && continue
        case $step_num in
            07) run_step "$STATE" 07 "$SCRIPTS_DIR/07_protected.py"    || return 1 ;;
            08) run_step "$STATE" 08 "$SCRIPTS_DIR/08_aquifer.py"      || return 1 ;;
            09) run_step "$STATE" 09 "$SCRIPTS_DIR/09_soil.py"         || return 1 ;;
            10) run_step "$STATE" 10 "$SCRIPTS_DIR/10_soilprofile.py"  || return 1 ;;
            11) run_step "$STATE" 11 "$SCRIPTS_DIR/11_substations.py"  || return 1 ;;
            12) run_step "$STATE" 12 "$SCRIPTS_DIR/12_superfund.py"    || return 1 ;;
            13) run_step "$STATE" 13 "$SCRIPTS_DIR/13_air_quality.py"  || return 1 ;;
            14) run_step "$STATE" 14 "$SCRIPTS_DIR/14_fiber.py"        || return 1 ;;
            15) run_step "$STATE" 15 "$SCRIPTS_DIR/15_water_stress.py" || return 1 ;;
            16) run_step "$STATE" 16 "$SCRIPTS_DIR/16_iso_queue.py"    || return 1 ;;
        esac
    done

    echo "[$(ts)] $STATE  scoring complete"
}

# ── Phase 1: Score all states ──────────────────────────────────────────────────

FAILED_STATES=()

for STATE in "${ALL_STATES[@]}"; do
    START=02
    [ "$STATE" = "WA" ] && START=10   # WA already has steps 02-09

    score_state "$STATE" "$START" || {
        echo "[$(ts)] $STATE  FAILED — continuing with next state"
        FAILED_STATES+=("$STATE")
    }
done

# ── Phase 2: National normalization ───────────────────────────────────────────

echo ""
echo "========================================"
echo " $(ts)  NORMALIZING (national *_nat columns)"
echo "========================================"
$PYTHON "$SCRIPTS_DIR/normalize_zcta_national.py"

# ── Phase 3: Derive fishnet from ZCTA ─────────────────────────────────────────

echo ""
echo "========================================"
echo " $(ts)  BUILDING FISHNET FROM ZCTA"
echo "========================================"
for STATE in "${ALL_STATES[@]}"; do
    echo "[$(ts)] $STATE  fishnet derivation"
    $PYTHON "$SCRIPTS_DIR/build_fishnet_from_zcta.py" "$STATE" || {
        echo "[$(ts)] $STATE  fishnet derivation FAILED"
        FAILED_STATES+=("fishnet-$STATE")
    }
done

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "========================================"
echo " $(ts)  PIPELINE COMPLETE"
if [ ${#FAILED_STATES[@]} -gt 0 ]; then
    echo " Failed: ${FAILED_STATES[*]}"
else
    echo " All states succeeded."
fi
echo "========================================"
