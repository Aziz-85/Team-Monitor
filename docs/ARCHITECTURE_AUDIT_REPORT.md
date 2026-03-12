# Team Monitor — Architecture Audit Report

**Date:** 2025-02-25  
**Scope:** Full project structure, duplication, APIs, UI, navigation, performance metrics, charts  
**Constraint:** Analysis and recommendations only — no destructive refactors

---

## 1. Project Structure Map

### 1.1 app/(dashboard) — Page Routes

| Route | Purpose | Role Access |
|-------|---------|-------------|
| `/` | Home (manager operational overview) | MANAGER, ADMIN, SUPER_ADMIN |
| `/dashboard` | Executive/branch dashboard | All roles |
| `/employee` | Employee home (own schedule, tasks, sales entry) | EMPLOYEE, ASSISTANT_MANAGER |
| `/executive` | Executive performance overview | ADMIN, SUPER_ADMIN, MANAGER, AREA_MANAGER |
| `/executive/monthly` | Monthly board | Same |
| `/executive/insights` | Executive insights | Same |
| `/executive/compare` | Compare boutiques | Same |
| `/executive/network` | Network view | Same |
| `/executive/employees` | Team performance | Same |
| `/sales/*` | Sales daily, import, summary, my, returns | Various |
| `/schedule/*` | Schedule view, edit, audit | Various |
| `/tasks/*` | Tasks, monitor, setup | Various |
| `/inventory/*` | Daily, zones, follow-up | Various |
| `/leaves/*` | Leaves, requests | Various |
| `/me/target` | My target | All |
| `/admin/*` | Administration | ADMIN, SUPER_ADMIN |
| `/area/*` | Area employees, targets | AREA_MANAGER |

### 1.2 app/api — API Routes (Performance / Summary)

| API | Purpose | Data Source |
|-----|---------|-------------|
| `/api/home` | Roster, coverage, today tasks | rosterForDate, validateCoverage, tasks |
| `/api/dashboard` | Sales snapshot, schedule, tasks, team | getDashboardSalesMetrics, roster, tasks |
| `/api/performance/summary` | Daily/weekly/monthly, pace, trajectory, topSellers | getPerformanceSummaryExtended |
| `/api/metrics/dashboard` | Current month target/actual/completion/remaining | getDashboardSalesMetrics |
| `/api/metrics/my-target` | Employee target metrics (MTD, daily, week) | getTargetMetrics |
| `/api/me/targets` | Same as my-target (alias shape) | getTargetMetrics |
| `/api/employee/home` | Roster, today schedule, my tasks | rosterForDate, tasks |
| `/api/mobile/dashboard/manager` | Mobile manager dashboard | getManagerDashboard |
| `/api/sales/summary` | Sales summary by range | getSalesMetrics |
| `/api/sales/summary/targets` | Targets summary | — |
| `/api/executive` | Executive aggregation | Multiple sources |

### 1.3 components/ — Key Directories

| Directory | Purpose |
|-----------|---------|
| `components/dashboard/` | Performance cards, charts, ExecutiveDashboard |
| `components/dashboard/cards/` | SalesPerformanceCard, ScheduleHealthCard, TaskControlCard, SnapshotCard |
| `components/dashboard/home/` | CoverageStatusCard, ShiftSnapshotCard, KeyHolderCard, TasksTodayCard, OperationalAlertsCard |
| `components/dashboard/analytics/` | SalesAnalyticsSection, SimpleLineChart, SimpleBarChart |
| `components/dashboard-ui/` | ExecSparkline, ExecStackedBar, ExecKpiBlock, ExecTable |
| `components/executive/` | ExecutiveLineChart, ExecutiveBarChart |
| `components/ui/` | ChartCard, OpsCard, StatusPill, etc. |

### 1.4 lib/ — Performance & Metrics

| Module | Purpose |
|--------|---------|
| `lib/performance/performanceEngine.ts` | **Single source** — calculatePerformance(target, sales) |
| `lib/metrics/aggregator.ts` | getDashboardSalesMetrics, getTargetMetrics, getPerformanceSummary, getPerformanceSummaryExtended |
| `lib/metrics/scope.ts` | resolveMetricsScope (RBAC for metrics) |
| `lib/dashboard/managerDashboard.ts` | Mobile manager (tasks, sales, coverage) — uses calculatePerformance |
| `lib/chartStyles.ts` | Shared chart design tokens |
| `lib/sales/targetsPct.ts` | Target percent utilities |
| `lib/executive/*` | Executive-specific aggregation (different domain: month snapshots, halalas) |

---

## 2. Duplication Detection

### 2.1 Performance Calculations — ✅ Centralized

| Location | Uses |
|----------|------|
| `lib/performance/performanceEngine.ts` | calculatePerformance |
| `lib/metrics/aggregator.ts` | calculatePerformance for all periods |
| `app/api/dashboard/route.ts` | getDashboardSalesMetrics, calculatePerformance (per-employee) |
| `app/api/metrics/dashboard/route.ts` | getDashboardSalesMetrics |
| `app/api/performance/summary/route.ts` | getPerformanceSummaryExtended |
| `app/api/metrics/my-target/route.ts` | getTargetMetrics |
| `app/api/me/targets/route.ts` | getTargetMetrics |
| `lib/dashboard/managerDashboard.ts` | calculatePerformance |
| `app/api/executive/*` | calculatePerformance (achievement %) |

**Finding:** Performance calculations are centralized. `calculatePerformance` is the single source. Executive APIs use it for achievement %; some executive code uses raw `Math.round((revenue/target)*100)` — consider migrating to `calculatePerformance` for consistency.

### 2.2 Sales Aggregation — Partial Overlap

| API | Aggregation Logic | Overlap |
|-----|-------------------|---------|
| `/api/metrics/dashboard` | getDashboardSalesMetrics (boutique or employee MTD) | Same as dashboard snapshot |
| `/api/dashboard` | getDashboardSalesMetrics for snapshot.sales | **Duplicate** — dashboard could call /api/metrics/dashboard or /api/performance/summary |
| `/api/performance/summary` | getPerformanceSummaryExtended (daily, weekly, monthly, trajectory) | Different shape; Home uses this |
| `/api/metrics/my-target` | getTargetMetrics (employee MTD, daily, week) | Used by /me/target, Employee home |
| `/api/me/targets` | getTargetMetrics | **Same data** as my-target, different response shape |

**Finding:** `/api/me/targets` and `/api/metrics/my-target` return equivalent data. Consider deprecating one or documenting which is canonical.

### 2.3 Chart Data Preparation — Minimal Duplication

| Location | Transformation |
|----------|----------------|
| `HomePageClient.tsx` | `trajectory.map(d => ({ label: d.dateKey.slice(-2), value: d.actualCumulative }))` |
| `lib/metrics/aggregator.ts` | Builds dailyTrajectory in getPerformanceSummaryExtended |

**Finding:** Chart data is prepared once in aggregator; Home only maps for display. No significant duplication.

---

## 3. UI Duplication

### 3.1 KPI / Performance Cards

| Component | Used In | Purpose |
|-----------|---------|---------|
| `LuxuryPerformanceCard` | Home | Today/Week/Month target, sales, remaining, % |
| `SalesPerformanceCard` | Dashboard | Monthly target, actual, completion %, remaining |
| `KPICard` (inline in ExecutiveDashboardClient) | Executive | Overdue %, balance %, risk index |
| `SnapshotCard` | Dashboard cards | Wrapper for SalesPerformanceCard, ScheduleHealthCard, TaskControlCard |
| `CircularProgressCard` | — | Legacy? (target, sales, remaining, percent) |
| `PaceIndicatorCard` | — | Legacy? (pace) |
| `LuxuryPaceCard` | Home | Expected vs actual pace |
| `TopSellerCard` / `LuxuryTopSellerCard` | Home | Top seller display |

**Finding:** Two parallel card families:
- **Home:** Luxury* (LuxuryPerformanceCard, LuxuryPaceCard, LuxuryTopSellerCard)
- **Dashboard:** SnapshotCard + SalesPerformanceCard, ScheduleHealthCard, TaskControlCard

Recommendation: Unify into a single KPI card pattern (e.g. `PerformanceCard` with variants) or document when to use each.

### 3.2 Chart Components

| Component | Used In |
|-----------|---------|
| `PerformanceLineChart` | Home (MTD target vs actual) |
| `ExecutiveLineChart` | Executive dashboard, insights |
| `ExecutiveBarChart` | Executive dashboard |
| `SimpleLineChart` | SalesAnalyticsSection |
| `SimpleBarChart` | SalesAnalyticsSection |
| `MiniSparkline` | LuxuryPerformanceCard |
| `ExecSparkline` | Executive dashboard-ui |
| `ExecStackedBar` | Executive dashboard-ui |

**Finding:** Shared `lib/chartStyles.ts` exists. PerformanceLineChart and ExecutiveLineChart are similar (target vs actual) but styled differently. Consider a shared `TargetVsActualLineChart` with theme prop.

---

## 4. Navigation Overlap

| Page | Purpose | Data Shown | Overlap |
|------|---------|------------|---------|
| **Home** (`/`) | Manager operational command center | Performance (today/week/month), pace, MTD chart, top sellers, coverage, shifts, key holder, tasks | Manager-only; visual overview |
| **Dashboard** (`/dashboard`) | Branch/executive dashboard | Sales snapshot, schedule health, task control, alerts, sales breakdown, team table | All roles; more detail for managers |
| **Employee Home** (`/employee`) | Employee personal view | Own schedule (AM/PM), my tasks, today/monthly target & sales, sales entry form | Employee-scoped; includes data entry |
| **Executive** (`/executive`) | Performance overview | KPIs, sales vs target trend, task completion, zone compliance | Manager+; analytics focus |
| **Mobile Dashboard** | Mobile manager view | Tasks done/total, sales achieved/target, coverage | Manager; simplified |

### Overlap Table

| Page | Purpose | Overlap | Recommendation |
|------|---------|---------|----------------|
| Home | Operational command center | Shares performance numbers with Dashboard | Keep distinct: Home = quick operational; Dashboard = detailed control |
| Dashboard | Branch control center | Shares sales snapshot with Home | Dashboard could consume /api/performance/summary for consistency |
| Employee Home | Employee personal | Different scope (own data); has sales entry | Keep; ensure /api/me/targets uses same metrics as Home/Dashboard |
| Executive | Analytics/reports | Different audience; executive-specific KPIs | Keep; uses different data (month snapshots, halalas in some paths) |
| Mobile Dashboard | Mobile manager | Simplified version of Home/Dashboard | Keep; uses getManagerDashboard (single-day focus) |

---

## 5. API Structure Review

### 5.1 Summary/Performance APIs — Overlap

| API | Returns | Consumer |
|-----|---------|----------|
| `/api/performance/summary` | daily, weekly, monthly, pace, dailyTrajectory, topSellers | Home |
| `/api/metrics/dashboard` | currentMonthTarget, currentMonthActual, completionPct, remainingGap, byUserId | Dashboard (indirect via /api/dashboard) |
| `/api/dashboard` | snapshot.sales (same shape as metrics/dashboard), + schedule, tasks, team | Dashboard page |
| `/api/metrics/my-target` | monthTarget, mtdSales, todaySales, weekSales, dailyTarget, weekTarget, remaining, pct* | /me/target page |
| `/api/me/targets` | todayTarget, todaySales, monthlyTarget, mtdSales, remaining, pct* | Employee home |

**Recommendation:** Document canonical APIs:
- **Boutique/manager performance:** `/api/performance/summary` (already includes daily, weekly, monthly)
- **Employee target metrics:** `/api/metrics/my-target` (prefer over /api/me/targets for consistency)
- **Dashboard:** Could refactor to call `/api/performance/summary` for sales snapshot instead of duplicating getDashboardSalesMetrics in /api/dashboard

### 5.2 APIs Doing Same Calculation

- `getDashboardSalesMetrics` and `getPerformanceSummary` both compute MTD from same sources (BoutiqueMonthlyTarget, SalesEntry). They are in same aggregator; no logic duplication.
- `getTargetMetrics` and `getPerformanceSummary` overlap for employee view; getPerformanceSummary is boutique-focused, getTargetMetrics is employee-focused. Both use calculatePerformance.

---

## 6. Performance Source of Truth

### 6.1 Rules Compliance

| Rule | Status |
|------|--------|
| All monetary values stored as integer SAR | ✅ SalesEntry.amount, BoutiqueMonthlyTarget.amount are Int (SAR) |
| No scaling like /1000 | ✅ No /1000 in performance pipeline |
| No float math for money | ✅ performanceEngine uses Math.trunc |
| No Math.round/ceil/toFixed for money calculations | ⚠️ See exceptions below |

### 6.2 Exceptions (Non-Money Context)

| File | Pattern | Context |
|------|---------|---------|
| `app/api/admin/month-snapshot/upload/route.ts` | `Math.round(mtdSalesHalalas / 100)` | Month snapshot uses halalas; conversion to SAR |
| `app/api/sales/returns/route.ts` | `Math.round(amountNum * 100)` | Converting decimal to halalas for storage |
| `lib/utils/money.ts` | `Math.round(n / 100)` | formatSarFromHalala — halala to SAR display |
| `app/(dashboard)/executive/ExecutiveSinglePageClient.tsx` | `Math.round(halalasInt / 100)` | Month snapshot domain uses halalas |
| `lib/yoy/loadYoYFromExcel.ts` | `Math.round(n * 100)` | YoY loading (different domain) |

**Finding:** Main performance pipeline (Home, Dashboard, metrics) uses SAR_INT. Executive single page and month snapshots use a halalas-based domain — intentional for that module. No /1000 scaling in performance path.

### 6.3 Percent Calculations

Many places use `Math.round((x/y)*100)` for percentages (achievement, completion, etc.). `calculatePerformance` uses `Math.floor((sales*100)/target)` for percent. For consistency, consider using `calculatePerformance` wherever target/sales percent is needed.

---

## 7. Chart System Audit

### 7.1 Y-Axis Direction

| Component | Y-Scale | 0 at Bottom |
|-----------|---------|-------------|
| PerformanceLineChart | `yScale = padding.top + h - (v/maxVal)*h` | ✅ |
| ExecutiveLineChart | Same | ✅ |
| SimpleLineChart | Same | ✅ |
| ExecutiveBarChart | Horizontal bars | N/A |
| MiniSparkline | `y = h - (v/max)*(h-4) + 2` | ✅ |

**Finding:** All charts correctly have 0 at bottom. No inversion.

### 7.2 Shared Chart Wrapper

- `lib/chartStyles.ts` — design tokens ✅
- `components/ui/ChartCard.tsx` — card wrapper ✅
- No single chart component that wraps all line charts; PerformanceLineChart and ExecutiveLineChart are separate implementations.

**Recommendation:** Consider `TargetVsActualLineChart` that accepts theme ('home' | 'executive') to reduce duplication between PerformanceLineChart and ExecutiveLineChart.

### 7.3 Tooltip / Legend Consistency

- PerformanceLineChart: card-like tooltip, Actual/Target legend ✅
- ExecutiveLineChart: tooltip, legend ✅
- SimpleLineChart: no tooltip (minimal) — acceptable for analytics

---

## 8. Component Structure Cleanup

### 8.1 Current Hierarchy

```
components/
├── dashboard/           # Mixed: cards, charts, sections
│   ├── cards/           # SnapshotCard, SalesPerformanceCard, etc.
│   ├── home/            # Home-specific cards
│   ├── analytics/       # Sales analytics + SimpleLineChart, SimpleBarChart
│   └── *.tsx            # LuxuryPerformanceCard, PerformanceLineChart, etc.
├── dashboard-ui/        # Executive-specific (ExecSparkline, ExecKpiBlock)
├── executive/           # ExecutiveLineChart, ExecutiveBarChart
└── ui/                  # ChartCard, OpsCard, primitives
```

### 8.2 Recommendations

1. **Card consolidation:** Create `components/cards/` with:
   - `PerformanceCard` (unified target/sales/remaining/percent)
   - `SnapshotCard` (keep as wrapper)
   - Document when to use Luxury* vs SnapshotCard family

2. **Chart consolidation:** Move `PerformanceLineChart`, `ExecutiveLineChart`, `SimpleLineChart` under `components/charts/` with shared base or `TargetVsActualLineChart` abstraction.

3. **Dashboard vs home:** `components/dashboard/home/` is clear. Consider `components/dashboard/executive/` for ExecutiveDashboardClient-specific blocks to separate from branch dashboard.

---

## 9. Home Page Role Clarity

### 9.1 Current Role

Home acts as **operational command center**:
- Performance snapshot (Today, Week, Month)
- Pace indicator
- MTD target vs actual chart
- Team highlights (top sellers)
- Activity placeholders (invoices, avg ticket, best hour)
- Coverage status, shift snapshot, key holder, tasks, operational alerts

### 9.2 Assessment

| Criterion | Status |
|-----------|--------|
| Visual operational overview | ✅ Card-based, visual hierarchy |
| Not heavy analytics | ✅ Chart is MTD only; no deep drill-down |
| Not data entry | ✅ No forms on Home (except date picker) |
| Not configuration | ✅ No settings |

**Recommendation:** Home role is clear. Activity block (Invoices today, Average ticket, Best hour) shows "—" — either wire to real data or remove to reduce clutter.

---

## 10. Summary — Recommendations for Cleanup

### High Priority (Safe, High Impact)

1. **Document canonical APIs:** Add `docs/API_CANONICAL.md` stating:
   - `/api/performance/summary` for manager/boutique performance
   - `/api/metrics/my-target` for employee target metrics (prefer over /api/me/targets)
   - `/api/metrics/dashboard` for dashboard sales snapshot

2. **Unify /api/me/targets and /api/metrics/my-target:** Either deprecate one or have both call getTargetMetrics and return same shape.

3. **Migrate raw percent calculations to calculatePerformance:** In executive APIs (alerts, anomalies, insights, trends) where `Math.round((revenue/target)*100)` is used, use `calculatePerformance` for consistency.

### Medium Priority (Structural)

4. **Card component audit:** Document Luxury* vs SnapshotCard usage; consider single PerformanceCard with variants.

5. **Chart abstraction:** Create `TargetVsActualLineChart` used by Home and Executive with theme prop.

6. **Dashboard API refactor:** Have /api/dashboard call /api/performance/summary for sales snapshot instead of getDashboardSalesMetrics directly — reduces duplication and ensures same numbers as Home.

### Low Priority (Nice to Have)

7. **Component folder restructure:** `components/charts/`, `components/cards/` for clearer hierarchy.

8. **Activity block on Home:** Wire or remove "Invoices today", "Average ticket", "Best hour".

### Do Not Do

- Do not remove APIs without deprecation path
- Do not rename pages
- Do not change schedule, key-holder, task, or leave logic
- Do not modify working RBAC

---

## Appendix A — API Consumer Map

| Consumer | APIs Called |
|----------|-------------|
| Home | /api/performance/summary, /api/home, /api/tasks/my-today, /api/schedule/week |
| Dashboard | /api/dashboard |
| Employee Home | /api/employee/home, /api/me/targets, /api/me/sales, /api/sales/entry |
| /me/target | /api/metrics/my-target |
| Mobile Manager | /api/mobile/dashboard/manager |
| Executive | /api/executive, /api/executive/alerts, etc. |

---

## Appendix B — Performance Calculation Flow

```
BoutiqueMonthlyTarget.amount (SAR)
SalesEntry.amount (SAR)
        ↓
getDailyTargetForDay() [lib/targets/dailyTarget]
        ↓
calculatePerformance({ target, sales }) [lib/performance/performanceEngine]
        ↓
{ target, sales, remaining, percent }
        ↓
getDashboardSalesMetrics / getPerformanceSummary / getTargetMetrics
        ↓
APIs → UI (formatSarInt for display)
```
