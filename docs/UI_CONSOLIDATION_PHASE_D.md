# Phase D — UI System Consolidation

## Summary

Phase D introduced shared abstractions to reduce UI duplication without destructive rewrites.

---

## 1. Shared Components Introduced

### TargetVsActualLineChart
- **Path:** `components/charts/TargetVsActualLineChart.tsx`
- **Purpose:** Unified target-vs-actual line chart for Home and Executive
- **Props:** `data`, `targetLine`, `height`, `valueFormat`, `emptyLabel`, `theme` ('home' | 'executive')
- **Behavior:** 0 at bottom, tooltips, labels, legend preserved; theme controls colors and sizing

### CardShell
- **Path:** `components/dashboard/cards/CardShell.tsx`
- **Purpose:** Shared card shell for consistent styling
- **Variants:** `dashboard` (rounded-lg, p-5, shadow-card), `luxury` (rounded-2xl, p-6, shadow-sm)
- **Usage:** SnapshotCard uses `variant="dashboard"`

---

## 2. Duplicated Components Reduced

| Before | After |
|--------|-------|
| PerformanceLineChart (~270 lines) | Thin wrapper (~25 lines) over TargetVsActualLineChart |
| ExecutiveLineChart (~240 lines) | Thin wrapper (~25 lines) over TargetVsActualLineChart |
| SnapshotCard (inline styles) | Uses CardShell for shell styling |

**Chart logic:** ~400 lines of duplicated SVG/tooltip logic consolidated into TargetVsActualLineChart.

---

## 3. Components Intentionally Left Separate

| Component | Reason |
|-----------|--------|
| **SimpleLineChart** | Single-line only, no target; used in SalesAnalyticsSection. Different use case; merging would add unnecessary complexity. |
| **LuxuryPerformanceCard** | Home-specific layout (circular progress, sparkline). Content differs from SnapshotCard. Migration risk high; CardShell `luxury` variant available for future use. |
| **LuxuryPaceCard** | Status-colored layout; no direct SnapshotCard equivalent. |
| **LuxuryTopSellerCard** | Simple name+amount; could use CardShell in future but low priority. |
| **SalesPerformanceCard, ScheduleHealthCard, TaskControlCard** | Use SnapshotCard (which now uses CardShell). No change needed. |
| **Home cards** (CoverageStatusCard, ShiftSnapshotCard, etc.) | Domain-specific; no shared structure with Dashboard cards. |

---

## 4. Folder Restructuring

**Status:** Postponed for safety.

- `TargetVsActualLineChart` lives in `components/charts/` (new folder).
- `PerformanceLineChart` and `ExecutiveLineChart` remain in original locations; they re-export/wrap the shared chart.
- No broad move/rename of existing components to avoid breaking imports.
- **TODO:** Consider moving `SimpleLineChart` under `components/charts/` in a future low-risk change.

---

## Constraints Respected

- No business logic changes
- No API changes
- No page role changes
- No broad destructive UI rewrite
