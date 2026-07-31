#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
app_id="${1:-}"; shift || true; assert_app_id "$app_id"; parse_common_args "$@"; require_deploy_user; require_command pm2; acquire_lock "$app_id"
run pm2 reload "$(app_pm2 "$app_id")" --update-env
if $INFRA_DRY_RUN || wait_for_health "$app_id"; then record "$app_id" restart success; else record "$app_id" restart failed; die "$INFRA_EXIT_HEALTH" "restart health check failed"; fi
