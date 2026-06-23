#!/bin/bash
# run_new_indicators.sh — Run scripts 11-16 across all 48 contiguous states.
# Each script is idempotent: skips the state if columns already present.
# National datasets (HIFLD, Aqueduct, PeeringDB, FCC 477) are downloaded once
# on the first state run and reused for all subsequent states via data/shared/.
#
# Usage:
#   ./scripts/run_new_indicators.sh              # all 48 states
#   ./scripts/run_new_indicators.sh WA OR CA     # specific states only

PYTHON=/home/simonhans/anaconda3/envs/merascope/bin/python3
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDICATORS="11_substations 12_superfund 13_air_quality 14_fiber 15_water_stress 16_iso_queue"

STATES_48="AL AR AZ CA CO CT DE FL GA IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY"

if [ "$#" -gt 0 ]; then
    STATES="$@"
else
    STATES="$STATES_48"
fi

echo "Running new indicators for: $STATES"
echo "================================================"

for S in $STATES; do
    for SCRIPT in $INDICATORS; do
        $PYTHON -u "${SCRIPTS_DIR}/${SCRIPT}.py" "$S"
    done
done

echo ""
echo "================================================"
echo "All done. Next step: re-run normalize_national.py to generate *_score_nat columns."
echo "  $PYTHON -u ${SCRIPTS_DIR}/normalize_national.py"
