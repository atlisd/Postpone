#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/src/Tasker.Api"
CLIENT_DIR="$ROOT/client"

API_PID=""
cleanup() {
  echo ""
  echo "Stopping backend..."
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Build everything first so a regression run fails fast on compile/type errors
echo "Building backend..."
dotnet build "$API_DIR" -c Debug

echo "Building frontend..."
cd "$CLIENT_DIR"
npm run build

# Start DB
echo "Starting database..."
docker compose -f "$ROOT/docker-compose.yml" up db -d

# Start backend
echo "Starting backend..."
cd "$API_DIR"
dotnet run --launch-profile http &
API_PID=$!

# Wait for API to be ready
echo "Waiting for API on :5001..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:5001/health >/dev/null 2>&1; then
    echo "API ready."
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "Backend process died unexpectedly." >&2
    exit 1
  fi
  sleep 1
done

if ! curl -sf http://localhost:5001/health >/dev/null 2>&1; then
  echo "API did not become ready in time." >&2
  exit 1
fi

# Run Playwright (it starts the frontend via webServer config)
echo "Running Playwright tests..."
cd "$CLIENT_DIR"
npx playwright test "$@"
