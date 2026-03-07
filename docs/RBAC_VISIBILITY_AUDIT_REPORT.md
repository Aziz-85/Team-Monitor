# Full-Site RBAC / Visibility Audit Report

**Date:** 2026-02-26  
**Project:** Team Monitor / Dhahran Team  
**Stack:** Next.js App Router, TypeScript strict, Prisma, RBAC + Multi-Boutique

---

## 1) Access Matrix

| Page/API | Intended Roles | Current Status | Issues Found | Fixed? |
|----------|----------------|----------------|--------------|--------|
| `/dashboard` | All authenticated | ✅ | None | — |
| `/api/dashboard` | All authenticated | ✅ | Employee path returns own data only; manager path boutique-scoped | — |
| `/sales/my` | EMPLOYEE | ✅ | Page redirects non-EMPLOYEE; API uses resolveMetricsScope (employeeOnly) | — |
| `/api/sales/my/monthly` | EMPLOYEE | ✅ | resolveMetricsScope + employeeOnly check; userId from session | — |
| `/api/metrics/sales-my` | All (employee sees own) | ✅ | resolveMetricsScope; employeeOnly uses userId | — |
| `/api/sales/daily` (GET) | MANAGER, ASSISTANT_MANAGER, ADMIN, SUPER_ADMIN | ⚠️→✅ | **P0:** EMPLOYEE could see colleagues' sales (lines with employeeId, amountSar) | **Yes** |
| `/api/sales/daily/lines` (POST) | ADMIN, MANAGER | ✅ | requireRole already | — |
| `/api/sales/summary` | ASSISTANT_MANAGER+ | ✅ | getSalesScope; employeeOnly filters by userId | — |
| `/api/sales/ledger` | getSalesScope | ✅ | employeeOnly for EMPLOYEE | — |
| `/schedule/view` | All | ✅ | getScheduleScope; boutique from session | — |
| `/api/schedule/week/grid` | EMPLOYEE, MANAGER, ASSISTANT_MANAGER, ADMIN | ✅ | getScheduleScope; boutiqueIds from session | — |
| `/me/target` | All with boutique | ✅ | resolveMetricsScope; returns own + branch target | — |
| `/api/metrics/my-target` | All with boutique | ✅ | resolveMetricsScope; getTargetMetrics(scope.userId) | — |
| `/api/target/my/daily` | EMPLOYEE only | ✅ | employeeOnly check; scope.userId | — |
| `/api/target/boutique/daily` | MANAGER, ADMIN, SUPER_ADMIN | ✅ | Role check + scope.effectiveBoutiqueId | — |
| `/api/area/*` | AREA_MANAGER, SUPER_ADMIN | ✅ | assertAreaManagerOrSuperAdmin | — |
| `/api/executive` | MANAGER, ADMIN, SUPER_ADMIN | ✅ | Role check + resolveOperationalBoutiqueOnly | — |
| `/api/admin/*` | Per route | ✅ | requireRole / assertAreaManagerOrSuperAdmin | — |
| `/api/leaves/*` | Per route | ✅ | Role + boutique scope | — |
| `/api/inventory/*` | Per route | ✅ | requireOperationalBoutique / role checks | — |
| `/api/tasks/*` | Per route | ✅ | requireOperationalScope / role checks | — |

---

## 2) Top Security Findings

### P0 — CRITICAL (Fixed)

| Route | Cause | Fix |
|-------|-------|-----|
| `GET /api/sales/daily` | No role check; EMPLOYEE could call API directly and receive daily sales summaries including `lines` with `employeeId` and `amountSar` per colleague | Added `requireRole(['MANAGER','ASSISTANT_MANAGER','ADMIN','SUPER_ADMIN'])`; EMPLOYEE now receives 403 with message to use My Sales |

### P1 — None identified

### P2 — Minor / Informational

| Item | Notes |
|------|-------|
| RouteGuard is client-side | Page access uses `useEffect` + redirect; brief flash possible. Backend APIs enforce independently. |
| DEMO_VIEWER + Executive | Nav shows executive for DEMO_VIEWER; page redirects non-MANAGER/ADMIN/SUPER_ADMIN to dashboard. DEMO_VIEWER gets redirect. No data leak. |

---

## 3) Patched Files

| File | Summary |
|------|---------|
| `app/api/sales/daily/route.ts` | Added `requireRole(DAILY_SALES_VIEW_ROLES)` to GET handler; EMPLOYEE receives 403 |

---

## 4) Final Verification Checklist

| Requirement | Status |
|-------------|--------|
| Employee sees own sales only | ✅ `/sales/my`, `/api/sales/my/monthly`, `/api/metrics/sales-my` use `resolveMetricsScope` with `employeeOnly`; all queries filter by `scope.userId` |
| Employee sees own branch schedule | ✅ `getScheduleScope` / `getOperationalScope` derive boutique from session; no client-controlled boutiqueId |
| Employee sees branch target | ✅ `/api/metrics/my-target` returns `boutiqueTarget` from `getTargetMetrics` |
| Employee sees own target | ✅ Same API returns `monthTarget` (own) |
| Employee sees branch achievement-to-date | ✅ `mtdSales` in my-target is own; branch totals from boutique-level targets; dashboard employee path shows own only |
| No privilege escalation via URL/API tampering | ✅ Boutique scope from session/SSOT; `boutiqueId` in query validated against allowed scope; `GET /api/sales/daily` now role-restricted |

---

## 5) Architecture Summary

- **Auth:** `lib/auth.ts` — `getSessionUser`, `requireRole`, `requireSession`
- **Permissions:** `lib/permissions.ts` — `ROLE_ROUTES`, `canAccessRoute`, schedule flags
- **RBAC:** `lib/rbac.ts` — `assertAreaManagerOrSuperAdmin`, schedule assertions
- **Scope SSOT:** `lib/scope/ssot.ts` — `requireOperationalBoutiqueOnly`, `requireBoutiqueScope`
- **Metrics scope:** `lib/metrics/scope.ts` — `resolveMetricsScope` (delegates to SSOT; `employeeOnly` for EMPLOYEE)
- **Sales scope:** `lib/sales/ledgerRbac.ts` — `getSalesScope` (employeeOnly, canImport, etc.)
- **Nav:** `lib/navConfig.ts` — `getNavGroupsForUser` filters by role + schedule permissions
- **RouteGuard:** Client-side redirect when pathname not in `canAccessRoute(role, pathname)`; backend enforces independently

---

## 6) Attack-Style Test Results

| Attack | Result |
|--------|--------|
| Direct URL to `/sales/daily` as EMPLOYEE | RouteGuard redirects (EMPLOYEE not in ROLE_ROUTES for /sales/daily). If bypassed, API now returns 403 |
| `GET /api/sales/daily?date=...` as EMPLOYEE | **Before:** 200 + full lines. **After:** 403 |
| Query tampering `?boutiqueId=other` | `getOperationalScope` / `getSalesScope` ignore or validate; effective boutique from session |
| `GET /api/sales/summary` as EMPLOYEE | getSalesScope sets employeeOnly; `whereBase.userId = scope.userId`; own data only |
| `GET /api/executive` as EMPLOYEE | 403 (role check) |
| `GET /api/schedule/week/grid?boutiqueId=other` | boutiqueIds from getScheduleScope (session); param ignored |
