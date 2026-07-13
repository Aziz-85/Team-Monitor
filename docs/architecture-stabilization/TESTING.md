# Testing Strategy — Architecture Stabilization Phase 7

**Status:** Active  
**Date:** 2026-07-13

## 1. Goals

| Target | Phase 7 status |
|---|---|
| Overall `lib/` coverage ≥ 70% | **~68%** (baseline locked; raise in Phase 7.1) |
| Sensitive services ≥ 80% | **Enforced** via Jest thresholds on auth, permissions, imports, validation |
| Smoke suite for CI fast path | `npm run test:smoke` |
| Integration tests (PostgreSQL) | Opt-in via `npm run test:integration` |
| Permission / scope regression | Dedicated suite |

## 2. Commands

```bash
# Full unit suite (default)
npm test

# Coverage report + thresholds
npm run test:coverage

# Fast pre-deploy smoke (~30s)
npm run test:smoke

# Security-focused regression bundle
npm run test:security

# PostgreSQL integration (requires DB)
docker compose -f docker-compose.test.yml up -d
export DATABASE_URL=postgresql://dhahran_test:dhahran_test@localhost:54329/dhahran_test
npx prisma migrate deploy
RUN_INTEGRATION_TESTS=1 npm run test:integration
```

## 3. Coverage Thresholds (`jest.config.js`)

| Scope | Lines | Notes |
|---|---|---|
| Global (`lib/**`) | 67% | Current baseline — prevents regression |
| `lib/auth/index.ts` | 90% | Mutation auth facade |
| `lib/permissions/` | 80% | Boutique access + resource IDOR |
| `lib/imports/` | 80% | Import pipeline + dedup |
| `lib/validation/` | 80% | Zod schemas (Phase 6) |

Reports: `coverage/lcov.info` (for CI upload in Phase 8).

## 4. Smoke Suite (`test:smoke`)

Covers:

- Post-login landing paths
- Employee target API parity
- Leave self-request rules
- Auth login generic errors (no credential leak)
- Permission / scope / import security regression index
- Boutique isolation + DEMO_VIEWER guards

## 5. Security Regression Suite (`test:security`)

| File | Focus |
|---|---|
| `boutique-access-security.test.ts` | Cross-boutique read/write, import batch IDOR |
| `auth-mutation-security.test.ts` | `requireMutableUser`, DEMO_VIEWER |
| `demo-viewer-security.test.ts` | `demoGuard` + middleware contract |
| `scope-write-security.test.ts` | `resolveWriteScope` IDOR |
| `permissions-scope-regression.test.ts` | Zod-wired apply routes + schema scope |
| `import-pipeline.test.ts` | Hash dedup + apply gate |
| `validation.test.ts` | Request payload schemas |

## 6. Integration Tests

Location: `__tests__/integration/`

- Gated by `RUN_INTEGRATION_TESTS=1` or `INTEGRATION_DATABASE_URL`
- Uses `docker-compose.test.yml` (Postgres 16 on port **54329**)
- Read-only smoke queries — no destructive writes
- CI runs integration job via `.github/workflows/ci.yml` (Phase 8)

## 7. Phase 7.1 Roadmap

- Raise global threshold from 67% → 70% as legacy `lib/` modules gain tests
- Add integration fixtures for import preview → apply round-trip
- Wire `test:coverage` + `test:integration` into GitHub Actions — **done** (see `CI_CD.md`)
- Expand smoke to include mocked import preview route handlers

## 8. Related Docs

- `PERMISSIONS.md` — role matrix
- `VALIDATION.md` — Zod layer (Phase 6)
- `IMPORT_PIPELINE.md` — import apply flow
- `AUDIT.md` — Phase 7 plan
