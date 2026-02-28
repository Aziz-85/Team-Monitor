# Deploy Runbook – Team Monitor (Next.js App Router)

Use this on the **live server** so the latest build (Sync Planner v2, new API routes) is served and caching does not hide updates.

---

## 1. Identify environment

On the server:

```bash
node -v
npm -v
pm2 list
# Or: systemctl list-units | grep -E 'node|next|dhahran'
```

Note the **app name** and **cwd** of the running process (e.g. `pm2 show <appName>` → `exec cwd`).

---

## 2. Verify current state (before fix)

```bash
# Replace DOMAIN and PORT with your actual values
curl -I "https://<DOMAIN>/api/sync/planner/export/v2?periodType=WEEK&periodKey=2026-W07"
curl -I "https://<DOMAIN>/api/health"
```

If you get **404**, the old build is running or the wrong app/port is used.

---

## 3. Deploy latest code

**If using git on the server:**

```bash
cd /path/to/dhahran-app   # same as PM2 exec cwd
git fetch --all
git checkout main          # or your deploy branch
git pull
git rev-parse HEAD         # print and keep this hash
```

**If deploying via rsync/scp:** copy the repo (including `app/`, `lib/`, etc.) so the server has the latest files. Note the commit hash from your local machine.

---

## 4. Clean rebuild and restart

**Option A – use the script (recommended):**

```bash
cd /path/to/dhahran-app
chmod +x scripts/deploy-build-and-restart.sh
./scripts/deploy-build-and-restart.sh
# Or with app name: ./scripts/deploy-build-and-restart.sh dhahran-app
```

The script: removes `.next` and `node_modules/.cache`, runs `npm ci`, `npm run build`, sets `BUILD_COMMIT`/`BUILD_TIME`, then `pm2 restart` (or `pm2 start` if not running). It uses `ecosystem.config.example.cjs` if `ecosystem.config.cjs` is not present.

**Option B – manual steps:**

```bash
cd /path/to/dhahran-app
pm2 stop <appName>
rm -rf .next node_modules/.cache
npm ci
npm run build
export BUILD_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
export BUILD_TIME=$(date -Iseconds 2>/dev/null || echo "unknown")
pm2 start ecosystem.config.example.cjs --update-env
# Or: pm2 restart <appName> --update-env
```

If you use your own **PM2 config**, ensure `cwd` is the project root and the app runs `next start` (or `npm run start`). Copy `ecosystem.config.example.cjs` to `ecosystem.config.cjs` and edit if needed.

---

## 5. Verify API after restart

```bash
# Replace PORT with the port your app listens on (e.g. 3000)
curl -I "http://127.0.0.1:<PORT>/api/sync/planner/export/v2?periodType=WEEK&periodKey=2026-W07"
curl -s "http://127.0.0.1:<PORT>/api/health"
```

- **v2 export:** expect **200** (or **400** if week not approved / missing taskKey), **not 404**.
- **health:** expect `{"commit":"...","buildTime":"..."}`.

Then through the public URL:

```bash
curl -I "https://<DOMAIN>/api/sync/planner/export/v2?periodType=WEEK&periodKey=2026-W07"
curl -s "https://<DOMAIN>/api/health"
```

If localhost works but DOMAIN returns 404, the reverse proxy is pointing at the wrong port or app.

---

## 6. Nginx (if used)

```bash
sudo nginx -t
cat /etc/nginx/sites-enabled/<your-site>   # check proxy_pass and upstream
# proxy_pass should point to http://127.0.0.1:<PORT>;
sudo systemctl reload nginx
```

Re-run the `curl` commands from step 5.

---

## 7. Front-end cache

- Open **https://<DOMAIN>/sync/planner** in an **incognito** window and hard refresh.
- Confirm the **“Download v2 (Power Automate)”** button is visible.
- In DevTools → Network, click the button and confirm the request goes to  
  `/api/sync/planner/export/v2?periodType=WEEK&periodKey=...`.

If the API works but the UI is old:

- Purge CDN cache (Cloudflare etc.) for `/sync/planner` and `/api/*`.
- Ensure HTML is not cached long-term (Next.js default is fine; avoid aggressive caching of `/` and `/sync/*`).

---

## 8. Diagnostics to capture

Run and keep output for support:

```bash
node -v
npm -v
pm2 list
pm2 show dhahran-app   # or your app name → exec cwd, script
pwd
git rev-parse HEAD
curl -I "http://127.0.0.1:3000/api/health"
curl -I "http://127.0.0.1:3000/api/sync/planner/export/v2?periodType=WEEK&periodKey=2026-W07"
```

---

## Summary checklist

- [ ] Server has latest code (git pull or rsync).
- [ ] `rm -rf .next` and `npm run build` in app directory.
- [ ] PM2 (or your process manager) restarts the app from the **same** directory.
- [ ] `/api/health` returns 200 and shows commit/buildTime.
- [ ] `/api/sync/planner/export/v2` returns 200 or 400, not 404.
- [ ] Nginx (if any) proxies to the correct port.
- [ ] Incognito + hard refresh shows “Download v2 (Power Automate)” on /sync/planner.
