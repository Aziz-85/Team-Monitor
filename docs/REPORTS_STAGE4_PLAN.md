# Stage 4: Reports Consolidation — Plan

## 1. Report inventory and mapping

### Current report-related routes and nav placement

| Route | Nav group (current) | Nav label key | Roles | Redirect / content |
|-------|----------------------|---------------|--------|---------------------|
| `/executive` | REPORTS | nav.executive | MANAGER, ADMIN, SUPER_ADMIN | Executive single-page (KPIs, tabs: Executive / Operator / Investor) |
| `/executive/monthly` | REPORTS | nav.executiveMonthly | MANAGER, ADMIN, SUPER_ADMIN | Monthly board (month snapshot, daily/staff) |
| `/executive/insights` | REPORTS | nav.executiveInsights | MANAGER, ADMIN, SUPER_ADMIN | Executive insights client |
| `/executive/compare` | REPORTS | nav.executiveCompare | MANAGER, ADMIN, SUPER_ADMIN | Compare boutiques |
| `/executive/employees` | REPORTS | nav.executiveEmployees | MANAGER, ADMIN, SUPER_ADMIN | Employees view |
| `/sales/summary` | SALES | nav.salesSummary | ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN | Date-range summary, week/month/quarter/half/year targets, breakdown by employee |
| `/sales/daily` | SALES | nav.salesDaily | MANAGER, ADMIN, SUPER_ADMIN | Redirects → `/admin/import/sales?section=ledger` (daily ledger) |
| `/admin/targets` | SALES | nav.targets | MANAGER, ADMIN, SUPER_ADMIN | Target management (boutique + employee targets) |
| `/admin/import/sales` | SALES | nav.salesImport | ASSISTANT_MANAGER+ | Import + sections: ledger, monthly, issues (not a pure report) |
| `/sales/monthly-matrix` | — | — | ASSISTANT_MANAGER+ | Redirects → `/admin/import/sales?section=monthly` |
| `/kpi/upload` | SALES | nav.kpiUpload | MANAGER, ADMIN, SUPER_ADMIN | KPI upload (admin tool; not a report view) |

### Mapping to target report model

| Target model | Primary route(s) | Notes |
|--------------|------------------|--------|
| **Daily performance** | `/sales/daily` → ledger section | Today target/actual, achievement %, employee breakdown via import/sales ledger |
| **Weekly performance** | `/sales/summary` (date range = week) | Week target/achieved, pace, daily contribution, ranking via summary + targets API |
| **Monthly performance** | `/executive/monthly`, `/sales/summary` (month) | Month target/actual, gap, projected completion, top/under performers |
| **Executive / KPI** | `/executive`, `/executive/insights`, `/executive/compare`, `/executive/employees` | Overview, insights, compare branches, team performance |

---

## 2. Proposed report structure

### REPORTS as the single reporting group

- **REPORTS** holds all report destinations; no new routes.
- **SALES** keeps only operational actions: My Sales, Returns, Import Sales, Leadership Impact, Sales edit requests, My Target, KPI Upload. Report-like items move to REPORTS only.
- **Labels:** Business-friendly names; avoid “Executive” where “Performance overview” / “Monthly performance” is clearer.

### REPORTS nav order and labels (after change)

| Order | href | Label (en) | Roles |
|-------|------|------------|--------|
| 1 | `/executive` | Performance overview | MANAGER, ADMIN, SUPER_ADMIN |
| 2 | `/executive/monthly` | Monthly performance | MANAGER, ADMIN, SUPER_ADMIN |
| 3 | `/sales/summary` | Sales summary | ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN |
| 4 | `/admin/targets` | Targets | MANAGER, ADMIN, SUPER_ADMIN |
| 5 | `/sales/daily` | Daily sales ledger | MANAGER, ADMIN, SUPER_ADMIN |
| 6 | `/executive/insights` | Insights | MANAGER, ADMIN, SUPER_ADMIN |
| 7 | `/executive/compare` | Compare branches | MANAGER, ADMIN, SUPER_ADMIN |
| 8 | `/executive/employees` | Team performance | MANAGER, ADMIN, SUPER_ADMIN |

- **KPI upload** stays in SALES (admin/upload tool), not in REPORTS.
- **Role visibility:** Unchanged; same roles per route as today.

### SALES nav after trim

- Remove: `sales/daily`, `sales/summary`, `admin/targets` (they live under REPORTS).
- Keep: `sales/my`, `sales/returns`, `admin/import/sales`, `sales/leadership-impact`, `admin/sales-edit-requests`, `me/target`, `admin/targets` → no, we remove admin/targets from SALES. So keep: sales/my, sales/returns, admin/import/sales, leadership-impact, sales-edit-requests, me/target, kpi/upload.

---

## 3. Page hierarchy (minimal, display-only)

- **Sales Summary:** Already has targets (KPI-like) then summary; optionally ensure targets section is clearly “KPIs” and appears first (already does). Add short page subtitle only if needed.
- **Executive:** Already KPI blocks then tabs; no structural change.
- **No redesign** of executive, monthly, insights, compare, employees; only nav and labels.

---

## 4. Files to change

| File | Change |
|------|--------|
| `lib/navConfig.ts` | REPORTS: reorder items; add `sales/summary`, `admin/targets`, `sales/daily` with same role rules. SALES: remove `sales/daily`, `sales/summary`, `admin/targets`. |
| `messages/en.json` | nav.executive → "Performance overview"; nav.executiveMonthly → "Monthly performance"; nav.executiveInsights → "Insights"; nav.executiveCompare → "Compare branches"; nav.executiveEmployees → "Team performance". (salesSummary, targets, salesDaily already exist; keep or tweak for consistency.) |
| `messages/ar.json` | Same keys, Arabic values. |
| `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` | Optional: add brief subtitle under title; ensure targets block is first (already is). |

---

## 5. Rollback

- Revert navConfig (restore REPORTS to 5 executive-only items; restore 3 items to SALES).
- Revert message string changes.
- No API or route changes.

---

## 6. Applied (Stage 4)

- **navConfig:** REPORTS now has 8 items in order: Performance overview, Monthly performance, Sales summary, Targets, Daily sales ledger, Insights, Compare branches, Team performance. New keys `nav.reports.*`. SALES: removed `sales/daily`, `sales/summary`, `admin/targets` (they live under REPORTS only).
- **messages (en/ar):** Added `nav.reports.performanceOverview`, `.monthlyPerformance`, `.salesSummary`, `.targets`, `.dailyLedger`, `.insights`, `.compareBranches`, `.teamPerformance`. Added `sales.summary.subtitle` (en/ar).
- **SalesSummaryClient:** Title + subtitle block; targets section was already first (KPI cards then breakdown).
