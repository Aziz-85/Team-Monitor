# Boutique Isolation — Verification Checklist

Use this checklist to confirm strict boutique separation and stable ordering across the app.

---

## 1. Effective Boutique & “Working on” Badge

- [ ] **Non-admin pages**: In sidebar (and mobile top bar), label “Working on:” appears above the boutique selector; selector shows current boutique name (Code).
- [ ] **Admin pages**: On `/admin/*`, the “Working on” badge and operational scope selector are **not** shown; only Admin Filter bar is visible.
- [ ] **Scope change**: As MANAGER/ADMIN, change operational boutique in the selector; all data on the current page (schedule, sales, executive, etc.) updates to the selected boutique only.
- [ ] **i18n**: Switch to Arabic; “تعمل على” (or “البوتيك”) appears for the working-on label.

---

## 2. Schedule

- [ ] **Single boutique**: Schedule view and edit show only employees of the selected operational boutique.
- [ ] **Counts**: AM/PM (and Rashid) totals reflect only that boutique’s employees; no mixing.
- [ ] **Stable order**: Refreshing or switching weeks does not reorder rows; same employee always in same position (team → name → empId).
- [ ] **Excel / month views**: Same boutique filter and stable order.
- [ ] **Keys**: No React list keyed by array index for employee rows; keys use `empId` or `id`.

---

## 3. Employees (non-admin)

- [ ] **Executive employees list**: Only employees belonging to the effective boutique appear (and, for annual, only those with current `Employee.boutiqueId` in scope).
- [ ] **Stable sort**: Annual list sorted by total then `empId`; no jumping when data is re-fetched.
- [ ] **Other employee lists**: Any non-admin employee list (tasks, leaves, inventory, etc.) shows only the operational boutique’s employees.

---

## 4. Sales

- [ ] **Daily Sales Ledger**: Only the operational boutique’s summary and lines; employee dropdown/list only that boutique.
- [ ] **After entering lines**: Go to Operations Dashboard “Monthly Sales Performance” and Executive Monthly; totals and entry count reflect the new entries (no stale cache).
- [ ] **Sales breakdown / compare**: Data scoped to effective boutique; no mixing.
- [ ] **Me/sales**: User’s own sales filtered by their employee’s `boutiqueId` (or default).

---

## 5. Targets

- [ ] **Admin Targets**: Remaining / Diff (and Over-allocated when negative) shown; allocation bar reflects Boutique target vs Employees total.
- [ ] **Cross-boutique edit**: Editing an employee target whose `Employee.boutiqueId` does not match the target’s `boutiqueId` returns 403 with a clear error.
- [ ] **Optional**: If lock/approve exists for targets, it is blocked when diff ≠ 0 (implement if applicable).

---

## 6. Executive

- [ ] **Monthly Board**: Data scope line shows correct boutique; totals and employee target count for that boutique only.
- [ ] **Executive employees (scope mode)**: Single operational boutique; stable sort; only employees in that boutique.

---

## 7. Admin

- [ ] **Admin Filter only**: Admin pages use Admin Filter (All / Boutique / Region / Group); operational scope is hidden.
- [ ] **Change employee boutique**: In Admin → Employees, change an employee’s boutique; confirm that employee appears only in the new boutique on schedule, sales, executive, and targets (when that boutique is selected).

---

## 8. Data & API

- [ ] **Employee queries**: All non-admin API routes that return employees use `where: { boutiqueId: effectiveBoutiqueId }` (or equivalent via `getOperationalScope` / `getScheduleScope` / `resolveExecutiveBoutiqueIds`).
- [ ] **Stable ordering**: Employee lists use `orderBy` that includes `empId` (or `id`) as tie-breaker.
- [ ] **Sales**: `SalesEntry` and daily ledger aggregates use `boutiqueId` and correct date range (Asia/Riyadh); no cache on critical sales/executive endpoints (`dynamic = 'force-dynamic'` or equivalent).

---

## Quick smoke path

1. Log in as MANAGER with access to 2+ boutiques.
2. Select Boutique A; open Schedule → only A’s employees; note order.
3. Open Sales → Daily Ledger → only A’s summary/lines; add a line; go to Dashboard/Executive Monthly → new data visible.
4. Switch to Boutique B; Schedule and Sales show only B’s data; order stable.
5. Open Executive → Employees (scope); only current boutique’s employees; stable sort.
6. Log in as ADMIN; go to Admin → Targets; confirm Remaining/Diff; try editing a target for an employee from another boutique (should fail with 403).
7. Admin → Employees; change one employee’s boutique; confirm they appear only in the new boutique everywhere on non-admin pages when that boutique is selected.
