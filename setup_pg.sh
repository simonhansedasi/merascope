#!/bin/bash
# Run on Hetzner VPS (Ubuntu 22.04) as root or sudo to install PostgreSQL
# and create the merascope database + role.
#
# Usage:
#   sudo bash setup_pg.sh
#
# After this runs, add to /etc/merascope.env:
#   DATABASE_URL=postgresql://merascope:CHANGEME@localhost/merascope

set -e

# ── install PostgreSQL ────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y postgresql postgresql-client

systemctl enable postgresql
systemctl start postgresql

# ── create role + database ────────────────────────────────────────────────────
# Prompt for password so it doesn't end up in shell history
read -rsp "Enter password for merascope DB user: " PG_PASS
echo

sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merascope') THEN
    CREATE ROLE merascope LOGIN PASSWORD '${PG_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE merascope OWNER merascope'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'merascope')\gexec
SQL

# ── apply schema ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATABASE_URL="postgresql://merascope:${PG_PASS}@localhost/merascope"
psql "$DATABASE_URL" -f "$SCRIPT_DIR/schema.sql"

echo ""
echo "Done. Add these lines to /etc/merascope.env:"
echo "  DATABASE_URL=postgresql://merascope:${PG_PASS}@localhost/merascope"
echo "  S3_ENDPOINT=https://<region>.your-objectstorage.com"
echo "  S3_ACCESS_KEY=<hetzner-access-key>"
echo "  S3_SECRET_KEY=<hetzner-secret-key>"
echo "  S3_BUCKET=merascope-docs"
echo "  SMTP_USER=vitruviansandwich@gmail.com"
echo "  SMTP_PASS=<gmail-app-password>"
echo "  APP_URL=https://merascope.com"
echo "  APP_ENV=production"
echo ""
echo "Then restart the gunicorn service:"
echo "  systemctl restart merascope"
echo ""
echo "Create the S3 bucket in Hetzner console, then test with:"
echo "  aws --endpoint-url \$S3_ENDPOINT s3 ls s3://merascope-docs"
