#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
app_id="${1:-}"; shift || true; assert_app_id "$app_id"; allow_dirty=false
while (($#)); do case "$1" in --dry-run) INFRA_DRY_RUN=true;; --allow-dirty) allow_dirty=true;; *) die "$INFRA_EXIT_USAGE" "unknown option";; esac; shift; done
require_deploy_user; for cmd in git npm pm2 curl flock; do require_command "$cmd"; done
cwd="$(app_cwd "$app_id")"; require_path "$cwd"; acquire_lock "$app_id"; check_capacity "$cwd"; cd "$cwd"
old_commit="$(git rev-parse HEAD)"; branch="$(git branch --show-current)"; [[ "$branch" == "$(app_branch "$app_id")" ]] || die 65 "deployment branch is not allowed"
if [[ -n "$(git status --porcelain)" ]] && ! $allow_dirty; then die 65 "working tree is dirty"; fi
mkdir -p "$INFRA_STATE_DIR/$app_id"; printf '%s\n' "$old_commit" >"$INFRA_STATE_DIR/$app_id/rollback-commit"
run git fetch --prune origin; run git merge --ff-only "origin/$branch"
run npm ci
[[ -d prisma ]] && run npx prisma generate
if [[ "${INFRASTRUCTURE_RUN_PRISMA_MIGRATIONS:-false}" == true && "$app_id" == team-monitor ]]; then
  backup_args=("$app_id"); $INFRA_DRY_RUN && backup_args+=(--dry-run)
  "$INFRA_ROOT/scripts/infrastructure/backup-database.sh" "${backup_args[@]}"; run npx prisma migrate deploy
fi
for script in test lint typecheck; do if node -e "const p=require('./package.json');process.exit(p.scripts?.['$script']?0:1)"; then run npm run "$script"; fi; done
run npm run build
run pm2 reload "$(app_pm2 "$app_id")" --update-env
if $INFRA_DRY_RUN || wait_for_health "$app_id"; then record "$app_id" deploy success; exit 0; fi
log ERROR "health failed; starting controlled rollback"; "$INFRA_ROOT/scripts/infrastructure/rollback-app.sh" "$app_id" "$old_commit"; record "$app_id" deploy rolled_back; exit "$INFRA_EXIT_HEALTH"
