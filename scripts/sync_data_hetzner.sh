#!/bin/bash
# One-time or occasional sync of GeoJSON data files to Hetzner.
# These are large (~500MB total) — don't run on every deploy.
set -e

HETZNER="root@204.168.182.60"
REMOTE_DIR="/home/simonhans/coding/merascope"

echo "Syncing data/ to Hetzner (this will take a while)..."
rsync -av --checksum \
  -e "ssh -i $HOME/.ssh/id_ed25519" \
  --exclude='*.pyc' \
  data/ \
  "$HETZNER:$REMOTE_DIR/data/"

echo "Data sync complete."
