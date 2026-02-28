#!/usr/bin/env bash
# DB backup with retention (keep last 14). Uses temp file then mv (atomic).
# Run as deploy. Requires: deploy may run pg_dump as postgres via sudo (NOPASSWD).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy.config.env"
RETENTION=14

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config not found: $CONFIG_FILE" >&2
  exit 1
fi
# shellcheck source=deploy.config.env
source "$CONFIG_FILE"

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
FINAL_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.fc"
TMP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.fc.$$.tmp"

if ! sudo -n -u postgres pg_dump -Fc "$DB_NAME" > "$TMP_FILE"; then
  echo "ERROR: pg_dump failed" >&2
  rm -f "$TMP_FILE"
  exit 1
fi
# Fail if backup is suspiciously small (< 1MB)
MIN_BACKUP_BYTES=1048576
SIZE=$(stat -c%s "$TMP_FILE" 2>/dev/null || echo 0)
if [[ "$SIZE" -lt "$MIN_BACKUP_BYTES" ]]; then
  echo "ERROR: Backup size $SIZE bytes is below minimum ${MIN_BACKUP_BYTES} (1MB)" >&2
  rm -f "$TMP_FILE"
  exit 1
fi
mv "$TMP_FILE" "$FINAL_FILE"
echo "$FINAL_FILE"

# Retention: keep last RETENTION (newest); delete older. No-op if fewer than 14.
while IFS= read -r f; do
  [[ -n "$f" && -f "$f" ]] && rm -f "$f"
done < <(ls -t "${BACKUP_DIR}/${DB_NAME}"_*.fc 2>/dev/null | tail -n +$((RETENTION + 1)))
echo "Retention: keep last $RETENTION in $BACKUP_DIR"
