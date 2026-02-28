# Metrics Contract — Single Source of Truth

**Version:** 1.0  
**Timezone:** Asia/Riyadh for all date boundaries.  
**Date range:** Inclusive `from` at 00:00:00.000, exclusive `to` (next day 00:00:00.000 or first day of next month).

---

## Unification summary (what was fixed)

**Inconsistency:** Dashboard showed zeros or different MTD than /me/target and /sales/my because:
- Dashboard used **session boutique** (`getScheduleScope` → `user.boutiqueId` or ?b= for SUPER_ADMIN).
- /me/targets and /me/sales used **Employee.boutiqueId** via `getEmployeeBoutiqueIdForUser`.
- For EMPLOYEE/ASSISTANT_MANAGER, session boutique can differ from assigned employee boutique (e.g. after transfer), so dashboard and “my” pages showed different scopes and numbers.

**Unified:**
- **Scope:** All metrics now use `resolveMetricsScope(request)`:
  - EMPLOYEE / ASSISTANT_MANAGER: `effectiveBoutiqueId = Employee.boutiqueId` (single source: User.empId → Employee.boutiqueId).
  - MANAGER / ADMIN / SUPER_ADMIN: `effectiveBoutiqueId` from `getOperationalScope(request)` (session or ?b=).
- **Sales actuals:** Single aggregator `getDashboardSalesMetrics` and `getTargetMetrics` in `lib/metrics/aggregator.ts` (SalesEntry only; sources LEDGER, IMPORT, MANUAL). Same date logic: `getMonthRange`, `toRiyadhDateString`, etc. from `lib/time`.
- **Dashboard** uses `resolveMetricsScope` + `getDashboardSalesMetrics`; **me/targets** uses `resolveMetricsScope` + `getTargetMetrics`; **me/sales** and **sales/summary** scope aligned via `resolveMetricsScope` (and getSalesScope using Employee.boutiqueId for EMPLOYEE/ASSISTANT_MANAGER).
- **Dashboard UI** no longer overwrites sales with monthly-matrix; dashboard API is the single source for dashboard KPIs.

**Result:** For the same user + boutique + month, dashboard monthly actual, /me/target MTD, and calendar month total now use the same scope and same SalesEntry data.

---

## 1. KPI fields by route

### 1.1 Dashboard (`/dashboard`)

| Field | Description | Source |
|-------|-------------|--------|
| `currentMonthTarget` | Boutique (or employee for EMPLOYEE) monthly target SAR | BoutiqueMonthlyTarget / EmployeeMonthlyTarget |
| `currentMonthActual` | MTD sales SAR | SalesEntry sum for month |
| `completionPct` | (actual / target) * 100 | Derived |
| `remainingGap` | max(0, target - actual) | Derived |
| Schedule health | week approved, AM/PM counts, coverage violations | ScheduleLock, roster, coverageValidation |
| Task control | weekly total, completed, pending, overdue, zone summary | Task, TaskCompletion |
| Sales breakdown | per-employee target, actual, pct | EmployeeMonthlyTarget + SalesEntry groupBy userId |
| Team table | empId, name, role, target, actual, pct, tasksDone, zone | Same as above + task completions + zone assignments |

### 1.2 Sales My (`/sales/my`)

| Field | Description | Source |
|-------|-------------|--------|
| `netSalesTotal` | Sum of SalesEntry.amount in range | SalesEntry |
| `grossSalesTotal` | Same as net (no returns/exchanges in SalesEntry) | SalesEntry |
| `returnsTotal` | Sum of returns in range | SalesTransaction type=RETURN (optional) |
| `exchangesTotal` | Sum of exchanges | SalesTransaction type=EXCHANGE (optional) |
| `guestCoverageNetSales` | Sales credited from guest coverage | SalesTransaction isGuestCoverage (optional) |
| `breakdownByEmployee` | Per-employee net sales | SalesEntry groupBy userId |

### 1.3 Sales Returns (`/sales/returns`)

| Field | Description | Source |
|-------|-------------|--------|
| `items` | List of RETURN/EXCHANGE txns in range | SalesTransaction |
| `from` / `to` | Range dates | Query params |
| `canAdd` | Can user add manual return/exchange | RBAC |

### 1.4 My Target (`/me/target`)

| Field | Description | Source |
|-------|-------------|--------|
| `monthKey` | YYYY-MM | Query |
| `monthTarget` | Employee monthly target SAR | EmployeeMonthlyTarget |
| `mtdSales` | Sum SalesEntry for month, user | SalesEntry |
| `todaySales` | SalesEntry for today | SalesEntry |
| `weekSales` | SalesEntry for current week (Sat–Fri) in month | SalesEntry |
| `dailyTarget` / `weekTarget` | Proportional to month target | getDailyTargetForDay |
| `remaining` | max(0, monthTarget - mtdSales) | Derived |
| `pctDaily` / `pctWeek` / `pctMonth` | Percentages | Derived |
| Calendar entries | Per-day amounts for month | SalesEntry by dateKey |

---

## 2. Data tables (canonical)

| Table | Use |
|-------|-----|
| **SalesEntry** | Single source for “sales actuals” (LEDGER, IMPORT, MANUAL). Fields: boutiqueId, date, dateKey, month, userId, amount, source. |
| **EmployeeMonthlyTarget** | Per-user, per-boutique, per-month target SAR. |
| **BoutiqueMonthlyTarget** | Per-boutique, per-month target SAR. |
| **SalesTransaction** | RETURN/EXCHANGE rows (halalas); for returns page and optional net = sales - returns - exchanges. |

### 2.1 Canonical formulas (single definition, reused everywhere)

- **netSales (KPIs):**  
  `netSales = sum(SalesEntry.amount)` where `source IN ('LEDGER','IMPORT','MANUAL')` and scope filters (boutiqueId, optional userId) and date range.  
  **Units:** SAR (integer).  
  **No subtraction** of returns/exchanges in the current schema; SalesEntry is the single source for “sales actuals” on dashboard, MTD, and /sales/my.

- **Returns / exchanges:**  
  Stored in **SalesTransaction** with `type IN ('RETURN','EXCHANGE')`. Used for `/sales/returns` list and “can add” RBAC.  
  **Not subtracted** from dashboard/MTD/sales-my totals today. If product adds that, define once in the aggregator (e.g. `netSales = salesEntrySum - returnsSum - exchangesSum`).

- **Guest coverage:**  
  **Guest coverage net sales** = sum of `SalesTransaction.netAmount` where `isGuestCoverage = true` in scope/range (if populated).  
  Dashboard and MTD **do not include** guest coverage in `currentMonthActual` / `mtdSales`; those are SalesEntry-only.

### 2.2 SUPER_ADMIN behavior (“my” views vs selected boutique)

- **Scope:** SUPER_ADMIN uses `getOperationalScope(request)` → `effectiveBoutiqueId` = “Working on” boutique (session or `?b=` / `boutiqueId=`). Cross-boutique allowed by switching selection.
- **“My” views (/me/target, /sales/my, /sales/returns):** SUPER_ADMIN sees **self** in the **selected boutique** only (same as ADMIN in one boutique). “My” = self + selected boutique; no “my across all boutiques” aggregate.
- **Consistency:** Same user + selected boutique + month → dashboard monthly actual = /me/target MTD = /sales/my when range aligned; same `resolveMetricsScope` + aggregator.

---

## 3. Scope rules (RBAC)

| Role | effectiveBoutiqueId | effectiveEmployeeId / userId |
|------|---------------------|------------------------------|
| EMPLOYEE | Employee.boutiqueId (via User.empId) | Self only |
| ASSISTANT_MANAGER | Employee.boutiqueId | Self only for “my” metrics; team for dashboard |
| MANAGER | Operational boutique (preference or first membership) | Team in boutique |
| ADMIN | Operational boutique or requested | Any in boutique |
| SUPER_ADMIN | ?b= or session boutique | Any, cross-boutique if requested |

EMPLOYEE cannot request other employee or other boutique. All aggregation must filter by resolved scope server-side.

---

## 4. Date boundaries (Asia/Riyadh)

- **Today:** `toRiyadhDateString(getRiyadhNow())` → YYYY-MM-DD.
- **Month range:** `getMonthRange(monthKey)` → start (inclusive), endExclusive (first day of next month).
- **MTD:** SalesEntry where `month = monthKey` and `dateKey` in month (already stored).
- **Arbitrary range:** fromDate 00:00:00.000, toDateExclusive = next day 00:00:00.000; query `date >= fromDate AND date < toDateExclusive`.

---

## 5. API endpoints (unified)

- `GET /api/metrics/dashboard` — Uses resolveMetricsScope + getDashboardMetrics. Returns snapshot, salesBreakdown, teamTable, etc.
- `GET /api/metrics/sales-my?from=&to=` — Uses resolveMetricsScope + getSalesMetrics. Same scope as dashboard. **UI:** `/sales/my` calls this (no longer `/api/sales/summary`).
- `GET /api/metrics/returns?from=&to=` — Uses resolveMetricsScope + returns list. Same scope. **UI:** `/sales/returns` list calls this (POST still `/api/sales/returns`).
- `GET /api/metrics/my-target?month=YYYY-MM` — Uses resolveMetricsScope + getTargetMetrics. Same scope (Employee.boutiqueId for EMPLOYEE). **UI:** `/me/target` calls this (no longer `/api/me/targets`).

All accept optional `boutiqueId` (or `b=`) for ADMIN/SUPER_ADMIN to align with “Working on” selector where implemented.

---

## 6. KPI endpoints audit (resolveMetricsScope + aggregator required)

**Canonical KPI routes** (must use `resolveMetricsScope` + metrics aggregator; no `getScheduleScope` or direct `SalesEntry.aggregate` for sales/target KPIs):

| Route | Scope | Aggregator |
|-------|--------|-------------|
| `GET /api/dashboard` | resolveMetricsScope | getDashboardSalesMetrics |
| `GET /api/metrics/dashboard` | resolveMetricsScope | getDashboardSalesMetrics |
| `GET /api/metrics/my-target` | resolveMetricsScope | getTargetMetrics |
| `GET /api/metrics/sales-my` | resolveMetricsScope | getSalesMetrics |
| `GET /api/metrics/returns` | resolveMetricsScope | Prisma list (same scope) |
| `GET /api/me/targets` | resolveMetricsScope | getTargetMetrics (legacy; prefer my-target) |
| `GET /api/me/sales` | getSalesScope (Employee.boutiqueId for EMPLOYEE) | aligned with metrics scope |
| `GET /api/sales/summary` | getSalesScope | direct aggregate (legacy; /sales/my uses sales-my) |

**Other usages:** Schedule/tasks/inventory use `getScheduleScope` (correct for operational scope). Dashboard route debug block uses direct `prisma.salesEntry.aggregate` for comparison logging only. Executive and admin sales routes use direct aggregate for reports/validation, not the canonical KPI path.

**Rule:** Any new endpoint returning sales actuals, MTD, or target KPIs for /dashboard, /me/target, /sales/my, /sales/returns must use `resolveMetricsScope` + the metrics aggregator.
