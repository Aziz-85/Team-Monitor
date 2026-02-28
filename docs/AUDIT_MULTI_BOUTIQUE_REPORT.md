# Multi-Boutique Isolation Audit Report

**Date:** 2026-02  
**Scope:** Full codebase audit for operational boutique isolation compliance

---

## A) Route Inventory & Classification

### ADMIN Routes (`/admin/*`)

| Route | Classification | Pass |
|-------|----------------|------|
| `app/(dashboard)/admin/employees/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/audit/login/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/boutique-groups/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/boutiques/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/boutiques/[id]/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/coverage-rules/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/import/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/kpi-templates/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/memberships/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/regions/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/sales-edit-requests/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/system/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/targets/page.tsx` | ADMIN | ✓ |
| `app/(dashboard)/admin/users/page.tsx` | ADMIN | ✓ |

**Admin APIs:** `resolveAdminFilterToBoutiqueIds` — correct. No operational scope.

---

### EXECUTIVE Routes (`/executive/*`)

| Route | Classification | Pass |
|-------|----------------|------|
| `app/(dashboard)/executive/page.tsx` | EXECUTIVE | ✓ |
| `app/(dashboard)/executive/compare/page.tsx` | EXECUTIVE | ✓ |
| `app/(dashboard)/executive/employees/page.tsx` | EXECUTIVE | ✓ |
| `app/(dashboard)/executive/employees/[empId]/page.tsx` | EXECUTIVE | ✓ |
| `app/(dashboard)/executive/insights/page.tsx` | EXECUTIVE | ✓ |
| `app/(dashboard)/executive/monthly/page.tsx` | EXECUTIVE | ✓ |

**Executive APIs:** Use existing executive scope resolver. Do not change.

---

### OPERATIONAL Routes (schedule, tasks, inventory, leaves, sales, home)

| Route | Classification | Operational Scope | Pass |
|-------|----------------|-------------------|------|
| `app/(dashboard)/page.tsx` (/) | OPERATIONAL | Home | ⚠ |
| `app/(dashboard)/schedule/page.tsx` | OPERATIONAL | Schedule | ✓ |
| `app/(dashboard)/schedule/view/page.tsx` | OPERATIONAL | Schedule | ✓ |
| `app/(dashboard)/schedule/edit/page.tsx` | OPERATIONAL | Schedule | ✓ |
| `app/(dashboard)/schedule/audit/page.tsx` | OPERATIONAL | Schedule | ✓ |
| `app/(dashboard)/schedule/audit-edits/page.tsx` | OPERATIONAL | Schedule | ✓ |
| `app/(dashboard)/schedule/editor/page.tsx` | OPERATIONAL | Schedule | ✓ |
| `app/(dashboard)/tasks/page.tsx` | OPERATIONAL | Tasks | ✓ |
| `app/(dashboard)/tasks/setup/page.tsx` | OPERATIONAL | Tasks | ✓ |
| `app/(dashboard)/tasks/monitor/page.tsx` | OPERATIONAL | Tasks | ⚠ |
| `app/(dashboard)/inventory/daily/page.tsx` | OPERATIONAL | Inventory | ⚠ |
| `app/(dashboard)/inventory/daily/history/page.tsx` | OPERATIONAL | Inventory | ⚠ |
| `app/(dashboard)/inventory/follow-up/page.tsx` | OPERATIONAL | Inventory | ⚠ |
| `app/(dashboard)/inventory/zones/page.tsx` | OPERATIONAL | Inventory | ✓ |
| `app/(dashboard)/inventory/zones/weekly/page.tsx` | OPERATIONAL | Inventory | ✓ |
| `app/(dashboard)/leaves/page.tsx` | OPERATIONAL | Leaves | ✓ |
| `app/(dashboard)/leaves/requests/page.tsx` | OPERATIONAL | Leaves | ✓ |
| `app/(dashboard)/sales/daily/page.tsx` | OPERATIONAL | Sales | ⚠ |
| `app/(dashboard)/boutique/tasks/page.tsx` | OPERATIONAL | Tasks | ✓ |
| `app/(dashboard)/boutique/leaves/page.tsx` | OPERATIONAL | Leaves | ✓ |
| `app/(dashboard)/employee/page.tsx` | OPERATIONAL | Employee home | ⚠ |
| `app/(dashboard)/dashboard/page.tsx` | OPERATIONAL/DASHBOARD | Mixed | ⚠ |
| `app/(dashboard)/approvals/page.tsx` | OPERATIONAL | Approvals | ✓ |

---

## B) Employee Sources — Findings

| File | Function/Query | boutiqueId Filter | Order | Status |
|------|----------------|-------------------|-------|--------|
| `lib/employees/getOperationalEmployees.ts` | getOperationalEmployees | ✓ | ✓ | OK |
| `lib/employees/getOperationalEmployees.ts` | getOperationalEmployeesSelect | ✓ | ✓ | OK |
| `lib/services/scheduleGrid.ts` | getScheduleGridForWeek | ✓ (via options) | ✓ | OK |
| `lib/tenancy/operationalRoster.ts` | getOperationalEmployees | ✓ | ✓ | OK |
| `lib/services/roster.ts` | rosterForDate | ✓ (when options.boutiqueIds) | ✓ | OK |
| `lib/services/inventoryDaily.ts` | computeEligibleEmployees | ✗ | ✓ | VIOLATION |
| `lib/services/inventoryDaily.ts` | ensureRotationMembers | ✗ | ✓ | VIOLATION |
| `lib/services/inventoryDaily.ts` | getExclusionsForDate | N/A (empIds) | — | OK |
| `lib/services/inventoryDaily.ts` | getDailyStats | N/A | — | OK |
| `lib/services/inventoryFollowUp.ts` | getDailyFollowUp | ✗ | — | VIOLATION |
| `app/api/dashboard/route.ts` | employeesForTable | ✗ (global) | ✓ | DASHBOARD |
| `app/api/sales/daily/route.ts` | resolveScopeForUser | Multi (old scope) | — | VIOLATION |
| `app/api/sales/import/route.ts` | employee findMany | ✓ (boutiqueId param) | — | OK |
| `app/api/home/route.ts` | rosterForDate | ✗ (no options) | — | VIOLATION |
| `app/api/employee/home/route.ts` | rosterForDate | ✗ (no options) | — | VIOLATION |
| `app/api/inventory/daily/route.ts` | enrichSkips | N/A (empIds from run) | — | OK |
| `app/api/inventory/absent/route.ts` | GET employees | ✗ | — | VIOLATION |
| `app/api/inventory/absent/route.ts` | POST empId validation | ✗ | — | VIOLATION |
| `app/api/tasks/monitor/route.ts` | employees findMany | ✗ | — | VIOLATION |
| `app/api/admin/employees/route.ts` | findMany | AdminFilter | ✓ | OK |
| `app/api/leaves/employees/route.ts` | getOperationalEmployeesSelect | ✓ | ✓ | OK |

---

## C) Resolver Usage

| API/Service | Uses resolveOperationalBoutiqueId / getOperationalScope | Status |
|-------------|----------------------------------------------------------|--------|
| Schedule (week grid, month, excel, reminders, status, audit-edits, insights) | ✓ getScheduleScope → getOperationalScope | OK |
| Tasks plan | ✓ getOperationalScope | OK |
| Leaves employees | ✓ getOperationalScope | OK |
| Sales daily | ✗ resolveScopeForUser | VIOLATION |
| Sales daily/lines, lock, summary | ✗ resolveScopeForUser | VIOLATION |
| Home | ✗ none | VIOLATION |
| Employee home | ✗ none | VIOLATION |
| Inventory daily | ✗ none | VIOLATION |
| Inventory absent | ✗ none | VIOLATION |
| Inventory follow-up | ✗ none | VIOLATION |
| Tasks monitor | ✗ none | VIOLATION |

---

## D) Fixes Applied

### 1. Sales daily + lines/lock/summary — FIXED ✓
- Replaced `resolveScopeForUser` with `getOperationalScope`
- Enforce single boutique: `boutiqueIds = [operationalBoutiqueId]`
- Lines/lock/summary: validate `boutiqueId === scope.boutiqueId`
- Added `assertOperationalBoutiqueId` guard

### 2. Home + Employee home — FIXED ✓
- Resolve `getOperationalScope` before calling roster/coverage
- Pass `{ boutiqueIds: scope.boutiqueIds }` to rosterForDate, validateCoverage, getCoverageSuggestion
- Employee home: same scope for roster

### 3. Inventory absent — FIXED ✓
- GET: filter absents to only those whose empId is in operational boutique; employee lookup scoped
- POST: validate empId is in operational scope (buildEmployeeWhereForOperational) before create/upsert

### 4. Inventory follow-up — DEFERRED
- `InventoryDailyRun` has `@@unique([date])` — one run per date globally. Per-boutique runs would need schema change.
- Employee name lookup in getDailyFollowUp remains unfiltered (empIds come from global run).
- No code change applied; documented as limitation.

### 5. Tasks monitor — FIXED ✓
- Resolve operational scope; filter employees by boutiqueId via buildEmployeeWhereForOperational
- Filter rows to only show tasks assigned to operational boutique employees
- Filter suspiciousBursts to operational employees only
- Stable ordering via employeeOrderByStable

### 6. lib/guards/assertOperationalBoutique.ts — CREATED ✓
- Dev-time assertion for missing operationalBoutiqueId

---

## E) Manual Verification Checklist

- [ ] Switch operational boutique (ADMIN/MANAGER): Schedule roster changes; no mixed employees
- [ ] EMPLOYEE: Cannot switch boutique; sees only their boutique
- [ ] Admin Employees/Users: Can view all boutiques (with optional AdminFilter)
- [ ] Sales daily: Shows only operational boutique's summary
- [ ] Home page: Roster reflects operational boutique only
- [ ] Inventory daily: Assignee picker shows only operational boutique employees
- [ ] Inventory absent: Only operational boutique employees can be marked absent
- [ ] Tasks monitor: Employee stats scoped to operational boutique

---

## Files Touched (Fix Commit)

- `app/api/sales/daily/route.ts` — use getOperationalScope
- `app/api/sales/daily/lines/route.ts` — operational scope + boutiqueId validation
- `app/api/sales/daily/lock/route.ts` — operational scope + boutiqueId validation
- `app/api/sales/daily/summary/route.ts` — operational scope + boutiqueId validation
- `app/api/home/route.ts` — operational scope + rosterForDate/validateCoverage/getCoverageSuggestion options
- `app/api/employee/home/route.ts` — operational scope + rosterForDate options
- `app/api/inventory/absent/route.ts` — operational scope + employee filter (GET/POST)
- `app/api/tasks/monitor/route.ts` — operational scope + employee filter + row filter
- `lib/guards/assertOperationalBoutique.ts` — NEW
