#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
app_id="${1:-}"; shift || true; assert_app_id "$app_id"; parse_common_args "$@"; require_command curl
if health_check "$app_id"; then record "$app_id" health success; log INFO "$app_id is healthy"; else record "$app_id" health failed; die "$INFRA_EXIT_HEALTH" "$app_id health check failed"; fi
