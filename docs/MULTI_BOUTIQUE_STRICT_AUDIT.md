# Multi-Boutique Strict Audit — Rules & Verification

## Hard Rules (must hold everywhere)

### R1) Employee.boutiqueId is the canonical boutique ownership
- Any operational data shown for a boutique must be filtered by the **active** `boutiqueId` (user-selected operational boutique).
- Memberships are for **access control only**, NOT for determining which boutique’s employee list belongs where.
- A user may have memberships across boutiques, but an **Employee** belongs to exactly one boutique via `Employee.boutiqueId`.

### R2) Operational Scope vs Admin Filter
- **`/admin/*`** remains global and uses **Admin Filter** only (already implemented).
- All **non-admin** pages MUST use **Operational Scope** `boutiqueId` (single boutique) for data queries.
- Never query using “accessible boutiqueIds list” unless it is an explicit cross-boutique analytics page (and it must say so).

### R3) Stable ordering
- Any employee list must have **deterministic order** (`empId` ascending, then `name`).
- Schedule tables must not “shuffle” names between refreshes.

### R4) Working-on indicator
- A persistent “Working on: {BoutiqueName (Code)}” indicator is shown in the main layout on **all non-admin** pages (Sidebar + MobileTopBar via `OperationalBoutiqueSelector`).
- The boutique indicator must match the `boutiqueId` used in backend queries (single source).

---

## Touched APIs / Pages (summary)

### Scope & helpers
| File | Change |
|------|--------|
| `lib/scope/requireOperationalBoutique.ts` | **NEW** — Returns `{ boutiqueId, boutiqueLabel }` or 403 for non-admin APIs. |
| `lib/scope/scheduleScope.ts` | Enforce `boutiqueIds = [boutiqueId]`; clearer 403 message when no boutique. |
| `lib/scope/operationalScope.ts` | Unchanged; already single-boutique (`boutiqueIds: boutiqueId ? [boutiqueId] : []`). |

### Employee ordering
| File | Change |
|------|--------|
| `lib/employee/employeeQuery.ts` | `employeeOrderByStable` set to `[{ empId: 'asc' }, { name: 'asc' }]` for deterministic lists. |

### Schedule
| API / module | Scope |
|--------------|--------|
| `getScheduleScope()` | Returns single `boutiqueId` and `boutiqueIds: [boutiqueId]`. |
| `app/api/schedule/week/route.ts` | Uses `scheduleScope.boutiqueIds` (single). |
| `app/api/schedule/week/grid/save/route.ts` | Uses `scheduleScope.boutiqueId` and `boutiqueIds`; asserts employees in scope. |
| `lib/services/scheduleGrid.ts` | Filters by `buildEmployeeWhereForOperational(boutiqueIds)`; uses `employeeOrderByStable`. |
| `lib/services/roster.ts` | Same; roster for date uses single-boutique list. |
| `lib/services/scheduleApply.ts` | Uses `options.boutiqueId` / `options.boutiqueIds`; employees filtered by `Employee.boutiqueId in options.boutiqueIds`. |

### Sales
| File | Change |
|------|--------|
| `lib/sales/syncLedgerToSalesEntry.ts` | On sync: upsert `SalesEntry` from ledger lines; **delete** stale; `monthKey` via `formatMonthKey(date)` (Asia/Riyadh). |
| `lib/sales/syncDailyLedgerToSalesEntry.ts` | Wrapper by `boutiqueId`+date; used after summary, lines, lock, import/apply, and by repair. |
| `app/api/sales/daily/summary/route.ts` | **After** create/update summary: calls `syncDailyLedgerToSalesEntry({ boutiqueId, date, actorUserId })` so dashboards reflect immediately. |
| `app/api/sales/daily/lock/route.ts` | Calls sync after lock. |
| `app/api/sales/daily/lines/route.ts` | Calls sync after line upsert. |
| `app/api/admin/sales/repair/route.ts` | **NEW** — ADMIN-only GET/POST `?from=YYYY-MM-DD&to=YYYY-MM-DD&boutiqueId=optional`. Runs sync for each date in range and each boutique; returns `{ repairedDates, boutiques, repaired, warnings, tookMs }`. |

### Other operational APIs (single-boutique via getOperationalScope / getScheduleScope)
- `app/api/sales/daily/route.ts` — `scope.boutiqueIds` (single).
- `app/api/sales/daily/summary/route.ts` — idem.
- `app/api/sales/import/route.ts`, `apply/route.ts` — idem.
- `app/api/employee/home/route.ts`, `app/api/home/route.ts` — `scopeOptions.boutiqueIds`.
- `app/api/tasks/monitor/route.ts` — `buildEmployeeWhereForOperational(scope.boutiqueIds)`.
- `app/api/inventory/absent/route.ts` — idem.
- `app/api/leaves/employees/route.ts` — scope.
- `app/api/dashboard/route.ts` — `scheduleScope.boutiqueId`.
- Schedule lock/unlock/approve/week/status/grid — all use `getScheduleScope()` (single boutique).
- Inventory daily/zones weekly complete — `getScheduleScope()`.

### Admin (unchanged)
- `/admin/*` uses Admin Filter only; no operational scope.
- `app/api/admin/*` — global or filter by admin selection; not changed by this audit.

---

## Verification Checklist

### 1) Operational scope is single-boutique
- [ ] Log in as MANAGER with access to more than one boutique.
- [ ] Select **Boutique A** in the scope selector (sidebar). Open **Schedule** (view or editor).
- [ ] **Expected:** Only employees with `Employee.boutiqueId = A` appear; roster does not include other boutiques.
- [ ] Switch to **Boutique B**.
- [ ] **Expected:** Roster and grid update to **only** Boutique B’s employees; no mixing.

### 2) Stable ordering
- [ ] On Schedule (view or editor), note the order of employee names.
- [ ] Refresh the page or change week and change back.
- [ ] **Expected:** Same order (by `empId`, then `name`); no shuffling.

### 3) Sales ledger → SalesEntry
- [ ] Open **Daily Sales Ledger** for a boutique and date. Enter line amounts; ensure lines total = manager total.
- [ ] Click **Lock**.
- [ ] **Expected:** Lock succeeds. Open **Dashboard** or **Executive / Monthly** for that month.
- [ ] **Expected:** Sales (SAR) / analytics reflect the locked ledger (data comes from `SalesEntry`).
- [ ] Remove a line from the ledger (or reduce lines), then lock again (if your flow allows); or run sync.
- [ ] **Expected:** No stale `SalesEntry` rows for removed employees for that date+boutique.

### 4) Targets (Admin)
- [ ] **Admin → Targets**: Set boutique monthly target; generate employee targets.
- [ ] **Expected:** Sticky bar shows **Remaining** / **Over by** / **Balanced**; badge matches `diffSar`.

### 5) Working-on indicator
- [ ] On any non-admin page (Dashboard, Schedule, Sales, Tasks, etc.), check sidebar (desktop) and top bar (mobile).
- [ ] **Expected:** “Working on: {BoutiqueName (Code)}” is visible and matches the scope selector.
- [ ] **Expected:** On `/admin/*`, scope selector is hidden (admin uses Admin Filter only).

### 6) No cross-boutique leakage
- [ ] As MANAGER, select Boutique A. Open **Tasks**, **Leaves**, **Inventory**.
- [ ] **Expected:** Only Boutique A’s employees/data appear.
- [ ] **Expected:** Schedule grid save rejects assignments for employees not in the selected boutique (e.g. 400 CROSS_BOUTIQUE_BLOCKED if attempted).

---

## Acceptance summary

| Area | Acceptance |
|------|------------|
| Schedule | Switching boutique changes roster to that boutique only; stable order. |
| Sales | Daily Ledger lock syncs to `SalesEntry`; stale entries removed; analytics read from `SalesEntry`. |
| Targets | Remaining/Over/Balanced shown; employee list by `Employee.boutiqueId`. |
| UI | “Working on” visible on non-admin pages; matches backend scope. |
| Admin | Unchanged; uses Admin Filter only. |

---

## Translation audit (Phase F)

- Run `node scripts/check-translation-keys.js` (or equivalent) to ensure `messages/en.json` and `messages/ar.json` have identical flattened key sets.
- Use consistent terms: Boutique → بوتيك, Targets → أهداف, Remaining → المتبقي, Over by → زيادة بمقدار (see `TRANSLATION_AUDIT_REPORT.md`).

---

## Phase A — Page → API → Tables map (non-admin only)

Non-admin pages under `app/(dashboard)/*` excluding `admin/`:

| Page | Displays | APIs called | DB tables (read/write) | Filter by boutiqueId / Employee.boutiqueId |
|------|----------|-------------|-------------------------|--------------------------------------------|
| `/` (Home) | Home snapshot, week, tasks | `/api/home`, `/api/me/targets`, `/api/tasks/my-today`, `/api/schedule/week`, `/api/suggestions/coverage/apply`, `/api/tasks/completion` | Employee, Schedule*, Task*, SalesEntry, BoutiqueTarget, etc. | ✅ scope.boutiqueIds / Employee.boutiqueId |
| `/dashboard` | Executive dashboard | `/api/dashboard` | Employee, Schedule*, SalesEntry, Task*, BoutiqueTarget, etc. | ✅ scheduleScope.boutiqueId |
| `/schedule/view` | Week grid, roster | `/api/me/operational-boutique`, `/api/schedule/week/grid`, `/api/schedule/week/status`, `/api/schedule/insights/week`, `/api/schedule/reminders`, `/api/schedule/month/excel` | Employee, Schedule*, Roster*, etc. | ✅ getScheduleScope() single; Employee.boutiqueId |
| `/schedule/edit` | Week editor, save, lock | Same + `/api/schedule/week/grid/save`, `/api/schedule/lock`, `/api/schedule/unlock`, `/api/schedule/approve-week`, `/api/schedule/week/unapprove`, `/api/audit` | Employee, Schedule*, Roster*, Audit | ✅ idem |
| `/schedule` (SchedulePageClient) | Week grid, overrides | `/api/schedule/week/grid`, `/api/schedule/month`, `/api/overrides` | Employee, Schedule*, Override | ✅ getScheduleScope() |
| `/sales/daily` | Daily ledger | `/api/sales/daily`, `/api/sales/daily/summary`, `/api/sales/daily/lines`, `/api/sales/daily/lock`, `/api/sales/import`, `/api/sales/import/apply` | BoutiqueSalesSummary, BoutiqueSalesLine, SalesEntry (via sync) | ✅ operational boutiqueId; sync after lines/lock/import |
| `/executive` | Executive dashboard | `/api/executive`, `/api/executive/weekly-pdf` | Employee, SalesEntry, Task*, Schedule*, etc. | ✅ operational scope |
| `/executive/monthly` | Monthly board | `/api/executive/monthly` | SalesEntry, BoutiqueTarget, Task*, etc. | ✅ boutiqueId + monthKey; dataScope banner |
| `/executive/insights` | Insights, trends, alerts | `/api/executive/insights`, `/api/executive/trends`, `/api/executive/alerts`, `/api/executive/anomalies`, `/api/executive/employee-intelligence` | Various | ✅ scope |
| `/executive/employees` | Employee list | `/api/me/scope`, `/api/executive/employees/annual` | Employee, SalesEntry, etc. | ✅ scope |
| `/executive/employees/[empId]` | Employee detail | `/api/me/scope`, `/api/executive/employees/[empId]`, `/api/kpi/employee` | Employee, SalesEntry, KPI | ✅ scope |
| `/executive/compare` | Compare | `/api/me/scope`, `/api/executive/compare` | Employee, SalesEntry, etc. | ✅ scope |
| `/tasks/monitor` | Task monitor | `/api/tasks/monitor` | Employee, Task*, TaskSetup | ✅ buildEmployeeWhereForOperational |
| `/tasks/setup` | Task setup | `/api/tasks/setup`, `/api/leaves/employees` | TaskSetup, Employee, Leave | ✅ scope |
| `/boutique/tasks` | Boutique tasks | `/api/tasks/setup`, `/api/me/boutiques` | TaskSetup | ✅ (boutique context) |
| `/boutique/leaves` | Leave management | `/api/leaves/requests`, `/api/me/scope`, `/api/leaves/evaluate`, approve, reject, escalate, admin-approve | Leave, Employee | ✅ scope |
| `/leaves/requests` | My requests | `/api/leaves/requests?self=true`, `/api/me/boutiques`, `/api/leaves/evaluate`, submit, request | Leave, User | ✅ scoped by membership/self |
| `/inventory/daily` | Daily inventory | `/api/inventory/daily`, `/api/inventory/daily/exclusions`, `/api/leaves/employees`, `/api/inventory/absent` | Employee, Inventory*, Leave | ✅ scope; Employee.boutiqueId |
| `/inventory/daily/history` | Stats | `/api/inventory/daily/stats` | Inventory* | ✅ scope |
| `/inventory/zones` | Zones | `/api/inventory/zones/upload-map` | Zones | ✅ scope |
| `/inventory/zones/weekly` | Weekly zones | `/api/inventory/zones/weekly`, complete, complete-all | Employee, Zone*, etc. | ✅ getScheduleScope() |
| `/inventory/follow-up` | Follow-up | `/api/inventory/follow-up/daily`, weekly, `/api/audit` | Inventory*, Audit | ✅ scope |
| `/employee` | Employee home | `/api/me/targets`, `/api/employee/home` | Employee, SalesEntry, Task*, Schedule* | ✅ scopeOptions.boutiqueIds |
| `/me/target` | My target | `/api/me/targets`, `/api/me/sales`, `/api/me/sales/requests`, request-edit, me/sales CRUD | SalesEntry, BoutiqueTarget | ✅ user’s boutique/emp |
| `/approvals` | Approvals | `/api/approvals`, approve, reject | Approval, Schedule*, etc. | ✅ scope |
| `/schedule/audit-edits` | Audit edits | `/api/schedule/audit-edits` | Audit | ✅ schedule scope |
| `/kpi/upload` | KPI upload | `/api/me/boutiques`, `/api/admin/employees`, `/api/kpi/uploads` | KPI, Employee (admin list) | ⚠️ KPI upload may use admin list; uploads scoped |

**Note:** `/admin/*` pages and `/api/admin/*` are global; they use Admin Filter only (no operational boutique). Sales ledger sync: only **lines** (POST/PATCH/DELETE), **lock**, and **import/apply** mutate data that flows to SalesEntry; **summary POST** only updates manager totalSar and does not change lines, so sync is not called there.

---

## Phase A — Non-admin API pass/fail checklist

| API route | Resolves single boutiqueId? | Filters by boutiqueId / Employee.boutiqueId? | 403 when no boutique? | Pass |
|-----------|------------------------------|---------------------------------------------|------------------------|------|
| `/api/home` | ✅ getOperationalScope | ✅ scopeOptions.boutiqueIds, employee where | ✅ requireOperationalBoutique | ✅ |
| `/api/dashboard` | ✅ getScheduleScope | ✅ boutiqueId | ✅ 403 no scope | ✅ |
| `/api/me/operational-boutique` | ✅ session/cookie | N/A (read-only) | N/A | ✅ |
| `/api/me/scope` | ✅ getOperationalScope | N/A | ✅ 403 | ✅ |
| `/api/schedule/week/grid` | ✅ getScheduleScope | ✅ boutiqueIds → Employee.boutiqueId, order empId/name | ✅ "Select a boutique in the scope selector." | ✅ |
| `/api/schedule/week/route` | ✅ getScheduleScope | ✅ idem | ✅ 403 | ✅ |
| `/api/schedule/week/status` | ✅ getScheduleScope | ✅ idem | ✅ 403 | ✅ |
| `/api/schedule/week/grid/save` | ✅ getScheduleScope | ✅ employees in scope | ✅ 403 | ✅ |
| `/api/schedule/lock`, unlock, approve-week, unapprove | ✅ getScheduleScope | ✅ single boutique | ✅ 403 | ✅ |
| `/api/schedule/insights/week`, month, reminders, audit-edits, month/excel | ✅ getScheduleScope | ✅ single boutique | ✅ 403 | ✅ |
| `/api/sales/daily` | ✅ getOperationalScope | ✅ boutiqueId | ✅ 403 | ✅ |
| `/api/sales/daily/summary` (POST) | ✅ assertOperationalBoutiqueId | ✅ boutiqueId in body must match scope | ✅ 403 | ✅ |
| `/api/sales/daily/lines` | ✅ operational | ✅ summary by boutiqueId+date; sync after | ✅ 403 | ✅ |
| `/api/sales/daily/lock` | ✅ operational | ✅ sync to SalesEntry after lock | ✅ 403 | ✅ |
| `/api/sales/import`, `/api/sales/import/apply` | ✅ operational | ✅ apply calls sync | ✅ 403 | ✅ |
| `/api/executive` | ✅ getOperationalScope | ✅ boutiqueId | ✅ 403 | ✅ |
| `/api/executive/monthly` | ✅ getOperationalScope | ✅ boutiqueId, monthKey, salesEntryCount | N/A (returns dataScope) | ✅ |
| `/api/executive/insights`, trends, alerts, anomalies, employee-intelligence | ✅ scope | ✅ filtered | ✅ 403 | ✅ |
| `/api/executive/employees/*`, compare | ✅ scope | ✅ filtered | ✅ 403 | ✅ |
| `/api/tasks/monitor` | ✅ getOperationalScope | ✅ buildEmployeeWhereForOperational | ✅ 403 | ✅ |
| `/api/tasks/setup`, plan, schedule | ✅ scope | ✅ employees in scope | ✅ 403 | ✅ |
| `/api/leaves/employees` | ✅ getOperationalScope | ✅ scope | ✅ 403 | ✅ |
| `/api/leaves/requests`, evaluate, approve, reject, etc. | ✅ scope / membership | ✅ filtered | As designed | ✅ |
| `/api/inventory/daily`, exclusions, absent, stats, complete, recompute, rebalance | ✅ getScheduleScope or operational | ✅ Employee.boutiqueId | ✅ 403 | ✅ |
| `/api/inventory/zones/weekly`, complete, complete-all | ✅ getScheduleScope | ✅ single boutique | ✅ 403 | ✅ |
| `/api/inventory/follow-up/*` | ✅ scope | ✅ filtered | ✅ 403 | ✅ |
| `/api/employee/home` | ✅ scopeOptions | ✅ boutiqueIds | ✅ 403 | ✅ |
| `/api/me/targets`, `/api/me/sales/*` | ✅ user’s context | ✅ user/emp/boutique | N/A | ✅ |
| `/api/approvals` | ✅ scope | ✅ filtered | ✅ 403 | ✅ |
| `/api/overrides` | ✅ getScheduleScope | ✅ scope | ✅ 403 | ✅ |
| `/api/suggestions/coverage/apply` | ✅ scope | ✅ scope | ✅ 403 | ✅ |
| `/api/tasks/my-today`, completion, list, etc. | ✅ scope / user | ✅ filtered | As designed | ✅ |
| `/api/audit` | ✅ schedule scope | ✅ weekStart + scope | ✅ 403 | ✅ |

---

## Phase G — Detailed test plan (MUST DO)

1. **Boutique = Dhahran Mall**
   - Schedule (view/edit): roster and grid show **only** employees with `Employee.boutiqueId = Dhahran Mall`; order is **empId ASC, then name ASC** (stable).
   - Sales daily ledger: lines and summary only for Dhahran Mall; lock syncs to SalesEntry for that boutique+date.
   - Targets (if operational targets page): only Dhahran Mall employees; branch target vs sum employee targets; Remaining/Over/Balanced shown.
   - Dashboard: totals (sales, schedule, tasks) reflect Dhahran Mall only; no names from other boutiques.

2. **Switch boutique to AlRashid**
   - Schedule: roster and grid **immediately** show only AlRashid employees; **no** Dhahran Mall names.
   - Sales ledger: only AlRashid data for selected date.
   - Dashboard: totals and team table only AlRashid.
   - **Confirm:** No cross-boutique employee names after switch; order remains stable (empId, name).

3. **Daily Sales Ledger → Executive Monthly**
   - Enter sales in Daily Sales Ledger for a boutique and date; ensure lines total = manager total; lock.
   - Open **Executive → Monthly Board Report** for that boutique and month.
   - **Expected:** Sales > 0; "Data scope: Boutique X · Month YYYY-MM · Sales entries found: N" with N > 0.
   - Dashboard sales breakdown for that month reflects the same numbers.

4. **403 when no boutique**
   - With no operational boutique selected, call `/api/schedule/week/grid` (or any operational API).
   - **Expected:** 403 with message "Select a boutique in the scope selector."

5. **Stable ordering**
   - On Schedule view, note employee order; refresh or change week and return.
   - **Expected:** Same order (empId then name); no shuffling or “jumping sides”.

6. **Admin**
   - On `/admin/*` pages: no operational scope selector; Admin Filter only; no 403 for “no boutique”.
   - Targets (admin): Remaining/Over/Balanced and regeneration warning when diffSar ≠ 0.

---

## Phase C — SalesEntry consistency (completed)

**Goal:** SalesEntry always reflects Daily Sales Ledger; dashboards never show 0 when ledger has data.

### Implemented

1. **Sync after summary (Part 1)**  
   - `POST /api/sales/daily/summary`: after creating/updating summary `totalSar`, calls `syncDailyLedgerToSalesEntry({ boutiqueId, date, actorUserId })`.  
   - Idempotent: if lines unchanged, SalesEntry unchanged.

2. **Repair endpoint (Part 2)**  
   - `GET/POST /api/admin/sales/repair?from=YYYY-MM-DD&to=YYYY-MM-DD&boutiqueId=optional`  
   - ADMIN only. Iterates each date in range and each boutique (or single `boutiqueId`), runs sync.  
   - Response: `{ repairedDates, boutiques, repaired, warnings, tookMs }`. Use for historical mismatch (e.g. after bulk import).

3. **Read-side and month consistency (Part 3)**  
   - **Executive Monthly:** reads `SalesEntry` with `boutiqueId` + `monthKey` + date in `getMonthRange(monthKey)` (Asia/Riyadh).  
   - **Dashboard:** `SalesEntry.groupBy` now filters by `boutiqueId` when `scheduleScope.boutiqueId` is set.  
   - **syncLedgerToSalesEntry:** `monthKey` derived with `formatMonthKey(dateOnly)` (Asia/Riyadh) so write and read use same month.

4. **Diagnostics (Part 4)**  
   - Monthly Board API returns `dataScope.salesEntryCount` and `dataScope.ledgerLineCount` (BoutiqueSalesLine count for that month+boutique).  
   - UI banner shows “Sales entries: N · Ledger lines: M”. If N=0 and M>0, sync failed or was never run (use repair).

### Test steps (Phase C)

- [ ] **Summary sync:** Change only manager total in Daily Sales Ledger (no line changes), save. Open Executive Monthly / Dashboard → sales for that month reflect (sync ran after summary).
- [ ] **Repair:** As ADMIN, call `GET /api/admin/sales/repair?from=2025-01-01&to=2025-01-31` (or a range where ledger has data). Response has `repaired` ≥ 0, `warnings` if any. Then open Monthly Board for that month → Sales entries and revenue correct.
- [ ] **Diagnostics:** Monthly Board banner shows “Sales entries: N · Ledger lines: M”. After entering and locking ledger for a day in that month, N and M both increase; if N=0 and M>0, run repair and recheck.
- [ ] **Dashboard boutique filter:** With one boutique selected, Dashboard sales breakdown and remaining gap use only that boutique’s SalesEntry (no cross-boutique totals).
