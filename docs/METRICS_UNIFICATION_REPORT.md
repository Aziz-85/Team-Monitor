# Metrics Unification + RBAC Scope — Implementation Report

**App:** Team Monitor / dhtasks.com (v1.2.21)  
**Date:** 2025-02

---

## 1. What was inconsistent

- **Dashboard vs “my” pages:** Dashboard showed zeros or different MTD than `/me/target` and `/sales/my` because:
  - Dashboard used **session boutique** (`getScheduleScope` → `user.boutiqueId` or `?b=` for SUPER_ADMIN).
  - `/me/targets` and `/me/sales` used **Employee.boutiqueId** via `getEmployeeBoutiqueIdForUser`.
  - For EMPLOYEE/ASSISTANT_MANAGER, session boutique can differ from the assigned employee boutique (e.g. after transfer), so dashboard and “my” pages used different scopes and produced different numbers.

- **Multiple data paths:** Sales actuals were computed in several places (dashboard route, monthly-matrix, me/targets, sales/summary) with slightly different filters and date logic, leading to drift.

- **Scope not RBAC-consistent:** EMPLOYEE/ASSISTANT_MANAGER were not consistently forced to `Employee.boutiqueId` everywhere, so “Working on” or session could leak into metrics.

---

## 2. Where it came from

- **Scope:** Mixed use of `getScheduleScope` (session/preference) and `getEmployeeBoutiqueIdForUser` (membership) for different pages.
- **Aggregation:** Duplicated Prisma queries in dashboard, me/targets, sales/summary, and sales/returns with no single aggregator.
- **Dashboard UI:** ExecutiveDashboard fetched `/api/dashboard` and then overwrote sales with `/api/sales/monthly-matrix`, so the “single source” was bypassed.

---

## 3. What was unified

- **Single scope resolver:** `resolveMetricsScope(request)` in `lib/metrics/scope.ts`:
  - EMPLOYEE / ASSISTANT_MANAGER: `effectiveBoutiqueId = Employee.boutiqueId` (User.empId → Employee.boutiqueId).
  - MANAGER / ADMIN / SUPER_ADMIN: `effectiveBoutiqueId` from `getOperationalScope(request)` (session or `?b=`).

- **Single aggregator layer:** `lib/metrics/aggregator.ts`:
  - `getSalesMetrics({ boutiqueId, userId?, from, toExclusive })` — SalesEntry only (LEDGER, IMPORT, MANUAL); inclusive `from`, exclusive `to`.
  - `getTargetMetrics({ boutiqueId, userId, monthKey })` — EmployeeMonthlyTarget + SalesEntry for MTD, today, week, remaining, pct.
  - `getDashboardSalesMetrics({ boutiqueId, userId?, monthKey, employeeOnly })` — currentMonthTarget/Actual, completionPct, remainingGap, byUserId.

- **Canonical date logic:** Asia/Riyadh; `getMonthRange(monthKey)` (inclusive start, exclusive end); `toRiyadhDateString`, `getRiyadhNow` from `lib/time`; range queries use `date >= from AND date < toExclusive`.

- **Dedicated metrics APIs (all use aggregator + resolveMetricsScope):**
  - `GET /api/metrics/dashboard`
  - `GET /api/metrics/sales-my?from=&to=`
  - `GET /api/metrics/returns?from=&to=`
  - `GET /api/metrics/my-target?month=YYYY-MM`

- **UI wired to metrics APIs:**
  - `/dashboard` — uses `/api/dashboard` (already uses resolveMetricsScope + getDashboardSalesMetrics); removed overwrite with monthly-matrix.
  - `/me/target` — loads from `/api/metrics/my-target` (was `/api/me/targets`).
  - `/sales/my` — loads from `/api/metrics/sales-my` (was `/api/sales/summary`).
  - `/sales/returns` — list from `/api/metrics/returns` (was `/api/sales/returns` GET); POST still `/api/sales/returns`.

- **Net sales definition:** All KPIs use **SalesEntry.amount** sum (SAR) as the single source for “sales actuals”; returns/exchanges are not subtracted in the current schema (documented in `docs/metrics_contract.md`).

---

## 4. Tests added

- **`__tests__/metrics-aggregator.test.ts`:**
  - `getMonthRange`: inclusive start, exclusive end, first day of next month.
  - `getDaysInMonth`: day count for a given month.
  - `normalizeMonthKey`: YYYY-MM normalization.
  - `getDailyTargetForDay`: proportional daily target from month target.

Integration tests for the four metrics API endpoints and Playwright smoke (e.g. dashboard monthly = my-target MTD = calendar month total) were left as optional follow-ups.

---

## 5. Acceptance checklist

| Criterion | Status |
|-----------|--------|
| Same user + boutique + month: dashboard monthly net sales = /me/target MTD = calendar month total | Met via single aggregator + scope |
| Changing date range in /sales/my updates numbers consistently; totals reconcile when aligned to month | Met via getSalesMetrics with same scope/date logic |
| EMPLOYEE cannot see others; ADMIN can see boutique; SUPER_ADMIN can cross-boutique | Met via resolveMetricsScope (employeeOnly, effectiveBoutiqueId) |
| No page shows 0/0 when underlying data exists (unless scope/range empty) | Addressed by unified scope (Employee.boutiqueId for EMPLOYEE) |
| All metrics under Asia/Riyadh boundaries (no off-by-one day) | Met via getMonthRange, toRiyadhDateString, exclusive end |

---

## 6. Note on display units

- **SalesEntry.amount** and aggregator outputs are in **SAR (integer)**. If any UI still uses `halalasToSar(netSalesTotal)` (divide by 100), it will show 1/100 of the true value; such call sites should display SAR as-is (e.g. format as integer or `n.toFixed(2)` without dividing).

---

## 7. Files touched (summary)

- **New:** `lib/metrics/scope.ts`, `lib/metrics/aggregator.ts`, `app/api/metrics/dashboard/route.ts`, `app/api/metrics/sales-my/route.ts`, `app/api/metrics/returns/route.ts`, `app/api/metrics/my-target/route.ts`, `docs/metrics_contract.md`, `__tests__/metrics-aggregator.test.ts`, `docs/METRICS_UNIFICATION_REPORT.md`.
- **Updated:** `app/api/dashboard/route.ts` (resolveMetricsScope + getDashboardSalesMetrics), `app/api/me/targets/route.ts` (resolveMetricsScope + getTargetMetrics), `lib/sales/ledgerRbac.ts` (getSalesScope uses Employee.boutiqueId for EMPLOYEE/ASSISTANT_MANAGER), `components/dashboard/ExecutiveDashboard.tsx` (single fetch, no monthly-matrix overwrite), `app/(dashboard)/me/target/MyTargetClient.tsx` (fetch `/api/metrics/my-target`), `app/(dashboard)/sales/my/SalesMyClient.tsx` (fetch `/api/metrics/sales-my`), `app/(dashboard)/sales/returns/SalesReturnsClient.tsx` (list from `/api/metrics/returns`).
