#!/usr/bin/env bash
# Run this on the server from the project root (e.g. /var/www/team-monitor or /var/www/dhahran-app).
# Ensures clean build and restart with build stamp for /api/health.
# Usage: ./scripts/deploy-build-and-restart.sh [pm2-app-name]
# Example: ./scripts/deploy-build-and-restart.sh team-monitor

set -e
APP_NAME="${1:-team-monitor}"

echo "=== Clean and rebuild ==="
rm -rf .next
rm -rf node_modules/.cache
npm ci
npm run build

echo "=== Build stamp ==="
export BUILD_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
export BUILD_TIME=$(date -Iseconds 2>/dev/null || echo "unknown")
echo "BUILD_COMMIT=$BUILD_COMMIT BUILD_TIME=$BUILD_TIME"

echo "=== Restart PM2 ==="
ECOSYSTEM="ecosystem.config.cjs"
[ -f "$ECOSYSTEM" ] || ECOSYSTEM="ecosystem.config.example.cjs"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  BUILD_COMMIT="$BUILD_COMMIT" BUILD_TIME="$BUILD_TIME" pm2 restart "$APP_NAME" --update-env
else
  BUILD_COMMIT="$BUILD_COMMIT" BUILD_TIME="$BUILD_TIME" pm2 start "$ECOSYSTEM" --update-env
fi
pm2 save 2>/dev/null || true

echo "=== Verify ==="
sleep 2
PORT="${PORT:-3000}"
curl -s "http://127.0.0.1:$PORT/api/health" || true
echo ""
echo "Done. Check /api/health and /api/sync/planner/export/v2 on your domain."
