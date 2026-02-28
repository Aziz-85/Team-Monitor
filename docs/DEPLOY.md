# Production deployment (Ubuntu 22.04 + PM2)

- **OS:** Ubuntu 22.04 (Jammy)
- **Deploy user:** `deploy`
- **App dir:** `/var/www/team-monitor`
- **PM2:** under `deploy`, process name `team-monitor`, port 3002, `npm start`
- **DB:** PostgreSQL local, name `dhahran_team`, Prisma migrations in `prisma/migrations`
- **No interactive prompts.** DB backup before every migration. No manual schema changes.

---

## 1) Exact file contents (reference)

### A) `scripts/deploy.config.env`

```
APP_NAME=team-monitor
APP_DIR=/var/www/team-monitor
PORT=3002
BACKUP_DIR=/home/deploy/backups
DEPLOY_STATE_DIR=/home/deploy/.deploy
DB_NAME=dhahran_team
HEALTHCHECK_URL=http://localhost:3002/
```

### B) Scripts

All under `/var/www/team-monitor/scripts/`:

- **deploy-production.sh** – main deploy: git fetch/reset, npm ci, prisma generate, build, db-backup, migrate, **export DEPLOYED_AT**, pm2 restart, healthcheck; on failure rollback. After success writes **team-monitor_current.json** (appName, packageVersion, gitSha, gitShaShort, deployedAt, branch) to `DEPLOY_STATE_DIR` (atomic write, chmod 644). Does **not** bump versions on the server. Logs to `DEPLOY_STATE_DIR/team-monitor_deploy_YYYYMMDD_HHMM.log`.
- **db-backup.sh** – `sudo -n -u postgres pg_dump -Fc` to timestamped file (temp then mv); fails if backup &lt; 1MB; retention 14.
- **healthcheck.sh** – `curl -fsS` HEALTHCHECK_URL, accept 200 only.
- **rollback.sh** – reset to last_good_sha (else prev_sha), npm ci/install, prisma generate, build, pm2 restart, healthcheck.

### C) Wrapper `/usr/local/bin/deploy-team-monitor`

If root: `su - deploy -c "cd /var/www/team-monitor && scripts/deploy-production.sh"`. Else (as deploy): `cd /var/www/team-monitor && scripts/deploy-production.sh`. Must be executable.

### D) Sudoers (no password for pg_dump/psql)

File: **/etc/sudoers.d/deploy-team-monitor** (content from `scripts/sudoers.deploy-team-monitor`):

```
deploy ALL=(postgres) NOPASSWD: /usr/bin/pg_dump
deploy ALL=(postgres) NOPASSWD: /usr/bin/psql
```

Install: `sudo cp /var/www/team-monitor/scripts/sudoers.deploy-team-monitor /etc/sudoers.d/deploy-team-monitor && sudo chmod 440 /etc/sudoers.d/deploy-team-monitor`. Validate: `sudo visudo -c -f /etc/sudoers.d/deploy-team-monitor`.

### E) Systemd user timer (daily backup 00:15 UTC = 03:15 Riyadh)

Copy from repo into deploy’s user systemd dir:

- **~/.config/systemd/user/team-monitor-db-backup.service**
- **~/.config/systemd/user/team-monitor-db-backup.timer**

Enable (as deploy):

```bash
systemctl --user daemon-reload
systemctl --user enable --now team-monitor-db-backup.timer
```

So user timers run without login (as root once):

```bash
loginctl enable-linger deploy
```

---

## 2) Install commands (one-time)

### As **root**

- Never drop, reset, or re-create the database. No `prisma migrate reset`.
- All filesystem writes under `/var/www/team-monitor` and `/home/deploy` are owned by `deploy:deploy`.

```bash
# 1) Directories and ownership
adduser --disabled-password --gecos "" deploy 2>/dev/null || true
mkdir -p /var/www/team-monitor /home/deploy/backups /home/deploy/.deploy
chown -R deploy:deploy /var/www/team-monitor /home/deploy/backups /home/deploy/.deploy

# 2) Wrapper and script permissions
chmod +x /var/www/team-monitor/scripts/deploy-production.sh \
        /var/www/team-monitor/scripts/db-backup.sh \
        /var/www/team-monitor/scripts/healthcheck.sh \
        /var/www/team-monitor/scripts/rollback.sh
cp /var/www/team-monitor/scripts/deploy-team-monitor /usr/local/bin/
chmod +x /usr/local/bin/deploy-team-monitor

# 3) Sudoers (NOPASSWD for pg_dump/psql only)
cp /var/www/team-monitor/scripts/sudoers.deploy-team-monitor /etc/sudoers.d/deploy-team-monitor
chmod 440 /etc/sudoers.d/deploy-team-monitor
visudo -c -f /etc/sudoers.d/deploy-team-monitor

# 4) Linger so deploy's systemd user timers run without login
loginctl enable-linger deploy
```

### As **deploy**

- PM2 must be managed only by `deploy` (pm2 startup, pm2 save as deploy).
- Logs and state in `/home/deploy/.deploy`; backups in `/home/deploy/backups` (retention 14).

```bash
# 1) Git safe directory
git config --global --add safe.directory /var/www/team-monitor

# 2) Systemd user timer (daily backup 00:15 UTC = 03:15 Riyadh)
mkdir -p ~/.config/systemd/user
cp /var/www/team-monitor/scripts/systemd-user/team-monitor-db-backup.service ~/.config/systemd/user/
cp /var/www/team-monitor/scripts/systemd-user/team-monitor-db-backup.timer   ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now team-monitor-db-backup.timer

# 3) PM2 (correct for deploy user)
cd /var/www/team-monitor
pm2 start ecosystem.config.cjs || true
pm2 save
pm2 startup
# Run the exact command that pm2 startup prints (systemd line for deploy user).
```

Ensure `/var/www/team-monitor` has `.env` (DATABASE_URL, etc.) and the app is cloned there with `.git`, `package.json`, `prisma/`, etc.

---

## 2b) Server-side version tracking

- **Source of truth:** Git (commit SHA) + `package.json` version. The server **does not** bump versions.
- **After each successful deploy** the script writes `$DEPLOY_STATE_DIR/team-monitor_current.json` with: `appName`, `packageVersion`, `gitSha` (full), `gitShaShort`, `deployedAt` (ISO), `branch`. Write is atomic (temp file then mv); file is chmod 644 and readable by the app and deploy user.
- **GET /api/version** reads that JSON if present (using env `DEPLOY_STATE_DIR`, default `/home/deploy/.deploy`). If the file is missing, falls back to `package.json` version and current git SHA; `deployedAt` is null. No DB access.
- **UI footer** shows: "Server: vX.Y.Z (sha: abc1234) deployed &lt;date&gt;" when the JSON exists; otherwise "Server: —". Small, muted, RTL/LTR safe (`dir="ltr"`).

### How to check server version

```bash
# On the server (as deploy or with read access to ~deploy/.deploy)
cat /home/deploy/.deploy/team-monitor_current.json

# From any host (app must be reachable)
curl -s http://localhost:3002/api/version | jq
```

---

## 3) Daily usage

Run (as root or as deploy):

```bash
deploy-team-monitor
```

This runs the full deploy as `deploy` (backup, migrate, build, restart, healthcheck, summary). No passwords. On failure, deploy script rolls back git and exits non-zero.

---

## 4) Rollback

As **deploy**:

```bash
/var/www/team-monitor/scripts/rollback.sh
```

Uses `team-monitor_last_good_sha` (or `team-monitor_prev_sha`), resets repo, rebuilds, restarts PM2, runs healthcheck.

---

## 5) Guardrails

- **NEVER** drop, reset, or re-create the database. Scripts do **not** run `prisma migrate reset`.
- Scripts do **not** modify DB schema manually; only `prisma migrate deploy`.
- If a migration is marked failed (e.g. P3009), deploy stops and prints exact manual resolve instructions (`prisma migrate resolve`).
- No interactive prompts; sudoers NOPASSWD for pg_dump/psql only.
- All filesystem writes owned by deploy:deploy. Sudo only where needed (postgres).
- db-backup.sh fails if backup size &lt; 1MB (suspiciously small). Retention keeps last 14 dumps.
- Deploy logs: `/home/deploy/.deploy/team-monitor_deploy_YYYYMMDD_HHMM.log`.
