# Phase 2 — Final Hardening Audit: Operational Identity Classification

**Date:** 2026-02-26  
**Goal:** Ensure no operational module can accidentally expose technical/system accounts. All employee/user retrieval for business use must pass through the centralized classification layer (`lib/userClassification.ts` / `lib/systemUsers.ts`).

---

## A) SAFE ALREADY

Files that were already using centralized filtering before this pass:

| File | Usage |
|------|--------|
| `lib/employees/getOperationalEmployees.ts` | Source of `getOperationalEmployees` / `getOperationalEmployeesSelect`; uses `filterOperationalEmployees` after findMany |
| `lib/tenancy/operationalRoster.ts` | All findMany paths use `filterOperationalEmployees` or exclude system-only |
| `app/api/admin/employees/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/area/employees/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/dashboard/route.ts` | `employeesForTable` uses `filterOperationalEmployees(employeesForTableRaw)` |
| `app/api/schedule/guest-employees/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/schedule/guests/candidates/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/inventory/daily/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/inventory/absent/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/sales/coverage/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/sales/import/template/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/sales/compare/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/admin/generate-employee-targets/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/tasks/monitor/route.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `lib/services/scheduleGrid.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `lib/services/roster.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `lib/services/planner.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `lib/services/inventoryFollowUp.ts` | Uses `filterOperationalEmployees` on empListRaw and nested findMany |
| `lib/services/inventoryDaily.ts` | Main roster path (line ~220) uses `filterOperationalEmployees(employeesRaw)`; `computeEligibleEmployees` feeds from filtered list; `ensureRotationMembers` uses empIds from `computeEligibleEmployees` (already operational) |
| `lib/team/teamToday.ts` | Uses `filterOperationalEmployees(employeesRaw)` |
| `app/api/leaves/employees/route.ts` | Uses `getOperationalEmployeesSelect(scope.boutiqueId)` |

---

## B) FIXED NOW

Files updated in this pass to use centralized filtering:

| File | Change |
|------|--------|
| `app/api/schedule/external-coverage/employees/route.ts` | Added `filterOperationalEmployees(employeesRaw)`; select includes `isSystemOnly` |
| `app/api/area/targets/employee-targets/route.ts` | Added `filterOperationalEmployees(employeesInBoutiqueRaw)`; select includes `isSystemOnly` |
| `app/api/sales/import/export/route.ts` | Added `filterOperationalEmployees(employeesRaw)`; select includes `isSystemOnly` |
| `app/api/sales/import-ledger/route.ts` | Name-resolution path: `findMany` for name match now uses `filterOperationalEmployees(allRaw)`; select includes `isSystemOnly` |
| `app/api/schedule/week/grid/route.ts` | Pending guest employees: wrapped findMany result in `filterOperationalEmployees`; select includes `isSystemOnly` |
| `app/api/schedule/guests/route.ts` | Pending guest employees: same as week/grid |
| `app/api/sales/import/route.ts` | Both findMany (employeesInBoutique and allEmpBoutique) now filtered via `filterOperationalEmployees`; selects include `isSystemOnly` |
| `app/api/sales/import/yearly/route.ts` | `employeesInBoutique` from findMany replaced with `filterOperationalEmployees(employeesInBoutiqueRaw)`; select includes `isSystemOnly` |
| `app/api/sales/import/monthly-sheet/route.ts` | `employeesInBoutique` from findMany replaced with `filterOperationalEmployees(employeesInBoutiqueRaw)`; select includes `isSystemOnly` |
| `app/api/sales/monthly-matrix/route.ts` | `activeEmployees` and `allEmployeesByEmpId` both built from `filterOperationalEmployees(...)`; selects include `isSystemOnly` |
| `app/api/import/monthly-matrix/route.ts` | Employees for header resolution: `filterOperationalEmployees(employeesRaw)`; select includes `isSystemOnly` |
| `app/api/executive/employees/annual/route.ts` | Employee list for annual report: `filterOperationalEmployees(employeesRaw)`; select includes `isSystemOnly` |
| `app/api/tasks/export-weekly/route.ts` | Employees for email resolution in export: `filterOperationalEmployees(employeesRaw)`; select includes `isSystemOnly` |
| `lib/sales/matrixImportParse.ts` | Header-to-employee resolution: `filterOperationalEmployees(employeesRaw)`; select includes `isSystemOnly` |
| `lib/services/inventoryDaily.ts` | `getExclusionsWithNames`: employees for name resolution filtered; `getCompletionCountsByEmployee`: employees for completion list filtered; selects include `isSystemOnly` |

---

## C) ADMIN EXCEPTIONS

Paths intentionally left unfiltered (admin/technical context; technical accounts may remain visible):

| File | Reason |
|------|--------|
| `app/api/admin/memberships/route.ts` | User/role management; technical accounts must remain visible for access control |
| `app/api/admin/users/route.ts` | Admin user list |
| `app/api/admin/delegations/users/route.ts` | Admin delegation targets |
| `app/api/admin/sales-import/route.ts` | Admin-only sales import; `getUserIdToBoutiqueId` resolves any user (including technical) for mapping |

---

## D) MANUAL REVIEW

Paths that are ambiguous or constrained by caller/context; left as-is with explicit classification:

| File | Location | Classification | Notes |
|------|----------|----------------|--------|
| `lib/services/scheduleApply.ts` | findMany for `empIdsInChanges` | **Caller-driven** | empIds come from schedule edit payload; grid is already built from filtered roster. No change applied; if a system empId were ever sent, it would simply not be in the resolved map and session boutique would be used. |
| `lib/services/employeeTeam.ts` | findMany for fallback team by empIds | **Caller-driven** | empIds passed in by callers (e.g. schedule grid, which is filtered). No change. |
| `lib/sales-target-presence.ts` | findMany for weeklyOff/boutique by empIds | **Caller-driven** | empIds provided by caller (target/distribution); callers use operational lists. No change. |
| `app/api/audit/route.ts` | findMany for `targetEmployees` | **INTERNAL/AUDIT** | Audit log display; may intentionally show all actors. Left unfiltered for audit completeness. |
| `lib/sync/exportSiteTasks.ts` | findMany for employees by boutique | **INTERNAL/SYNC** | Export/sync; not user-facing operational UI. Could be filtered in future if sync should exclude technical. |
| `lib/sync/plannerExportV2.ts` | findMany for employees | **INTERNAL/SYNC** | Same as above. |
| `scripts/*` (e.g. `reset-for-production`, `list-employees-by-boutique`, `backfill-sales-entry-boutique`) | findMany in scripts | **INTERNAL** | One-off/seed scripts; no operational UI. |

---

## E) FINAL CONFIRMATION

- **No operational path bypasses centralized classification.**  
  All UI-facing and business-facing employee lists (dropdowns, KPIs, reports, schedule grids, guest lists, sales imports/exports, targets, inventory, tasks export, executive annual) now use either:
  - `getOperationalEmployees` / `getOperationalEmployeesSelect` / `getOperationalEmpIds` from `lib/employees/getOperationalEmployees.ts` or `lib/tenancy/operationalRoster.ts`, or  
  - `filterOperationalEmployees` after `prisma.employee.findMany` with `isSystemOnly` (and where needed `user`) in the select.

- **Technical/system accounts:**  
  - Do **not** appear in any operational UI (schedules, sales matrix, targets, area employees, external coverage dropdown, guest candidates, dashboard table, inventory daily/absent, task monitor, executive annual, etc.).  
  - Do **not** affect KPIs, headcount, targets, sales, or staffing calculations.  
  - Remain available only in admin/membership and audit contexts where intended.

- **Architecture:**  
  - No schema or auth changes.  
  - No parallel classification logic; single source of truth remains `lib/userClassification.ts` (re-exported by `lib/systemUsers.ts`).  
  - Minimal, production-safe edits; existing helpers reused throughout.

---

## Optional helper (not added)

A shared `buildOperationalEmployeeWhere()` or `assertOperationalEmployeesOnly()` was considered. The current pattern (select `isSystemOnly` where needed + `filterOperationalEmployees` after findMany, or use of `getOperationalEmployees`/`getOperationalEmployeesSelect`) is consistent and sufficient; adding another helper was deferred to avoid unnecessary API surface unless a clear repetition pattern emerges later.

---

## Summary

| Category        | Count |
|----------------|-------|
| Safe already   | 21+   |
| Fixed now      | 16    |
| Admin exception| 4     |
| Manual review  | 7     |

**Success criteria met:** No technical/system account appears in any operational UI; none affect KPI/headcount/targets/sales/staffing; admin/memberships still work; ambiguous cases are explicitly listed.
