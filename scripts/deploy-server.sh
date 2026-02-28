#!/usr/bin/env bash
# =============================================================================
# Deploy Next.js + Prisma + PostgreSQL to Ubuntu 22.04 (DigitalOcean)
# Run on server as user 'deploy' from /var/www/team-monitor (with sudo for system steps)
# =============================================================================
set -e

APP_PATH="${APP_PATH:-/var/www/team-monitor}"
APP_PORT="${APP_PORT:-3002}"

echo "=============================================="
echo "STEP 1 — Clean old PM2 services"
echo "=============================================="
sudo systemctl disable --now pm2-deploy.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/pm2-deploy.service || true
sudo systemctl daemon-reload
sudo systemctl reset-failed 2>/dev/null || true
echo "Done."

echo ""
echo "=============================================="
echo "STEP 2 — Ensure correct ownership"
echo "=============================================="
sudo mkdir -p "$APP_PATH"
sudo chown -R deploy:deploy "$APP_PATH"
echo "Done."

echo ""
echo "=============================================="
echo "STEP 3 — Install dependencies & build"
echo "=============================================="
cd "$APP_PATH"
npm install
npm run build
echo "Done."

echo ""
echo "=============================================="
echo "STEP 4 — Prisma production safety"
echo "=============================================="
npx prisma generate
npx prisma migrate deploy
echo "Done."

echo ""
echo "=============================================="
echo "STEP 5 — Create PM2 ecosystem file (fork, port $APP_PORT)"
echo "=============================================="
cat > ecosystem.config.cjs << EOF
module.exports = {
  apps: [
    {
      name: "team-monitor",
      cwd: "$APP_PATH",
      script: "node_modules/next/dist/bin/next",
      args: "start -p $APP_PORT",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        PORT: "$APP_PORT"
      },
      time: true
    }
  ]
};
EOF
echo "Done."

echo ""
echo "=============================================="
echo "STEP 6 — Restart PM2 cleanly"
echo "=============================================="
pm2 kill 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
echo "Done."

echo ""
echo "=============================================="
echo "STEP 7 — PM2 startup on reboot (systemd)"
echo "=============================================="
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u deploy --hp /home/deploy || true
pm2 save
echo "Done."

echo ""
echo "=============================================="
echo "STEP 8 — Verify service"
echo "=============================================="
systemctl list-unit-files | grep -E 'pm2|deploy' || true
sudo systemctl restart pm2-deploy 2>/dev/null || true
sudo systemctl restart pm2-deploy.service 2>/dev/null || true
sudo systemctl status pm2-deploy --no-pager 2>/dev/null || true
echo "Done."

echo ""
echo "=============================================="
echo "STEP 9 — Health checks"
echo "=============================================="
echo "--- PM2 list ---"
pm2 list
echo ""
echo "--- Port $APP_PORT listening? ---"
sudo ss -lntp | grep ":$APP_PORT" || echo "Check: is app bound to $APP_PORT?"
echo ""
echo "--- HTTP health (127.0.0.1:$APP_PORT) ---"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" --max-time 5 "http://127.0.0.1:$APP_PORT" || echo "curl failed"
echo ""
echo "=============================================="
echo "Deploy complete. Expected: team-monitor online, port $APP_PORT listening, HTTP 307/200."
echo "=============================================="
