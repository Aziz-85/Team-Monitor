#!/usr/bin/env bash
set -Eeuo pipefail

readonly INFRA_EXIT_USAGE=64 INFRA_EXIT_CONFIG=78 INFRA_EXIT_BUSY=75 INFRA_EXIT_HEALTH=70
readonly INFRA_ROOT="${INFRASTRUCTURE_ROOT:-/var/www/team-monitor}"
readonly INFRA_STATE_DIR="${INFRASTRUCTURE_STATE_DIR:-/var/lib/app-infrastructure}"
readonly INFRA_LOG_DIR="${INFRASTRUCTURE_LOG_DIR:-/var/log/app-infrastructure}"
readonly INFRA_LOCK_DIR="${INFRASTRUCTURE_LOCK_DIR:-/run/lock/app-infrastructure}"
readonly INFRA_BACKUP_DIR="${INFRASTRUCTURE_BACKUP_DIR:-/var/backups/app-infrastructure}"
INFRA_DRY_RUN=false

timestamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '%s level=%s message=%q\n' "$(timestamp)" "$1" "$2" >&2; }
die() { local code="$1"; shift; log ERROR "$*"; exit "$code"; }
cleanup_common() { [[ -n "${INFRA_TMP_DIR:-}" && -d "${INFRA_TMP_DIR:-}" ]] && rm -rf -- "$INFRA_TMP_DIR"; }
trap cleanup_common EXIT
trap 'die 70 "failed at line ${LINENO}"' ERR

parse_common_args() {
  while (($#)); do case "$1" in --dry-run) INFRA_DRY_RUN=true ;; *) die "$INFRA_EXIT_USAGE" "unknown option: $1" ;; esac; shift; done
}

assert_app_id() {
  case "${1:-}" in team-monitor|aquamonitors|echoes-library) ;; *) die "$INFRA_EXIT_USAGE" "unknown app id" ;; esac
}
app_cwd() { case "$1" in team-monitor) echo /var/www/team-monitor;; aquamonitors) echo /var/www/aquamonitors;; echoes-library) echo /var/www/echoes-library;; esac; }
app_pm2() { case "$1" in team-monitor) echo team-monitor;; aquamonitors) echo aquamonitors;; echoes-library) echo echoes-library;; esac; }
app_health_url() { case "$1" in team-monitor) echo http://127.0.0.1:3002/api/health;; aquamonitors) echo http://127.0.0.1:3001/;; echoes-library) echo http://127.0.0.1:3000/;; esac; }
app_branch() { echo main; }

require_deploy_user() { [[ "$(id -un)" == deploy ]] || die 77 "run as deploy; never run application scripts as root"; }
require_path() { [[ -d "$1" ]] || die "$INFRA_EXIT_CONFIG" "required directory missing: $1"; }
require_command() { command -v "$1" >/dev/null || die "$INFRA_EXIT_CONFIG" "required command missing: $1"; }
ensure_dirs() { install -d -m 0750 "$INFRA_STATE_DIR" "$INFRA_LOG_DIR" "$INFRA_LOCK_DIR"; }
acquire_lock() { ensure_dirs; exec 9>"$INFRA_LOCK_DIR/$1.lock"; flock -n 9 || die "$INFRA_EXIT_BUSY" "operation already running for $1"; }
make_tmp() { INFRA_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/infra.XXXXXX")"; }
run() { if $INFRA_DRY_RUN; then log INFO "dry-run: $*"; else "$@"; fi; }
record() { ensure_dirs; printf '%s app=%q action=%q result=%q request_id=%q\n' "$(timestamp)" "$1" "$2" "$3" "${INFRASTRUCTURE_REQUEST_ID:-manual}" >>"$INFRA_LOG_DIR/operations.log"; }

check_capacity() {
  local path="$1" min_kb="${INFRASTRUCTURE_MIN_FREE_KB:-1048576}" available
  available="$(df -Pk "$path" | awk 'NR==2 {print $4}')"
  [[ "$available" =~ ^[0-9]+$ && "$available" -ge "$min_kb" ]] || die 74 "insufficient free disk space"
  local available_mb; available_mb="$(awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  [[ "$available_mb" -ge "${INFRASTRUCTURE_MIN_MEMORY_MB:-256}" ]] || die 74 "insufficient available memory"
}

health_check() {
  curl --fail --silent --show-error --location --max-time "${INFRASTRUCTURE_HEALTH_TIMEOUT_SECONDS:-10}" --output /dev/null "$(app_health_url "$1")"
}
