#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
parse_common_args "$@"; for cmd in node npm pm2 git curl flock df; do require_command "$cmd"; done
for app in team-monitor aquamonitors echoes-library; do path="$(app_cwd "$app")"; [[ -d "$path" ]] && log INFO "$app path present" || log WARN "$app path missing"; done
check_capacity /var/www; log INFO "readiness checks completed; no changes made"
