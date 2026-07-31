#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
app_id="${1:-}"; commit="${2:-}"; shift 2 || true; assert_app_id "$app_id"; parse_common_args "$@"; [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || die "$INFRA_EXIT_USAGE" "invalid rollback commit"
require_deploy_user; cwd="$(app_cwd "$app_id")"; require_path "$cwd"; cd "$cwd"; [[ -z "$(git status --porcelain)" ]] || die 65 "rollback refused: working tree is not clean"
git cat-file -e "$commit^{commit}"; run git reset --hard "$commit"; run npm ci; [[ -d prisma ]] && run npx prisma generate; run npm run build; run pm2 reload "$(app_pm2 "$app_id")" --update-env
if $INFRA_DRY_RUN || health_check "$app_id"; then record "$app_id" rollback success; else record "$app_id" rollback failed; die "$INFRA_EXIT_HEALTH" "rollback health check failed"; fi
