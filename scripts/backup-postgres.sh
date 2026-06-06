#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT="${BACKUP_DIR}/ai-kingdom-${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$OUTPUT"

echo "Backup written to $OUTPUT"
