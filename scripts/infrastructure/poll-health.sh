#!/usr/bin/env bash
set -Eeuo pipefail
[[ -n "${INFRASTRUCTURE_POLL_TOKEN:-}" ]] || { echo "INFRASTRUCTURE_POLL_TOKEN is required" >&2; exit 78; }
curl --fail --silent --show-error --max-time "${INFRASTRUCTURE_REQUEST_TIMEOUT_SECONDS:-60}" \
  --request POST --header "Authorization: Bearer ${INFRASTRUCTURE_POLL_TOKEN}" \
  --output /dev/null http://127.0.0.1:3002/api/cron/infrastructure-health
