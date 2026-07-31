#!/usr/bin/env bash
set -Eeuo pipefail
echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; uname -a; df -hT; free -h; uptime; ss -lntp
systemctl is-active nginx postgresql docker pm2-root.service pm2-deploy.service 2>/dev/null || true
for url in http://127.0.0.1:3000/ http://127.0.0.1:3001/ http://127.0.0.1:3002/api/health; do curl --silent --output /dev/null --write-out "$url status=%{http_code} time=%{time_total}\n" --max-time 10 "$url" || true; done
