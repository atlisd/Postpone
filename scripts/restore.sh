#!/usr/bin/env bash
# Postpone — database restore
# Usage: ./scripts/restore.sh <backup-file.sql>
# Run from the project root (same directory as docker-compose.yml).
# WARNING: This will destroy all current data and replace it with the backup.

set -euo pipefail

FILENAME="${1:-}"

if [[ -z "$FILENAME" ]]; then
  echo "Usage: $0 <backup-file.sql>"
  exit 1
fi

if [[ ! -f "$FILENAME" ]]; then
  echo "Error: file not found: $FILENAME"
  exit 1
fi

echo "Restoring Postpone database from: $FILENAME"
echo ""
echo "WARNING: This will permanently overwrite all data in the current database."
read -rp "Continue? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "Stopping API to prevent writes during restore..."
docker compose stop api

echo "Dropping and recreating database..."
docker compose exec -T db psql -U tasker -d postgres \
  -c "DROP DATABASE IF EXISTS tasker;" \
  -c "CREATE DATABASE tasker OWNER tasker;"

echo "Restoring from $FILENAME..."
docker compose exec -T db psql -U tasker -d tasker < "$FILENAME"

echo "Starting API..."
docker compose start api

echo ""
echo "Restore complete."
