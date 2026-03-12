# Canonical API Reference

This document defines the canonical APIs for performance and target metrics. All consumers should prefer these endpoints for consistency and single source of truth.

---

## 1. Manager / Boutique Performance Source

**Canonical API:** `GET /api/performance/summary`

**Purpose:** Unified performance summary for manager/boutique view: daily, weekly, monthly targets, sales, remaining, percent; pace; daily trajectory; top sellers.

**Intended consumers:**
- Home page (manager operational overview)
- Any page needing boutique-level performance snapshot

**Response shape:**
```json
{
  "daily": { "target", "sales", "remaining", "percent" },
  "weekly": { "target", "sales", "remaining", "percent" },
  "monthly": { "target", "sales", "remaining", "percent" },
  "pace": { "expectedPercent", "actualPercent", "deltaPercent", "status" },
  "dailyTrajectory": [{ "dateKey", "targetCumulative", "actualCumulative" }],
  "topSellers": { "today", "week", "month" },
  "daysInMonth", "todayDayOfMonth"
}
```

**Source of truth:** `lib/metrics/aggregator.ts` → `getPerformanceSummaryExtended` → `lib/performance/performanceEngine.ts` → `calculatePerformance`

**Legacy alias endpoints:** None. This is the primary endpoint.

**Migration notes:** Home page already uses this API. Dashboard sales snapshot aligns with the same logic (see Phase A.3).

---

## 2. Employee Target Metrics Source

**Canonical API:** `GET /api/metrics/my-target?month=YYYY-MM`

**Purpose:** Employee target and MTD metrics: month target, daily target, week target, MTD sales, today sales, week sales, remaining, percent (daily/week/month).

**Intended consumers:**
- `/me/target` page
- Any page needing employee-scoped target metrics

**Response shape:**
```json
{
  "monthKey", "monthTarget", "boutiqueTarget",
  "todaySales", "weekSales", "mtdSales",
  "dailyTarget", "weekTarget", "remaining",
  "pctDaily", "pctWeek", "pctMonth",
  "todayStr", "todayInSelectedMonth", "weekRangeLabel",
  "daysInMonth", "leaveDaysInMonth", "presenceFactor", "scheduledDaysInMonth",
  "month", "monthlyTarget", "todayTarget", "mtdPct", "todayPct", "weekPct"
}
```

**Source of truth:** `lib/metrics/aggregator.ts` → `getTargetMetrics` → `lib/performance/performanceEngine.ts` → `calculatePerformance`

**Legacy alias endpoint:** `GET /api/me/targets` — compatibility wrapper. Same data, same logic. Prefer `/api/metrics/my-target` for new consumers.

**Migration notes:** Employee Home and `/me/target` page may use either. Both call `getTargetMetrics` internally. No breaking changes.

---

## 3. Dashboard Sales Snapshot

**Canonical logic:** Aligned with `/api/performance/summary` via `getPerformanceSummaryExtended`.

**Purpose:** Dashboard page needs `snapshot.sales` (currentMonthTarget, currentMonthActual, completionPct, remainingGap) and `byUserId` for sales breakdown.

**Implementation:** Dashboard (`/api/dashboard`) uses `getPerformanceSummaryExtended` for sales snapshot (manager and employee paths). Same source-of-truth logic as Home and `/api/performance/summary`. `/api/metrics/dashboard` still uses `getDashboardSalesMetrics` (same aggregator, same `calculatePerformance`).

**APIs involved:**
- `GET /api/dashboard` — returns full dashboard including `snapshot.sales`; internally uses canonical aggregator
- `GET /api/metrics/dashboard` — returns sales metrics only; uses `getDashboardSalesMetrics` (same aggregator, same `calculatePerformance`)

**Legacy:** `/api/metrics/dashboard` remains for consumers that need only sales metrics. Both `/api/dashboard` and `/api/metrics/dashboard` use the same aggregator logic.

---

## Summary Table

| Use case | Canonical API | Compatibility wrapper |
|----------|---------------|------------------------|
| Manager/boutique performance | `/api/performance/summary` | — |
| Employee target metrics | `/api/metrics/my-target` | `/api/me/targets` |
| Dashboard full payload | `/api/dashboard` | — |
| Dashboard sales only | `/api/metrics/dashboard` | — |

---

## RBAC and Scoping

- **Manager/boutique:** `resolveMetricsScope` → `effectiveBoutiqueId`; employee-only views use `userId` when `employeeOnly`.
- **Employee:** `employeeCrossBoutique: true` when employee needs target/sales across all assigned boutiques (e.g. Employee Home).
- All metrics APIs use `resolveMetricsScope` or equivalent for consistent boutique and employee scoping.

---

## Postponed cleanup (low risk)

- **TODO:** Migrate Employee Home from `/api/me/targets` to `/api/metrics/my-target` for consistency; keep `/api/me/targets` as compatibility wrapper.
- **TODO:** Consider deprecating `/api/metrics/dashboard` if no external consumers; currently used by tests only.
