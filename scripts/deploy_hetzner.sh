#!/bin/bash
set -e

HETZNER="root@204.168.182.60"
REMOTE_DIR="/home/simonhans/coding/merascope"

echo "Running lint..."
flake8 scripts/ merascope/ \
  --max-line-length 120 \
  --exclude=scripts/.ipynb_checkpoints,merascope/.ipynb_checkpoints \
  --extend-ignore=E127,E221,E222,E231,E302,E402,E501,E701,E702,W503

echo "Running tests..."
/home/simonhans/anaconda3/envs/merascope/bin/python3 -m pytest tests/ -q --tb=short
echo ""
echo "Fetching vendor assets..."
bash "$(dirname "$0")/fetch_vendor.sh"

echo "Building JSX..."
npm run build

echo "Syncing code to Hetzner..."
rsync -av --checksum \
  -e "ssh -i $HOME/.ssh/id_ed25519" \
  --exclude='.git/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='venv/' \
  --exclude='node_modules/' \
  --exclude='merascope_log.db' \
  --exclude='merascope_test.db' \
  --exclude='data/' \
  ./ \
  "$HETZNER:$REMOTE_DIR/"

echo "Restarting service..."
ssh -i "$HOME/.ssh/id_ed25519" "$HETZNER" \
  "systemctl restart merascope"

echo "Done. Live at https://merascope.com"
