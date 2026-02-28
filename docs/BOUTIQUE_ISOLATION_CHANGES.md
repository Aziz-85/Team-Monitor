# Boutique Isolation — Files Changed (Strict Patch)

Brief reason per file. No UI redesign; no schedule algorithm changes; existing routes and behaviors kept unless explicitly required.

---

## New files

| File | Reason |
|------|--------|
| `lib/scope/effectiveBoutique.ts` | Single resolver for effective boutique: `resolveEffectiveBoutiqueId()`, `getEffectiveBoutiqueIdForRequest()`, `resolveEffectiveBoutique()`, `getEffectiveBoutiqueLabel()`. Used by non-admin flows; delegates to `resolveOperationalBoutiqueId`. |
| `lib/scope/whereBoutique.ts` | Shared `whereEmployeeBoutique(boutiqueId)` and `whereBoutiqueIn(boutiqueIds)` for consistent Prisma `where` clauses. |
| `docs/BOUTIQUE_ISOLATION_VERIFICATION.md` | Verification checklist and smoke path. |
| `docs/BOUTIQUE_ISOLATION_CHANGES.md` | This file: list of changes. |

---

## Modified files

| File | Change |
|------|--------|
| `messages/en.json` | Added `common.workingOnBoutique`, `common.workingOnBoutiqueShort` for “Working on” badge. |
| `messages/ar.json` | Same i18n keys (AR). |
| `components/nav/Sidebar.tsx` | Non-admin: show “Working on:” label above `OperationalBoutiqueSelector`. |
| `components/nav/MobileTopBar.tsx` | Non-admin: show short working-on label next to scope selector. |
| `lib/executive/scope.ts` | For non-admin / non-global: use single operational boutique via `resolveOperationalBoutiqueId` instead of `resolveScopeForUser` (no REGION/GROUP on executive). |
| `app/api/executive/monthly/route.ts` | `export const dynamic = 'force-dynamic'` so Daily Sales Ledger updates reflect immediately. |
| `app/api/sales/daily/route.ts` | Same `dynamic = 'force-dynamic'`. |
| `app/api/sales/daily/summary/route.ts` | Same `dynamic = 'force-dynamic'`. |
| `app/api/executive/employees/annual/route.ts` | (1) Filter employees by `boutiqueId in boutiqueIds` so only employees belonging to scope appear. (2) Build result only for those `allowedEmpIds`. (3) Stable sort: tie-break by `empId` after `annualTotal`. |
| `app/api/admin/employee-target/route.ts` | Cross-boutique validation: reject PATCH when target’s `boutiqueId` does not match the employee’s current `Employee.boutiqueId` (403 + message). |

---

## Unchanged by design

- **Admin pages**: Still use Admin Filter only; no operational scope; no “Working on” badge.
- **Schedule algorithm**: No change to schedule math or shift logic.
- **Existing routes**: No route renames or removals.
- **Sales schema**: `SalesEntry` and daily ledger already have `boutiqueId`; no new migration for sales.
- **Targets reconciliation**: Remaining/Diff UI and logic already present in admin targets; optional lock-when-diff ≠ 0 left to existing flow.

---

## Migrations

No new migrations in this patch. Schema already has:

- `Employee.boutiqueId` (required)
- `SalesEntry.boutiqueId` (required)
- `EmployeeMonthlyTarget.boutiqueId` (required)
- `BoutiqueMonthlyTarget`, etc.

If backfill was needed for sales/targets `boutiqueId`, it should already be done per prior reports (e.g. `scripts/backfill-sales-entry-boutique.ts`).
