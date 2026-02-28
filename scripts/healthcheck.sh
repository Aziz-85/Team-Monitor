#!/usr/bin/env bash
# Healthcheck: 200 only on HEALTHCHECK_URL. Non-zero on failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy.config.env"
URL="${HEALTHCHECK_URL:-http://localhost:3002/}"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck source=deploy.config.env
  source "$CONFIG_FILE"
  URL="$HEALTHCHECK_URL"
fi

CODE=$(curl -fsS -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$URL" 2>/dev/null || echo "000")
[[ "$CODE" == "200" ]] && exit 0
exit 1
