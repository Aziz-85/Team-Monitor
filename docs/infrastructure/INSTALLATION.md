# Installation

Perform in a maintenance-approved shell on the server. First run `scripts/infrastructure/inspect-server.sh` and `server-readiness-check.sh`; review ownership, paths and command locations because systemd uses `/usr/bin/npm` as a documented placeholder.

Create `/etc/app-infrastructure/agent.env` mode `0640`, owned by `root:deploy`, with a unique token of at least 32 random characters. Never commit or print it. Create `/etc/app-infrastructure/backup.env` similarly with database connection variables. Required settings:

```dotenv
INFRASTRUCTURE_DASHBOARD_ENABLED=false
INFRASTRUCTURE_ACTIONS_ENABLED=false
INFRASTRUCTURE_DEPLOY_ENABLED=false
INFRASTRUCTURE_RESTART_ENABLED=false
INFRASTRUCTURE_LOGS_ENABLED=false
INFRASTRUCTURE_BACKUP_ENABLED=false
INFRASTRUCTURE_AGENT_URL=http://127.0.0.1:4317
INFRASTRUCTURE_AGENT_TOKEN=replace-outside-git
INFRASTRUCTURE_POLL_TOKEN=replace-with-a-different-secret-outside-git
INFRASTRUCTURE_REQUEST_TIMEOUT_MS=30000
INFRASTRUCTURE_AGENT_HOST=127.0.0.1
INFRASTRUCTURE_AGENT_PORT=4317
INFRASTRUCTURE_HEALTH_TIMEOUT_SECONDS=10
INFRASTRUCTURE_DISK_WARNING_PERCENT=75
INFRASTRUCTURE_DISK_CRITICAL_PERCENT=90
INFRASTRUCTURE_MEMORY_WARNING_PERCENT=80
INFRASTRUCTURE_BACKUP_STALE_HOURS=48
```

Safe sequence after review:

```bash
cd /var/www/team-monitor
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
sudo install -d -o deploy -g deploy -m 0750 /var/log/app-infrastructure /var/lib/app-infrastructure /var/backups/app-infrastructure /run/lock/app-infrastructure
sudo cp ops/systemd/infrastructure-* /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/infrastructure-*.service /etc/systemd/system/infrastructure-*.timer
sudo systemctl daemon-reload
sudo systemctl enable --now infrastructure-agent.service
curl --fail http://127.0.0.1:4317/health
```

Apply `npx prisma migrate deploy` only after a verified database backup and explicit production approval. Enable the dashboard first with every action flag false. Install timers only after their manual one-shot services pass. Never proxy port 4317 through Nginx or open it in the firewall.
