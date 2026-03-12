# Phase E — Final Architecture Clarity and Duplication Cleanup

## 1. Architecture Improvements Completed

| Area | Status |
|------|--------|
| **Performance summaries** | Single source: `getPerformanceSummaryExtended`. Home and Dashboard use it. |
| **Employee target endpoints** | `/api/metrics/my-target` canonical; `/api/me/targets` documented as compatibility wrapper. |
| **Dashboard snapshots** | `/api/dashboard` uses `getPerformanceSummaryExtended`; no duplicate logic. |
| **Percent logic** | All use `calculatePerformance` from `lib/performance/performanceEngine.ts`. |
| **Chart abstraction** | `TargetVsActualLineChart` shared by PerformanceLineChart and ExecutiveLineChart. |
| **Card shell** | `CardShell` used by SnapshotCard; Luxury* cards documented. |

---

## 2. Duplication Removed

| Item | Action |
|------|--------|
| **LuxuryActivityCard** | Deleted — unused (Activity block removed from Home in Phase C). |
| **ActivityKpiCard** | Deleted — unused; no imports found. |

---

## 3. Duplication Intentionally Left for Safety

| Item | Reason |
|------|--------|
| **getDashboardSalesMetrics vs getPerformanceSummaryExtended** | Different shapes and consumers. Dashboard uses Extended; `/api/metrics/dashboard` uses getDashboardSalesMetrics for sales-only payload. Same aggregator, same `calculatePerformance`. |
| **/api/me/targets vs /api/metrics/my-target** | Employee Home uses `/api/me/targets`; migration would require UI changes. Both call `getTargetMetrics`; documented as compatibility. |
| **SimpleLineChart** | Single-line only; different use case from TargetVsActualLineChart. Merging would add complexity. |
| **Luxury* vs SnapshotCard** | Different layouts and content. CardShell provides shared shell; full migration deferred. |

---

## 4. Remaining Technical Debt

| Debt | Severity | Notes |
|------|----------|-------|
| Migrate Employee Home to `/api/metrics/my-target` | Low | Same data; `/api/me/targets` kept for compatibility. |
| Consider deprecating `/api/metrics/dashboard` | Low | Used by tests only; no UI consumer. |
| Move SimpleLineChart under `components/charts/` | Low | Folder clarity; no functional change. |
| Executive placeholders ("—", mock variance) | Info | ExecutiveSinglePageClient and ExecutiveDashboardLayout have intentional placeholders for missing data. |
| KpiCard vs ExecKpiBlock vs SnapshotCard | Info | Three KPI patterns; documented in UI_COMPONENTS_GUIDE. No consolidation in this phase. |

---

## 5. Next Recommended Step

1. **Wire Executive placeholders** — When demand engine, target calibration, and anomaly data are available, replace "—" with real values in ExecutiveSinglePageClient.
2. **Optional:** Migrate Employee Home to `/api/metrics/my-target` in a small, isolated PR.
3. **Optional:** Move `SimpleLineChart` to `components/charts/` when touching analytics.

---

## Constraints Respected

- No risky refactors
- No page renames
- No RBAC changes
- No broad module deletions
