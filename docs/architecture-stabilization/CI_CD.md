# CI/CD — Architecture Stabilization Phase 8

**Status:** Active  
**Date:** 2026-07-13

## 1. Goal

No production deploy without passing automated quality gates.

## 2. Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | Pull requests to `main`, `workflow_call` | Quality + integration + advisory audit |
| `.github/workflows/deploy.yml` | Push to `main`, manual dispatch | CI gate → version bump → SSH deploy |
| `.github/workflows/deploy-staging.yml` | Manual dispatch only | CI gate → SSH deploy to staging (`APP_ENV=staging`) |

See **`STAGING.md`** (Phase 9) for staging server setup and secrets.

```text
Pull request ──► ci.yml (quality + integration + audit)

Push main ──► deploy.yml
                ├── quality (calls ci.yml) ── must pass
                ├── bump_version ── patch bump [skip ci]
                └── deploy ── SSH + health smoke
```

## 3. CI Jobs

### `quality` (required)

1. `npm ci`
2. `npx prisma generate`
3. `npm run typecheck`
4. `npm run lint`
5. `npm run test:coverage` — Jest thresholds enforced
6. `npm run test:smoke`
7. `npm run test:security`
8. `npm run build`

Uploads `coverage/lcov.info` as artifact.

### `integration` (required)

- **PostgreSQL 16** service container
- `DATABASE_URL=postgresql://dhahran_ci:dhahran_ci@localhost:5432/dhahran_ci`
- `npx prisma migrate deploy`
- `RUN_INTEGRATION_TESTS=1 npm run test:integration`

### `security-audit` (advisory)

- `npm run security:audit`
- **`continue-on-error: true`** — known dependency advisories (handlebars, Next.js, xlsx) do not block deploy until upgraded in a dedicated PR
- Job appears yellow/warning when audit fails

## 4. Deploy Gate

`deploy.yml` job `quality` calls `uses: ./.github/workflows/ci.yml`.

- **`bump_version`** runs only after `quality` succeeds
- **`deploy`** runs only when `quality` succeeded and bump succeeded or was skipped (`[skip ci]` release commit)

## 5. Local CI Parity

```bash
npm ci
npx prisma generate
npm run typecheck
npm run lint
npm run test:coverage
npm run test:smoke
npm run test:security
npm run build

# Integration (requires local Postgres — see TESTING.md)
docker compose -f docker-compose.test.yml up -d
export DATABASE_URL=postgresql://dhahran_test:dhahran_test@localhost:54329/dhahran_test
npx prisma migrate deploy
RUN_INTEGRATION_TESTS=1 npm run test:integration
```

Or use the convenience script:

```bash
npm run ci:local
```

## 6. Branch Protection (recommended)

On GitHub → Settings → Branches → `main`:

- Require status check **Quality gate**
- Require status check **Integration (PostgreSQL)**
- Require pull request before merge

## 7. Known Limitations

| Item | Status |
|---|---|
| Dependency audit blocking | Deferred — advisory job only |
| Staging deploy | Phase 9 |
| Production secrets in CI build | Build uses placeholder `DATABASE_URL` only |

## 8. Related Docs

- `TESTING.md` — coverage thresholds, smoke/security suites
- `AUDIT.md` — Phase 8 plan
- `VALIDATION.md` — Zod layer tested in CI
