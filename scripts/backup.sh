#!/usr/bin/env bash
# Postpone — database backup
# Usage: ./scripts/backup.sh [output-file]
# Run from the project root (same directory as docker-compose.yml).

set -euo pipefail

FILENAME="${1:-tasker_$(date +%Y%m%d-%H%M%S).sql}"

echo "Backing up Postpone database to: $FILENAME"
docker compose exec -T db pg_dump -U tasker tasker > "$FILENAME"
echo "Backup complete: $FILENAME"
