# Multi-Boutique Strict Verification Checklist

Use this checklist to confirm strict boutique isolation and correct behavior across the app.

---

## 1. Operational scope (single boutique)

- [ ] **resolveScopeForUser / getOperationalScope** return a single `boutiqueId` for operational pages; `boutiqueIds` is used only for validation.
- [ ] **Operational pages** always filter by `scope.boutiqueId` (single); no combined results across boutiques unless the page is explicitly "Multi-boutique overview".
- [ ] **buildBoutiqueWhere(scope)** and **assertOperationalBoutiqueId(scope)** are used where required.

---

## 2. Employees: no mixing, stable order

- [ ] **Employee.boutiqueId** is the only source of truth for roster; not memberships or scope JSON.
- [ ] Every operational employee list uses `where: { boutiqueId: scope.boutiqueId, active: true }` (plus any other filters).
- [ ] Every `prisma.employee.findMany` has stable **orderBy** (e.g. `[{ team: 'asc' }, { role: 'asc' }, { empId: 'asc' }]` or existing stable helper).
- [ ] Grid/list rendering uses **stable keys** (e.g. `employee.id` or `empId`), not array index.
- [ ] **Switching boutique** (e.g. S05 → S02) changes the employee set completely; re-render does not move employees between columns.

---

## 3. Schedule: strict boutique isolation

- [ ] All schedule-related employee queries filter by `Employee.boutiqueId = scope.boutiqueId`.
- [ ] **ScheduleWeekStatus** is per boutique: `id` (cuid) + `@@unique([weekStart, boutiqueId])`; all reads/writes include `boutiqueId`.
- [ ] **ScheduleLock** (day/week) includes `boutiqueId` in create and in all findFirst/findMany.
- [ ] **Approving/locking a week in S05 does not affect S02** (separate status and lock rows per boutique).

---

## 4. Sales: ledger feeds the rest

- [ ] **On ledger line upsert and on lock**: `syncSummaryToSalesEntry(summaryId, createdById)` runs so SalesEntry is updated.
- [ ] **SalesEntry** has `boutiqueId`, `userId`, `date`, `month`, `amount`; analytics sum SalesEntry by `boutiqueId` and date range (Asia/Riyadh).
- [ ] **After entering ledger lines and locking**, Executive Monthly and Dashboard show correct Sales (SAR) and Sales Breakdown.
- [ ] **Daily Sales Ledger "lines total"** equals sum of SalesEntry for that date/boutique (for synced lines).
- [ ] No caching on critical sales/executive endpoints (`dynamic = 'force-dynamic'` or equivalent).

---

## 5. Targets: branch total, sum, diff

- [ ] **Target distribution page** shows: Branch target, Sum of employee targets, **Diff** = Branch − Sum.
- [ ] **If diff > 0**: "Remaining not assigned" (or equivalent) shown.
- [ ] **If diff < 0**: "Over-assigned" shown (warning style).
- [ ] **Finalize/Lock distribution** requires diff === 0 (if that action exists).
- [ ] Employee targets are filtered by `Employee.boutiqueId = scope.boutiqueId`; cross-boutique edits rejected (403).

---

## 6. Admin vs operational

- [ ] **ScopeSelector** and "Working on" badge are **hidden on /admin***.
- [ ] **Admin APIs** do not use `resolveScopeForUser` for data scope; they use **adminFilterJson** only.
- [ ] **Operational pages** show "Working on: {Boutique Name (Code)}" clearly.

---

## 7. Verification steps (smoke)

1. **Switch boutique**: Select S05 then S02; all operational data (schedule, employees, sales, targets) changes; no mixing.
2. **Schedule lock**: Lock week in S05; open S02 and confirm that week is not locked there.
3. **Ledger → Executive**: Enter daily ledger lines for S05, lock; open Executive Monthly for same month and confirm totals reflect the entries.
4. **Targets**: Set branch target 800, assign Abdulaziz 400, Sultan 200; confirm "Remaining 200" (or equivalent) is shown; adjust to balance and confirm diff updates.
5. **Stable sort**: Refresh schedule/employee lists; order does not change; no "jumping" between columns/sides.

---

## 8. Files / areas to audit

- **Operations**: Home, Dashboard, Schedule (view/edit/audit), Employees (operational).
- **Sales**: Daily Sales Ledger, Targets, My Target.
- **Executive**: Executive, Insights, Monthly, Monthly Board, Compare.
- **Leaves, Tasks, Inventory**: All use operational scope and boutique filter.
- **APIs**: `/api/schedule/*`, `/api/sales/*`, `/api/targets/*`, `/api/executive/*`, `/api/leaves/*`, `/api/tasks/*`, and any route returning employees.

Every operational page/API must: resolve scope (single `boutiqueId`), apply boutique filter to all relevant queries, use deterministic ordering, and show current boutique in the UI where required.
