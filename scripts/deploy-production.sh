#!/usr/bin/env bash
# Production deploy: backup, migrate, build, restart. Run as deploy (or re-exec as deploy if root).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy.config.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config not found: $CONFIG_FILE" >&2
  exit 1
fi
# shellcheck source=deploy.config.env
source "$CONFIG_FILE"

# If root: fix ownership and re-exec as deploy
if [[ "$(id -u)" -eq 0 ]]; then
  echo "[deploy] Running as root: fixing ownership and re-executing as deploy..."
  [[ -d "$APP_DIR" ]] || { echo "ERROR: $APP_DIR does not exist" >&2; exit 1; }
  chown -R deploy:deploy "$APP_DIR"
  mkdir -p "$DEPLOY_STATE_DIR"
  chown deploy:deploy "$DEPLOY_STATE_DIR"
  exec su - deploy -c "cd $APP_DIR && $APP_DIR/scripts/deploy-production.sh"
fi

# From here: run as deploy
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$APP_DIR"
mkdir -p "$DEPLOY_STATE_DIR"

# Log file (absolute path)
LOG_FILE="${DEPLOY_STATE_DIR}/team-monitor_deploy_$(date -u +%Y%m%d_%H%M).log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== Deploy started $(date -u -Iseconds) ==="

# Git safe.directory (idempotent)
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# Record PREV_SHA before changing anything
PREV_SHA="$(git rev-parse HEAD)"
echo "$PREV_SHA" > "$DEPLOY_STATE_DIR/team-monitor_prev_sha"
echo "[1] PREV_SHA recorded: $PREV_SHA"

# On any failure: rollback to PREV_SHA, restart PM2, exit non-zero
rollback_and_exit() {
  echo "ERROR: Deploy failed. Rolling back to $PREV_SHA and restarting PM2..." >&2
  git reset --hard "$PREV_SHA"
  if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  npx prisma generate
  npm run build
  pm2 restart "$APP_NAME" --update-env
  pm2 save
  exit 1
}

# Git update
echo "[2] Git fetch and reset to origin/main..."
git fetch --all --prune || rollback_and_exit
git reset --hard origin/main || rollback_and_exit

# npm install
echo "[3] npm ci / npm install..."
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund || rollback_and_exit
else
  npm install --no-audit --no-fund || rollback_and_exit
fi

echo "[4] npx prisma generate..."
npx prisma generate || rollback_and_exit

echo "[5] npm run build (next build)..."
npm run build || rollback_and_exit

# Backup before migrations
echo "[6] DB backup (before migrations)..."
BACKUP_PATH=""
if ! BACKUP_PATH=$("$SCRIPT_DIR/db-backup.sh" | head -n1); then
  echo "ERROR: db-backup.sh failed" >&2
  rollback_and_exit
fi
echo "$BACKUP_PATH" > "$DEPLOY_STATE_DIR/team-monitor_last_backup"
echo "    Backup: $BACKUP_PATH"

# Migrate status (capture for P3009 check)
echo "[7] Prisma migrate status..."
npx prisma migrate status > "$DEPLOY_STATE_DIR/team-monitor_migrate_status.txt" 2>&1 || true
if grep -qE "P3009|failed to apply|failed migration|diverged" "$DEPLOY_STATE_DIR/team-monitor_migrate_status.txt" 2>/dev/null; then
  echo "ERROR: Prisma reports a failed or divergent migration. Do NOT auto-resolve." >&2
  echo "  1. Inspect: sudo -u postgres psql -d $DB_NAME -c \"SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;\"" >&2
  echo "  2. Resolve manually: npx prisma migrate resolve --rolled-back <migration_name> OR --applied <migration_name>" >&2
  echo "  3. Re-run deploy after resolving." >&2
  cat "$DEPLOY_STATE_DIR/team-monitor_migrate_status.txt" >&2
  rollback_and_exit
fi

echo "[8] Prisma migrate deploy..."
npx prisma migrate deploy || rollback_and_exit

echo "[9] PM2 restart $APP_NAME --update-env..."
DEPLOYED_AT="$(date -Is)"
export DEPLOYED_AT
pm2 restart "$APP_NAME" --update-env
pm2 save

echo "[10] Healthcheck (HTTP 200 required)..."
if ! "$SCRIPT_DIR/healthcheck.sh"; then
  echo "ERROR: Healthcheck failed." >&2
  rollback_and_exit
fi

# Success: record last good SHA and write deployed version JSON (atomic)
echo "$(git rev-parse HEAD)" > "$DEPLOY_STATE_DIR/team-monitor_last_good_sha"
LAST_GOOD_SHA="$(cat "$DEPLOY_STATE_DIR/team-monitor_last_good_sha")"
PKG_VERSION="$(node -p "require('./package.json').version")"
SHA_FULL="$(git rev-parse HEAD)"
SHA_SHORT="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')"
CURRENT_JSON="$DEPLOY_STATE_DIR/team-monitor_current.json"
CURRENT_JSON_TMP="${CURRENT_JSON}.$$.tmp"
mkdir -p "$DEPLOY_STATE_DIR"
node -e "
const fs = require('fs');
const o = {
  appName: process.env.APP_NAME,
  packageVersion: process.env.PKG_VERSION,
  gitSha: process.env.SHA_FULL,
  gitShaShort: process.env.SHA_SHORT,
  deployedAt: process.env.DEPLOYED_AT,
  branch: process.env.BRANCH
};
fs.writeFileSync(process.env.CURRENT_JSON_TMP, JSON.stringify(o, null, 2));
" APP_NAME="$APP_NAME" PKG_VERSION="$PKG_VERSION" SHA_FULL="$SHA_FULL" SHA_SHORT="$SHA_SHORT" DEPLOYED_AT="$DEPLOYED_AT" BRANCH="$BRANCH" CURRENT_JSON_TMP="$CURRENT_JSON_TMP"
mv "$CURRENT_JSON_TMP" "$CURRENT_JSON"
chmod 644 "$CURRENT_JSON"

echo "=============================================="
echo "  DEPLOY SUMMARY"
echo "=============================================="
echo "  Deployed SHA:   $LAST_GOOD_SHA"
echo "  Package ver:    $PKG_VERSION"
echo "  Version file:   $CURRENT_JSON"
echo "  Backup file:    $BACKUP_PATH"
echo "  Migrations:     applied OK"
echo "  PM2:            restarted OK"
echo "  Healthcheck:    OK"
echo "  Log:            $LOG_FILE"
echo "=============================================="
