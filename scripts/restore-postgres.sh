#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: DATABASE_URL=... scripts/restore-postgres.sh <backup.dump>"
  exit 1
fi

pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-acl "$BACKUP_FILE"

echo "Restore completed from $BACKUP_FILE"
