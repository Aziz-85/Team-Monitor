# Single Source of Truth Audit

**Generated:** 2025-02-14 | **Purpose:** Verify canonical data sources and detect duplication.

---

## Canonical Sources (Defined)

| Domain | Canonical Source | DB Model(s) |
|--------|------------------|-------------|
| Employee membership | `Employee.boutiqueId` | Employee |
| User scope | `User.boutiqueId`, `UserBoutiqueMembership` | User, UserBoutiqueMembership |
| Guest coverage | `ShiftOverride` (boutiqueId=host, empId from other boutique) | ShiftOverride |
| Schedule grid | `ShiftOverride`, `Employee`, `LeaveRequest` | ShiftOverride, Employee, LeaveRequest |
| Sales | `SalesEntry`, `DailySalesLedger` | SalesEntry, DailySalesLedger |
| Targets | `BoutiqueMonthlyTarget`, `EmployeeMonthlyTarget` | BoutiqueMonthlyTarget, EmployeeMonthlyTarget |
| Tasks | `Task`, `TaskCompletion` | Task, TaskCompletion |
| Leaves | `LeaveRequest` | LeaveRequest |

---

## Feature → Pages → APIs → DB Models → Verdict

| Feature | Pages | APIs | DB Models | Verdict | Fix Plan |
|---------|-------|------|-----------|---------|----------|
| Schedule View | /schedule/view | /api/schedule/week/grid, /api/schedule/guests, /api/schedule/month, /api/schedule/month/excel | ShiftOverride, Employee, LeaveRequest | ✅ Single source | — |
| Schedule Edit | /schedule/edit | Same + grid/save, lock, unlock, approve | Same | ✅ Single source | — |
| Schedule Editor (alt) | /schedule/editor | /api/schedule/week, /api/suggestions/coverage | Same | ⚠️ Different API | /schedule/week returns roster; /schedule/week/grid returns full grid. Two different shapes. |
| Daily Sales | /sales/daily | /api/sales/daily, /api/sales/daily/lines, lock | SalesEntry, DailySalesLedger | ✅ Single source | — |
| Monthly Matrix | /sales/monthly-matrix, /dashboard | /api/sales/monthly-matrix | SalesEntry, DailySalesLedger (aggregated) | ✅ Single source | Dashboard and matrix both use same API |
| Sales Import | /sales/import | /api/sales/import/preview, apply, /api/import/monthly-matrix | SalesEntry | ✅ Single source | — |
| Targets | /admin/targets, /me/target | /api/admin/targets, /api/me/targets | BoutiqueMonthlyTarget, EmployeeMonthlyTarget | ✅ Single source | — |
| Guest Coverage | Schedule edit/view | /api/schedule/guests, grid (guestShifts) | ShiftOverride | ⚠️ Two sources | Grid embeds guestShifts; guests API returns same. Both from ShiftOverride. OK. |
| Inventory Daily | /inventory/daily | /api/inventory/daily, stats, exclusions, complete | InventoryDaily*, InventoryZone* | ✅ Single source | — |
| Tasks | /tasks, /tasks/monitor | /api/tasks/list, /api/tasks/my-today, /api/tasks/monitor | Task, TaskCompletion | ✅ Single source | — |
| Leaves | /leaves, /leaves/requests | /api/leaves/*, /api/leaves/requests | LeaveRequest | ✅ Single source | — |
| Executive | /executive/* | /api/executive/* | Multiple (Sales, Employee, etc.) | ✅ Single source | — |

---

## Duplication Risks

| Risk | Location | Description |
|------|----------|-------------|
| Schedule week vs grid | /api/schedule/week vs /api/schedule/week/grid | Different response shapes. `/schedule/week` returns `days` with `roster`; `/schedule/week/grid` returns full grid. Used by different UIs (editor vs edit). |
| Sales aggregation | Dashboard vs Monthly Matrix | Both use /api/sales/monthly-matrix. ✅ |
| Guest coverage | Grid guestShifts vs /api/schedule/guests | Grid embeds guestShifts in response; guests API is separate. Both query ShiftOverride. ✅ Consistent. |

---

## View vs Editor Source Consistency

| Feature | View | Editor | Same source? |
|---------|------|--------|--------------|
| Schedule grid | GET /api/schedule/week/grid | GET /api/schedule/week/grid | ✅ |
| Guests | From grid guestShifts + /api/schedule/guests | Same | ✅ |
| Week status | N/A | GET /api/schedule/week/status | — |

---

## Inconsistent Sources

| Feature | Issue | Severity |
|---------|-------|----------|
| Schedule Editor (alt) | Uses /api/schedule/week (roster format) instead of /api/schedule/week/grid | ⚠️ Low — different UI, simpler |

---

## Recommendations

1. **Schedule Editor:** Consider deprecating /schedule/editor or consolidating with /schedule/edit.
2. **Client fetch:** Ensure all critical data fetches use `cache: 'no-store'` to avoid stale browser cache.
3. **No critical duplication found** — Sales, Targets, Schedule (main), Inventory, Tasks, Leaves all use single canonical APIs.
