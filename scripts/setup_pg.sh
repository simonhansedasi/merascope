#!/bin/bash
# Run on Hetzner VPS (Ubuntu 22.04) as root to install PostgreSQL
# and create the merascope database + role.
#
# Usage:
#   sudo bash setup_pg.sh

set -e

# ── install PostgreSQL ────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y postgresql postgresql-client

systemctl enable postgresql
systemctl start postgresql

# ── create role + database ────────────────────────────────────────────────────
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
echo "Done. Create /etc/merascope.env with:"
echo ""
echo "  DATABASE_URL=postgresql://merascope:${PG_PASS}@localhost/merascope"
echo "  APP_URL=https://merascope.com"
echo "  APP_ENV=production"
echo "  SMTP_HOST=smtp.sendgrid.net"
echo "  SMTP_PORT=587"
echo "  SMTP_USER=apikey"
echo "  SMTP_PASS=SG.<sendgrid-api-key>"
echo "  FROM_EMAIL=noreply@merascope.com"
echo "  S3_ENDPOINT=https://<region>.your-objectstorage.com"
echo "  S3_ACCESS_KEY=<key>"
echo "  S3_SECRET_KEY=<secret>"
echo "  S3_BUCKET=merascopedocs"
echo ""
echo "Then restart the service:"
echo "  systemctl restart merascope"
