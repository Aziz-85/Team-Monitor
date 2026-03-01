# Team Monitor — Full Codebase Audit Report

**Date:** 2025-02-26  
**Policy:** Strict Multi-Boutique Isolation (no cross-boutique mixing by default)

---

## 1) Security Findings

| File | Endpoint/Page | Issue | Risk | Fix Plan |
|------|---------------|-------|------|----------|
| `app/api/cron/task-reminders/route.ts` | POST /api/cron/task-reminders | CRON_SECRET optional: if env missing, executes without auth (fail-open) | **P0** | Require CRON_SECRET; return 500/401 if missing |
| `app/api/internal/deploy/register/route.ts` | POST /api/internal/deploy/register | DEPLOY_REGISTER_SECRET required; returns 401 if missing or mismatch | A | Already fail-closed |
| `app/api/version/route.ts` | GET /api/version | No auth; intentional (public build metadata) | A | Keep |
| `app/api/locale/route.ts` | GET/POST /api/locale | No auth; sets/reads locale cookie only | P2 | Consider rate-limit; low risk |
| `app/api/admin/delegations/route.ts` | GET/POST | boutiqueId from query; MANAGER validated against user.boutiqueId | A | Already validated |
| `app/api/leaves/request/route.ts` | POST | boutiqueId from body; validated against allowedBoutiqueIds | A | Already validated |
| `app/api/executive/historical-snapshot/route.ts` | GET | ADMIN can pass boutiqueId; non-admin uses operational | A | Already scoped |
| All data APIs | Various | getSessionUser/requireRole at start | A | Auth enforced |

---

## 2) Scope Consistency Findings

| File | Endpoint/Page | Scope Source Now | Classification | Risk | Fix Plan |
|------|---------------|------------------|----------------|------|----------|
| `app/api/me/scope/route.ts` | GET/POST /api/me/scope | getStoredScopePreference, resolveScopeForUser | **B** Explicit scope preference API | A | Keep; only place for stored scope |
| `lib/scope/resolveScope.ts` | N/A | resolveScopeForUser, getStoredScopePreference, scopeJson | D | Used by me/scope only; data APIs must not use | Ensure data APIs use SSOT |
| `app/api/executive/*` (route, insights, anomalies, etc.) | Executive APIs | resolveOperationalBoutiqueOnly (ssotScope) | A | A | Already patched |
| `app/api/executive/compare/route.ts` | GET /api/executive/compare | resolveExecutiveBoutiqueIds → resolveBoutiqueIdsWithOptionalGlobal | B | A | Already supports global=true |
| `app/api/executive/employees/*` | GET /api/executive/employees | resolveExecutiveBoutiqueIds | B | A | Already supports global=true |
| `lib/metrics/scope.ts` | resolveMetricsScope | getOperationalScope | A | D | Delegate to SSOT |
| `lib/executive/scope.ts` | resolveExecutiveBoutiqueIds | resolveBoutiqueIdsWithOptionalGlobal | A | A | Already delegates |
| `lib/scope/operationalScope.ts` | getOperationalScope, requireOperationalScope | Session boutique | A | Foundational | SSOT uses internally |
| `lib/scope/requireOperationalBoutique.ts` | requireOperationalBoutique | requireBoutiqueScope (ssot) | A | A | Already delegates |
| `lib/scope/whereBoutique.ts` | whereBoutiqueIn | Filter builder only | A | N/A | Used with SSOT output |
| `app/api/tasks/my-today/route.ts` | GET /api/tasks/my-today | requireOperationalScope | A | A | Operational only |
| `app/api/tasks/list/route.ts` | GET /api/tasks/list | requireOperationalScope | A | A | Operational only |
| `app/api/schedule/*` | Schedule APIs | getScheduleScope → getOperationalScope | A | A | Single boutique |
| `app/api/sales/*` | Sales APIs | requireOperationalBoutique, getOperationalScope | A | A | Single boutique |
| `app/api/inventory/*` | Inventory APIs | requireOperationalBoutique | A | A | Single boutique |
| `app/api/leaves/*` | Leaves APIs | requireOperationalBoutique | A | A | Single boutique |

**Classification legend:**
- **A** = Operational boutique only (single boutique)
- **B** = Explicit multi-boutique allowed (global=true + role)
- **C** = Incorrect implicit multi-boutique (data bleed risk)
- **D** = Duplicate helper / divergence risk

---

## 3) Feature Duplication / Organization

| Area | Duplication | Fix Plan |
|------|-------------|----------|
| `lib/scope/ssot.ts` vs `lib/scope/ssotScope.ts` | Two SSOT files; ssotScope has resolveOperationalBoutiqueOnly, ssot has requireBoutiqueScope | Consolidate: ssot.ts re-exports from ssotScope; add requireOperationalBoutiqueOnly to ssot |
| `lib/boutique/resolveOperationalBoutique.ts` | resolveOperationalBoutiqueId uses UserPreference.operationalBoutiqueId | Keep for getEmployeeBoutiqueIdForUser; data APIs use session (getOperationalScope) |
| `lib/executive/score.ts` | calculateBoutiqueScore(boutiqueIds) | Accepts boutiqueIds from caller; caller must use SSOT |
| `lib/executive/aggregation.ts` | fetchWeekMetrics(boutiqueIds) | Same pattern |
| `lib/metrics/scope.ts` | resolveMetricsScope | Should delegate to SSOT requireOperationalBoutiqueOnly |

---

## Summary Table

| File | Endpoint/Page | Issue | Risk | Fix Plan | Status |
|------|---------------|-------|------|----------|--------|
| `app/api/cron/task-reminders/route.ts` | POST /api/cron/task-reminders | CRON_SECRET fail-open | **P0** | Require secret; 500 if missing | ✅ Fixed |
| `lib/scope/ssot.ts` | N/A | Add requireOperationalBoutiqueOnly, resolveBoutiqueIdsOptionalGlobal | P1 | Added | ✅ Done |
| `lib/metrics/scope.ts` | resolveMetricsScope | Duplicate scope logic | P2 | Delegate to SSOT | ✅ Done |
| `app/api/locale/route.ts` | GET/POST | No auth | P2 | Low risk; optional rate-limit | — |

---

## 4) Hardening Patch — Final Enterprise Closure (2025-02-26)

| Area | Change | Status |
|------|--------|--------|
| **DEMO_VIEWER global guard** | `middleware.ts` blocks POST/PUT/PATCH/DELETE on `/api/**` for DEMO_VIEWER. Exception: `POST /api/auth/logout`. | ✅ Done |
| **Scope leak prevention** | `lib/scope/whereStrict.ts` — `whereBoutiqueStrict(boutiqueIds)` throws if empty; applied at Prisma query source. | ✅ Done |
| **Executive aggregations** | `fetchWeekMetrics`, `fetchDailyRevenueForWeek`, `calculateBoutiqueScore` now require `boutiqueIds`; use `whereBoutiqueStrict`. | ✅ Done |
| **SSOT consolidation** | `lib/scope/ssot.ts` is single source; `ssotScope.ts` deprecated (re-export only). ESLint forbids new ssotScope imports. | ✅ Done |
| **Locale rate limit** | `app/api/locale/route.ts` — IP-based rate limit (30/min); validates allowed locales only (ar, en). | ✅ Done |
| **Tests** | `__tests__/ssot-scope.test.ts` — requireOperationalBoutiqueOnly, resolveBoutiqueIdsOptionalGlobal, whereBoutiqueStrict. `__tests__/executive-insights-scope.test.ts` — single-boutique scope contract. | ✅ Done |

---

## Changed Files (This Audit)

| File | Change |
|------|--------|
| `docs/AUDIT_REPORT.md` | **NEW** — Full audit report |
| `docs/VALIDATION_CHECKLIST.md` | **NEW** — Manual test matrix |
| `app/api/cron/task-reminders/route.ts` | CRON_SECRET required; fail-closed |
| `lib/scope/ssot.ts` | Added requireOperationalBoutiqueOnly, resolveBoutiqueIdsOptionalGlobal |
| `lib/metrics/scope.ts` | Delegates to requireOperationalBoutiqueOnly |
| `.gitignore` | Added __MACOSX |

### Hardening Patch Files

| File | Change |
|------|--------|
| `middleware.ts` | DEMO_VIEWER write-block for /api/** (POST/PUT/PATCH/DELETE) |
| `app/api/internal/session-role/route.ts` | Internal role lookup for middleware |
| `lib/scope/whereStrict.ts` | whereBoutiqueStrict, whereBoutiqueSingle |
| `lib/scope/ssot.ts` | Inlined resolveOperationalBoutiqueOnly, resolveBoutiqueIdsWithOptionalGlobal |
| `lib/scope/ssotScope.ts` | Deprecated; re-exports from ssot |
| `lib/executive/aggregation.ts` | fetchWeekMetrics, fetchDailyRevenueForWeek require boutiqueIds; use whereBoutiqueStrict |
| `lib/executive/score.ts` | calculateBoutiqueScore requires boutiqueIds; use whereBoutiqueStrict |
| `app/api/locale/route.ts` | IP rate limit; allowed locales validation |
| `docs/VALIDATION_CHECKLIST.md` | DEMO_VIEWER middleware source-of-truth note |
| `.eslintrc.json` | no-restricted-imports for ssotScope |
| `__tests__/ssot-scope.test.ts` | SSOT unit tests |
| `__tests__/executive-insights-scope.test.ts` | Executive insights scope contract |
