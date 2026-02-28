#!/usr/bin/env bash
# Rollback to last good or prev SHA, rebuild, restart PM2. Run as deploy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy.config.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config not found: $CONFIG_FILE" >&2
  exit 1
fi
# shellcheck source=deploy.config.env
source "$CONFIG_FILE"

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run as deploy: sudo -u deploy $APP_DIR/scripts/rollback.sh" >&2
  exit 1
fi

cd "$APP_DIR"
mkdir -p "$DEPLOY_STATE_DIR"

ROLLBACK_SHA=""
if [[ -f "$DEPLOY_STATE_DIR/team-monitor_last_good_sha" ]]; then
  ROLLBACK_SHA=$(cat "$DEPLOY_STATE_DIR/team-monitor_last_good_sha")
elif [[ -f "$DEPLOY_STATE_DIR/team-monitor_prev_sha" ]]; then
  ROLLBACK_SHA=$(cat "$DEPLOY_STATE_DIR/team-monitor_prev_sha")
else
  echo "ERROR: No rollback SHA found in $DEPLOY_STATE_DIR" >&2
  exit 1
fi

echo "Rollback: resetting to $ROLLBACK_SHA..."
git fetch --all --prune
git reset --hard "$ROLLBACK_SHA"

if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npx prisma generate
npm run build

pm2 restart "$APP_NAME" --update-env
pm2 save

echo "Healthcheck:"
if "$SCRIPT_DIR/healthcheck.sh"; then
  echo "  OK"
else
  echo "  FAILED"
  exit 1
fi

echo "=============================================="
echo "  ROLLBACK SUMMARY"
echo "=============================================="
echo "  SHA:         $ROLLBACK_SHA"
echo "  PM2:         restarted"
echo "  Healthcheck: OK"
echo "=============================================="
