#!/usr/bin/env bash
set -Eeuo pipefail
root="${1:-/var/www}"; [[ -d "$root" ]] || { echo "directory not found" >&2; exit 64; }
echo "READ-ONLY storage audit: $root"; df -h "$root"
find "$root" -xdev -type d \( -name node_modules -o -name .next -o -name logs -o -path '*/.git/objects' \) -prune -print0 | xargs -0 -r du -sh 2>/dev/null | sort -h
find "$root" -xdev -type f -size +200M -printf '%s %TY-%Tm-%Td %p\n' 2>/dev/null | sort -nr
find "$root" -xdev -type f -mtime +90 -printf '%TY-%Tm-%Td %s %p\n' 2>/dev/null | sort | head -200
echo "Suggestions only: review duplicate archives, old builds/logs and node_modules; delete nothing without owner approval and a verified backup."
