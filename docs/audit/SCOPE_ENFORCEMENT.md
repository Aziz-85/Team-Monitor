# Scope Enforcement — Per-Module Reference

**Generated:** 2025-02-14 | **Purpose:** P0 — Document where scope comes from and how it is applied in each module.

---

## Single Source of Truth for Operational Scope

| Concept | Source | Used By |
|--------|--------|--------|
| **Current operational boutique** | `User.boutiqueId` (session) | All operational APIs via `getOperationalScope()` / `requireOperationalBoutique()` / `getScheduleScope()` |
| **Allowed boutiques for user** | `UserBoutiqueMembership` (canAccess: true, boutique.isActive) | Login/assignment; `resolveOperationalBoutiqueId`; admin memberships |
| **Employee roster per boutique** | `Employee.boutiqueId` | Schedule, inventory, sales coverage, tasks, leaves (legacy Leave via employee relation) |

**Consistency:** Operational scope is **session-bound**. `User.boutiqueId` is the single value used for filtering in Schedule, Sales, Inventory, Tasks, and Leaves. Boutique switching is disabled (`POST /api/me/operational-boutique` returns 403). `UserBoutiqueMembership` defines which boutiques a user may be assigned to; the actual "current" boutique is stored on `User.boutiqueId`.

---

## Per-Module Scope

### Schedule

| API / Layer | Scope source | How applied |
|-------------|-------------|-------------|
| `getScheduleScope()` | `getOperationalScope()` → `User.boutiqueId` | Returns `boutiqueId`, `boutiqueIds: [boutiqueId]` |
| GET /api/schedule/week/grid | `getScheduleScope()` | Grid + guest overrides filtered by `boutiqueId: { in: scheduleScope.boutiqueIds }` |
| GET/POST /api/schedule/guests | `getScheduleScope()` | Host shifts: `boutiqueId in scope.boutiqueIds`; guests: `employee.boutiqueId notIn scope.boutiqueIds` |
| GET /api/schedule/guest-employees | `getScheduleScope()` | Employees with `boutiqueId: { notIn: scope.boutiqueIds }` |
| GET /api/schedule/external-coverage/employees | Schedule scope | `buildEmployeeWhereForOperational([scopeId])` |
| Week status, lock, approve | Schedule scope | `getWeekStatus(weekStart, boutiqueId)` etc. |

**Helpers:** `lib/scope/scheduleScope.ts`, `lib/services/roster.ts` (pass `boutiqueIds`), `lib/services/coverageValidation.ts` (pass `boutiqueIds`).

---

### Sales

| API / Layer | Scope source | How applied |
|-------------|-------------|-------------|
| POST /api/sales/entry | `requireOperationalBoutique()` | `scopeId` for employee check (`buildEmployeeWhereForOperational([scopeId])`) and ledger/summary |
| GET /api/sales/coverage | `requireOperationalBoutique()` | Employees + leave by `scopeId`; `buildEmployeeWhereForOperational([scopeId])`, leave `employee.boutiqueId: scopeId` |
| GET /api/me/sales | `getSessionUser()` | `boutiqueId` from `getEmployeeBoutiqueIdForUser(user.id) ?? user.boutiqueId`; filter SalesEntry by `userId` + `boutiqueId` |
| Monthly matrix, import, compare | Operational scope or admin | Matrix/import use operational or explicit scopeId |

---

### Inventory

| API / Layer | Scope source | How applied |
|-------------|-------------|-------------|
| GET/POST /api/inventory/daily | `requireOperationalBoutique()` | `boutiqueId` for run, queue, employees (`employee.findMany({ where: { boutiqueId, empId: { in: empIds } } })`) |
| GET/POST /api/inventory/absent | `requireOperationalBoutique()` | `where: { boutiqueId, date }`; employee check `boutiqueId` |
| GET /api/inventory/zones/weekly | Operational scope | Queries filtered by zone/boutique |
| Complete-all, daily complete | Operational scope | Run/zone filtered by boutique |

---

### Tasks

| API / Layer | Scope source | How applied |
|-------------|-------------|-------------|
| GET /api/tasks/list | `requireOperationalScope()` | `where: { active: true, boutiqueId: scope.boutiqueId }` |
| GET /api/tasks/monitor | `getOperationalScope()` + assert | `where: { active: true, boutiqueId: scope.boutiqueId }`; employees via `buildEmployeeWhereForOperational(scope.boutiqueIds)` |
| GET /api/tasks/my-today | Operational scope | Tasks filtered by boutiqueId |

---

### Leaves

| API / Layer | Scope source | How applied |
|-------------|-------------|-------------|
| GET /api/leaves (legacy) | `requireOperationalBoutique()` | `where: { employee: { boutiqueId: scopeId } }` + filters |
| POST /api/leaves (legacy) | `requireOperationalBoutique()` | Employee must match `empId` + `boutiqueId: scopeId` |
| GET /api/leaves/requests | `requireOperationalBoutique()` | `where: { boutiqueId }` on LeaveRequest |

---

### Dashboard

| Path | Scope source | How applied |
|------|-------------|-------------|
| Employee (self) | `getScheduleScope()` | `empBoutiqueId = user.boutiqueId ?? boutiqueId`; targets, sales, tasks, roster by empBoutiqueId |
| Manager/Admin | `getScheduleScope()` | `boutiqueId` used for: salesWhere, empTargets, tasks, zoneRuns, pendingLeaves (employee.boutiqueId), employeesForTable, zoneAssignments (zone.boutiqueId), rosterForDate(options), validateCoverage(options) |

---

## Admin vs Operational

| Area | Scope | Note |
|------|--------|-----|
| /api/admin/employees | Admin filter / selection | May be multi-boutique for ADMIN; verify each query uses intended scope |
| /api/admin/memberships | User + boutique | UserBoutiqueMembership CRUD |
| /api/admin/targets, sales-import | Admin | Scope from request or admin preference |
| /api/debug/* | Dev only | May bypass scope |

---

## Cross-Boutique Leakage — Test Checklist

1. **Setup:** Two boutiques A and B; Manager (or ASSISTANT_MANAGER) account bound to boutique A only (`User.boutiqueId = A`, membership only A).
2. **Schedule:** Log in as Manager A. Open schedule view/edit for current week. Assert: grid shows only employees of A; guest list shows only guests hosted by A; no employees from B in roster.
3. **Sales:** Enter daily sales; assert only employees of A in dropdown; no sales from B visible in daily or monthly.
4. **Inventory:** Open inventory daily and absent; assert only employees of A; no runs/zones for B.
5. **Tasks:** Open tasks list and monitor; assert only tasks for boutique A; no tasks from B.
6. **Leaves:** Open leaves (legacy) and leave requests; assert only leaves for employees of A; creating leave for an employee of B returns 400.
7. **Dashboard:** Assert dashboard shows only one boutique’s data: employees, sales, tasks, zones, pending leaves count for A only.

---

## Files to Audit (Reference)

- `lib/scope/*` — operationalScope, scheduleScope, requireOperationalBoutique, resolveScope
- `app/api/schedule/**/route.ts` — all use getScheduleScope() or equivalent
- `app/api/sales/**/route.ts` — requireOperationalBoutique or explicit scopeId
- `app/api/inventory/**/route.ts` — requireOperationalBoutique
- `app/api/tasks/**/route.ts` — requireOperationalScope / getOperationalScope
- `app/api/leaves/route.ts`, `app/api/leaves/requests/route.ts` — requireOperationalBoutique, filter by employee.boutiqueId or LeaveRequest.boutiqueId
- `app/api/dashboard/route.ts` — getScheduleScope(); all manager-path queries use boutiqueId
