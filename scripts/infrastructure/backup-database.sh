#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
app_id="${1:-}"; shift || true; assert_app_id "$app_id"; parse_common_args "$@"; require_deploy_user; acquire_lock "$app_id-backup"; install -d -m 0750 "$INFRA_BACKUP_DIR/$app_id"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"; target="$INFRA_BACKUP_DIR/$app_id/${app_id}_${stamp}.dump"; partial="$target.partial"
case "$app_id" in
  team-monitor)
    require_command pg_dump; [[ -n "${TEAM_MONITOR_DATABASE_URL:-}" ]] || die "$INFRA_EXIT_CONFIG" "TEAM_MONITOR_DATABASE_URL is required"
    run pg_dump --format=custom --file="$partial" --dbname="$TEAM_MONITOR_DATABASE_URL" ;;
  aquamonitors)
    require_command docker; [[ -n "${AQUA_POSTGRES_DB:-}" && -n "${AQUA_POSTGRES_USER:-}" ]] || die "$INFRA_EXIT_CONFIG" "Aqua database name and user are required"
    if $INFRA_DRY_RUN; then log INFO "dry-run: docker pg_dump to protected backup file"; else docker exec aquamonitors_db_prod pg_dump --format=custom --username="$AQUA_POSTGRES_USER" --dbname="$AQUA_POSTGRES_DB" >"$partial"; fi ;;
  *) die "$INFRA_EXIT_CONFIG" "database backup is not configured for $app_id" ;;
esac
if ! $INFRA_DRY_RUN; then [[ -s "$partial" ]] || die 65 "backup is empty"; chmod 0640 "$partial"; mv "$partial" "$target"; sha256sum "$target" >"$target.sha256"; fi
record "$app_id" backup success; log INFO "backup created; retention is manual-only"
