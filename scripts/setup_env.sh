#!/usr/bin/env bash
# setup_env.sh — Create the merascope conda environment.
#
# conda env create -f environment.yml fails on conda <= 4.8.x due to a bug in
# the conflict resolver (TypeError in match_spec.py). Fixed in conda 4.9.0.
# This script works around it by cloning GrapeExpectations if present, and
# falls back to env create on conda >= 4.9.0.

set -e

ENV_NAME="merascope"
CLONE_SOURCE="GrapeExpectations"

if conda env list | grep -q "^${ENV_NAME} "; then
    echo "${ENV_NAME} already exists. Nothing to do."
    echo "To verify: /home/simonhans/anaconda3/envs/${ENV_NAME}/bin/python3 -c \"import geopandas; print(geopandas.__version__)\""
    exit 0
fi

CONDA_VERSION=$(conda --version 2>&1 | awk '{print $2}')
echo "conda version: ${CONDA_VERSION}"

if conda env list | grep -q "^${CLONE_SOURCE} "; then
    echo "Cloning ${CLONE_SOURCE} → ${ENV_NAME} (avoids conda 4.8.x solver bug)..."
    conda create --name "${ENV_NAME}" --clone "${CLONE_SOURCE}"
else
    echo "${CLONE_SOURCE} not found. Attempting conda env create from environment.yml..."
    echo "WARNING: This may fail on conda 4.8.x. Upgrade conda first if it does:"
    echo "  conda update -n base conda"
    conda env create -f environment.yml
fi

echo ""
echo "Done. Verify with:"
echo "  /home/simonhans/anaconda3/envs/${ENV_NAME}/bin/python3 -c \"import geopandas; print(geopandas.__version__)\""
