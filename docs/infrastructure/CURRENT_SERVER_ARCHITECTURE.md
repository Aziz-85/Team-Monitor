# Current Server Architecture

> Repository assessment dated 2026-07-31. Server facts below were supplied by the operator and must be verified with the read-only commands at the end before installation or migration.

## Application topology

| Application | Domain | Path | Port | PM2 name | Current user / PM2 home | Runtime and database |
| --- | --- | --- | ---: | --- | --- | --- |
| Team Monitor | `dhtasks.com` | `/var/www/team-monitor` | 3002 | `team-monitor` | `deploy` / `/home/deploy/.pm2` | Node.js, Prisma, local PostgreSQL (`dhahran_team`) |
| Aqua Monitors | `aquamonitors.com` | `/var/www/aquamonitors` | 3001 | `aquamonitors` | `root` / `/root/.pm2` | Node.js, PostgreSQL 16 Alpine in Docker |
| Echoes Library | `asdaawilayahsa.com` | `/var/www/echoes-library` | 3000 | `echoes-library` | `root` / `/root/.pm2` | Node.js; database usage not verified |

Nginx is reported to proxy each public domain to its corresponding loopback port. The server is reported as Ubuntu 22.04 LTS with Node.js 24.18.1, npm 11.16.0, PM2 7.0.3, Nginx, PostgreSQL and Docker on a 2 GB host. The existing systemd units are `pm2-root.service` and `pm2-deploy.service`. Aqua's reported database container is `aquamonitors_db_prod` using `postgres:16-alpine`.

## Repository findings

Team Monitor is a Next.js 14 App Router application. It starts with `npm run start` on port 3002 and uses Prisma 5.22 with PostgreSQL. Authentication uses opaque, database-backed sessions in an HTTP-only cookie. Authorization includes a real `SUPER_ADMIN` role. Existing administrative pages perform server-side role checks, API routes use role guards, and mutation endpoints can use the existing double-submit CSRF helper. General and admin audit facilities already exist. Infrastructure work must reuse those conventions and must never expose the agent token or environment files.

## Risk assessment

Running public web applications as `root` turns an application-level remote-code-execution or dependency compromise into full host compromise. It also lets build hooks, npm lifecycle scripts and writable application code alter system files. Aqua Monitors and Echoes Library should ultimately run as the unprivileged `deploy` user, but only one application at a time during a maintenance window.

Multiple `PM2_HOME` trees create two independent process registries, dumps, logs and startup units. Operators can inspect or restart the wrong registry, deploy state can diverge, duplicate processes can contend for ports, and reboot behavior becomes difficult to predict. Do not disable `pm2-root.service` until both root-owned applications have been migrated, externally health-checked and reboot-tested.

The infrastructure dashboard adds a privileged control plane. Its execution features must remain disabled by default, the agent must bind only to `127.0.0.1`, use a strong token stored outside Git, accept only registered application IDs and fixed actions, redact output, rate-limit requests, serialize operations per application and run without general sudo.

## Safe transition outline

1. Inventory actual process definitions, ownership, environment sources, ports and health endpoints.
2. Back up both PM2 dumps and application/database state without copying secrets into Git.
3. Install and validate the read-only agent/dashboard with all action flags disabled.
4. Correct only the minimum required ownership and permissions for one application.
5. Start that application as `deploy` on a temporary loopback port and verify it.
6. In a maintenance window, stop only that application's root PM2 entry, start its deploy entry on the original port, then run internal and external checks.
7. Save the deploy PM2 registry and repeat for the next application.
8. Disable `pm2-root.service` only after both migrations and a later controlled reboot test succeed.

Detailed commands and per-step rollback are in `PM2_MIGRATION_RUNBOOK.md`; this repository does not execute the migration.

## Rollback principles

For an application migration failure, stop only its new temporary/deploy process, restore the original owner only if it was changed and required for the old process, start the saved root PM2 definition, verify the original loopback port and public domain, then record the incident. Never stop all PM2 processes, replace a whole PM2 dump blindly, or disable either startup unit during an application rollback.

For a deployment failure, do not restart after a failed build. Restore the recorded safe commit/build only when the working tree is verified clean, restart the previous process definition and repeat the health check. Database restoration is a separate operator-approved action and is never automatic.

## Not verifiable from this repository

- Live PM2 process state, exact startup unit contents and saved dumps.
- Nginx syntax, enabled sites, TLS certificates, headers, WebSocket and timeout settings.
- Live system users, groups, file ownership, ACLs and sudo rules.
- Contents or location of environment files and whether required variables exist.
- Database users, grants, size, migration state and restore readiness.
- Docker container health, mounts, networks and actual PostgreSQL database/user names.
- Disk/RAM pressure, large backup files, open ports, firewall policy and external DNS/HTTP health.
- Whether each application exposes a dedicated health endpoint and its expected response.

## Operator read-only inspection commands

Run individually and review output for secrets before sharing it. Do not run commands that print process environments or `.env` contents.

```bash
uname -a
lsb_release -a
node --version
npm --version
pm2 --version
df -hT
free -h
uptime
nproc
ss -lntp
systemctl status pm2-root.service --no-pager
systemctl status pm2-deploy.service --no-pager
systemctl cat pm2-root.service
systemctl cat pm2-deploy.service
sudo -u root env PM2_HOME=/root/.pm2 pm2 jlist
sudo -u deploy env PM2_HOME=/home/deploy/.pm2 pm2 jlist
systemctl status nginx postgresql docker --no-pager
nginx -t
find /etc/nginx/sites-enabled -maxdepth 1 -type l -ls
docker ps --filter name=aquamonitors_db_prod
docker inspect --format '{{.Name}} {{.Config.Image}} {{.State.Status}}' aquamonitors_db_prod
stat -c '%U:%G %a %n' /var/www/team-monitor /var/www/aquamonitors /var/www/echoes-library
du -xhd1 /var/www
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3002/api/health
```

`pm2 jlist` can contain command arguments or paths. Sanitize its output before distributing it.
