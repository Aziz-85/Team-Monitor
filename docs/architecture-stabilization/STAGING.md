# Staging Environment

**Phase:** Architecture Stabilization Phase 9  
**Status:** Active  
**Date:** 2026-07-13

## 1. Goal

Provide a **safe pre-production** deployment that:

- Uses a **separate PostgreSQL database** from production
- Uses **distinct secrets** (JWT, deploy register, cron, webhooks)
- Uses **isolated cookie names** so sessions never bleed across hosts
- Uses **separate upload directories** for snapshots and attachments
- Shows a **visible STAGING banner** on every page
- **Fails fast** on misconfiguration at server startup

## 2. Environment identity

| Variable | Production | Staging | Local dev |
|----------|------------|---------|-----------|
| `APP_ENV` | `production` | `staging` | unset or `local` |
| `NODE_ENV` | `production` | `production` | `development` |
| Cookie prefix | `dt_` | `dt_staging_` | `dt_` |
| Startup validation | Strict | Strict + DB guard | Relaxed |

Set `APP_ENV` explicitly on every deployed server. CI builds omit `APP_ENV` so validation does not block `next build`.

## 3. Module reference

| Module | Role |
|--------|------|
| `lib/env/appEnv.ts` | `getAppEnv()`, `isStaging()`, `shouldUseSecureCookies()` |
| `lib/env/cookies.ts` | Session / CSRF / locale cookie names |
| `lib/env/index.ts` | Public facade |
| `lib/validation/env.ts` | Zod parse + `validateEnvOnStartup()` |
| `instrumentation.ts` | Runs validation before serving traffic |
| `components/env/StagingBanner.tsx` | Orange top banner when staging |

## 4. Cookie isolation

When `APP_ENV=staging`, cookies use prefix `dt_staging_`:

| Cookie | Production | Staging |
|--------|------------|---------|
| Session | `dt_session` | `dt_staging_session` |
| CSRF | `dt_csrf` | `dt_staging_csrf` |
| Locale | `dt_locale` | `dt_staging_locale` |

Override with `COOKIE_PREFIX=custom_` if needed.

Client components read `NEXT_PUBLIC_COOKIE_PREFIX` (injected at build from `APP_ENV`).

## 5. Database guard

On staging servers, set `PRODUCTION_DATABASE_URL` to the production connection string. Startup validation rejects staging if:

- `DATABASE_URL === PRODUCTION_DATABASE_URL`, or
- The database **name** in the URL matches production

This prevents the most common misconfiguration (AUDIT finding M4).

## 6. Server setup checklist

### 6.1 PostgreSQL

```bash
sudo -u postgres createuser dhahran_staging -P
sudo -u postgres createdb dhahran_staging -O dhahran_staging
```

### 6.2 Application directory

Use a **separate clone or directory** from production, e.g. `/var/www/dhahran-staging`.

### 6.3 Environment file

Copy `.env.example` → `.env` and set at minimum:

```env
APP_ENV=staging
NODE_ENV=production
PORT=3003
DATABASE_URL=postgresql://dhahran_staging:***@localhost:5432/dhahran_staging
PRODUCTION_DATABASE_URL=postgresql://...production...
DEPLOY_REGISTER_SECRET=<unique-staging-secret-min-16>
UPLOAD_ROOT=/data/staging
MONTH_SNAPSHOT_DIR=/data/staging/month-snapshots
NEXT_PUBLIC_APP_URL=https://staging.yourdomain.com
APP_INTERNAL_ORIGIN=http://127.0.0.1:3003
```

### 6.4 Deploy

```bash
cd /var/www/dhahran-staging
git pull
npm ci
npx prisma migrate deploy
export APP_ENV=staging
export APP_VERSION=$(node -p "require('./package.json').version")
export GIT_HASH=$(git rev-parse --short HEAD)
export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export BUILD_COMMIT=$GIT_HASH
export BUILD_TIME=$BUILD_DATE
npm run build
pm2 reload ecosystem.staging.config.cjs --update-env
curl -sf https://staging.yourdomain.com/api/health
```

Expected health response includes `"env":"staging"`.

### 6.5 PM2 example

See `ecosystem.config.example.cjs` — copy to `ecosystem.staging.config.cjs` with `APP_ENV=staging` and a distinct `name` / `PORT`.

### 6.6 Nginx

Point a **separate hostname** (e.g. `staging.dhtasks.com`) to the staging port. Do not share production TLS cert paths if using distinct domains.

## 7. GitHub Actions (optional)

Manual staging deploy workflow: `.github/workflows/deploy-staging.yml`

Requires repository secrets:

| Secret | Purpose |
|--------|---------|
| `STAGING_SSH_HOST` | Staging VM host |
| `STAGING_SSH_USER` | SSH user |
| `STAGING_SSH_KEY` | Private key |
| `STAGING_APP_DIR` | App path on server |
| `STAGING_HEALTHCHECK_URL` | e.g. `https://staging.example.com/api/health` |

Trigger via **Actions → Deploy staging → Run workflow**.

Production deploy (`deploy.yml`) is unchanged and gated by CI.

## 8. Verification

| Check | Command / action |
|-------|----------------|
| Banner visible | Open staging URL — orange “STAGING ENVIRONMENT” bar |
| Health env | `curl staging.../api/health` → `"env":"staging"` |
| Cookie prefix | DevTools → Application → Cookies → `dt_staging_session` |
| DB isolation | Change data on staging; confirm production unchanged |
| Startup guard | Set `DATABASE_URL` = prod URL on staging → server refuses start |

## 9. Tests

```bash
npm test -- __tests__/env-validation.test.ts
```

Included in `npm run test:security`.

## 10. Related docs

- `.env.example` — variable template
- `VALIDATION.md` — Phase 6 (env schema delivered in Phase 9)
- `CI_CD.md` — production pipeline
- `AUDIT.md` — M4 / L4 findings
