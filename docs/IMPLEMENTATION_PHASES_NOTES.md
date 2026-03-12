# Team Monitor Implementation Phases — Notes

## Phase 1 — Number Source of Truth (Completed)

**Changes:**
- `lib/performance/performanceEngine.ts`: Removed clamp on `remaining` — now `remaining = target - sales` (negative allowed for overachievement).
- `lib/metrics/aggregator.ts`: `getTargetMetrics` no longer clamps remaining.
- `app/api/performance/summary/route.ts`: Added `pace` object (expectedPercent, actualPercent, deltaPercent, status).
- `mobile-native/components/ManagerDashboardCards.tsx`: Replaced K/M compact formatting with full integer `toLocaleString()` for SAR display.
- `__tests__/metrics-crosspage.test.ts`: Fixed fixture to use SAR (schema stores SAR_INT, not halalas).

**Unified sources:**
- Performance calculations: `lib/performance/performanceEngine.ts` (calculatePerformance)
- Extended summary: `lib/metrics/aggregator.ts` (getPerformanceSummaryExtended)
- Dashboard sales: `lib/metrics/aggregator.ts` (getDashboardSalesMetrics)
- Mobile manager: `lib/dashboard/managerDashboard.ts` (uses calculatePerformance)

**APIs returning raw integer SAR:**
- `/api/performance/summary` — daily, weekly, monthly targets/sales/remaining
- `/api/metrics/dashboard` — currentMonthTarget, currentMonthActual, remainingGap
- `/api/dashboard` — snapshot.sales (same source)

## Phase 2 — Inverted Charts (Completed)

**Verified:** All charts use `yScale = padding.top + h - (v / maxVal) * h` — 0 at bottom, higher values higher.
- PerformanceLineChart ✓
- ExecutiveLineChart ✓
- SimpleLineChart ✓
- ExecutiveBarChart (horizontal bars) ✓
- MiniSparkline ✓

## Phase 3 — Chart Polish (Completed in prior session)

- Shared `lib/chartStyles.ts` tokens
- `components/ui/ChartCard.tsx` wrapper
- PerformanceLineChart: tooltip, legend, empty state, formatSarInt
- ExecutiveLineChart: tooltip, legend
- SimpleLineChart, SimpleBarChart: zero-at-bottom, empty states
- MiniSparkline: shared tokens

## Phase 4–5 — Home IA & Visual Design (Completed in prior session)

- Section A: Performance cards (Today, Week, Month)
- Section B: Pace indicator
- Section C: MTD Target vs Actual chart
- Section D: Team Highlights
- Section E: Lower operational cards (Coverage, Shift, Key Holder, Tasks, Alerts)

## Phase 6 — Responsive (Completed)

- Home: `overflow-x-hidden` on root, grid layouts (sm:grid-cols-2, lg:grid-cols-3)
- Charts: `max-w-full overflow-hidden`

## Phase 7 — Deduplication (Completed)

- Performance logic centralized in performanceEngine + aggregator
- Dashboard and Home consume same metrics sources
- Mobile manager uses calculatePerformance for daily view

## Phase 8 — Validation

- Numbers: SAR_INT throughout; no /1000, round, ceil for money
- Charts: 0 at bottom; tooltips show full integer SAR
- Home: visual-first, card-based lower section
- Responsive: laptop, tablet, mobile layouts
- RBAC: employee home scoped; no cross-boutique leakage

---

## Phase A — Architecture Hardening (2025-02-25)

### What was unified

1. **Employee target APIs:** `/api/me/targets` is now a thin compatibility wrapper over the same `getTargetMetrics` logic. Both use `resolveMetricsScope` and `employeeCrossBoutique` when employee-only.
2. **Dashboard sales snapshot:** `/api/dashboard` now uses `getPerformanceSummaryExtended` (canonical source) instead of `getDashboardSalesMetrics` for sales snapshot. Same `calculatePerformance` logic; single code path.
3. **Aggregator:** Added `byUserId` to `getPerformanceSummaryExtended` so Dashboard can derive sales breakdown from the same call.

### Canonical APIs

| API | Purpose |
|-----|---------|
| `GET /api/performance/summary` | Manager/boutique performance (daily, weekly, monthly, pace, trajectory, top sellers) |
| `GET /api/metrics/my-target` | Employee target metrics (MTD, daily, week) |

### Compatibility wrappers

| Endpoint | Role |
|----------|------|
| `GET /api/me/targets` | Compatibility wrapper; same data as `/api/metrics/my-target`; preserved for Employee Home |

### No UI redesign

- No changes to Home, Dashboard, Employee Home, or /me/target page UI.
- No visual changes.

### No business logic changes

- Schedule, tasks, leaves, key-holder logic unchanged.
- RBAC and scoping preserved (resolveMetricsScope, employeeOnly, boutiqueId).
- Only deduplication of output paths; same calculations.

---

## Phase B — Percent and Calculation Consistency (2025-02-25)

### Files updated

1. `lib/executive/metrics.ts` — computeRevenueMetrics
2. `app/api/executive/trends/route.ts` — achievementPct
3. `app/api/executive/insights/route.ts` — achievementPct (computeSalesRiskIndex)
4. `app/api/executive/monthly/route.ts` — achievementPct
5. `app/api/executive/employees/[empId]/route.ts` — achievementPct (annual)
6. `app/api/executive/employees/annual/route.ts` — achievementPct
7. `lib/snapshots/loadMonthSnapshotFromExcel.ts` — achievementPct (halalas; same unit)

### Percent calculations migrated to calculatePerformance

| File | Calculation | Notes |
|------|--------------|-------|
| lib/executive/metrics.ts | computeRevenueMetrics achievementPct | Used by insights, risk; now canonical |
| app/api/executive/trends/route.ts | achievementPct (revenue/target) | Weekly trend |
| app/api/executive/insights/route.ts | computeSalesRiskIndex achievementPct | Sales risk input |
| app/api/executive/monthly/route.ts | achievementPct (revenue/target) | Monthly board |
| app/api/executive/employees/[empId]/route.ts | achievementPct (total/annualTarget) | Annual employee |
| app/api/executive/employees/annual/route.ts | achievementPct (rec.total/annualTarget) | Annual list |
| lib/snapshots/loadMonthSnapshotFromExcel.ts | achievementPct (netSalesHalalas/targetVal) | Both halalas; ratio unchanged |

### Percent calculations intentionally left untouched

| Location | Calculation | Reason |
|----------|-------------|--------|
| overduePct (task overdue / total) | Math.round((overdue/total)*100) | Task completion metric, not target/sales |
| suspiciousPct (burst / total) | Math.round((burst/total)*100) | Anti-gaming metric |
| zoneCompliancePct (done / total) | Math.round((done/total)*100) | Zone compliance |
| taskCompletionPct | Math.round((completed/total)*100) | Task completion |
| scheduleBalancePct | Math.round((min/max)*100) | AM vs PM balance |
| revenueTrendPct | (revenue-prev)/prev*100 | Growth rate, not achievement |
| targetChangePct | (target-prev)/prev*100 | Target change |
| lib/executive/score.ts | taskPct, zonePct, schedulePct | Custom composite scores |
| lib/executive/risk.ts | revenueGap, workforceExposure | Risk index components |
| app/api/sales/import-ledger, returns | Math.round(n*100) | Halalas conversion, not percent |
| lib/yoy/*, lib/historical-snapshots/* | Math.round(n*100) | YoY/snapshot loading |
