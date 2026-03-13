# UI Consistency Audit Report

**Date:** February 25, 2025  
**Scope:** Visual consistency, component duplication, layout patterns, design tokens, folder structure  
**Constraints:** Analysis only — no refactors, no API changes, no business logic changes

---

## Executive Summary

The audit identified **P0–P2** duplication across cards, charts, layouts, and design tokens. The codebase has good foundations (shared `TargetVsActualLineChart`, `chartStyles.ts`, `CardShell` variants) but several areas show repeated patterns that could be consolidated for maintainability.

---

## Phase 1 — Card Component Audit

### 1.1 Cards with Similar KPI Structures

| Component | Page(s) Used | Visual Structure | Duplication Level | Recommended Strategy |
|-----------|--------------|------------------|-------------------|----------------------|
| **LuxuryPerformanceCard** | Home | Title + circular % + metric (target/sales/remaining) + progress bar | **High** | Extract shared `PerformanceKpiCard` base; LuxuryPerformanceCard adds sparkline + circular ring |
| **CircularProgressCard** | (likely Employee/Sales) | Title + circular % + target/sales/remaining text | **High** | Same target/sales/remaining pattern as LuxuryPerformanceCard; unify under shared base |
| **SalesPerformanceCard** | Executive Dashboard | SnapshotCard wrapper + target/actual + % + ProgressBar + remaining gap | **Medium** | Uses SnapshotCard + ProgressBar; different data shape; keep but ensure ProgressBar variant alignment |
| **Sales Summary inline KPI** | Sales Summary | Inline `rounded-2xl border...` + label + achieved + target/remaining + progress bar | **High** | Same structure as LuxuryPerformanceCard; use shared KPI card or ChartCard-style wrapper |
| **ExecutiveDashboardClient KPICard** | Executive Dashboard | Inline `rounded-2xl border-[#E8DFC8]` + title + value + delta + optional progress bar | **High** | Different border color (`#E8DFC8`); extract to shared component with theme prop |

### 1.2 Cards Sharing Same Visual Structure, Different Names

| Component | Page(s) | Shared Pattern | Duplication Level |
|-----------|---------|----------------|-------------------|
| **CoverageStatusCard** | Home | `rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md` | **Medium** |
| **TasksTodayCard** | Home | Same outer shell | **Medium** |
| **KeyHolderCard** | Home | Same outer shell | **Medium** |
| **OperationalAlertsCard** | Home | Same outer shell | **Medium** |
| **ShiftSnapshotCard** | Home | Same outer shell | **Medium** |
| **ChartCard** | (unused in current pages) | Same shell + title/subtitle | **Low** |

**Finding:** Six home cards + ChartCard use nearly identical outer styling. `CardShell` (dashboard/cards) has a `luxury` variant that matches, but home cards do **not** use CardShell — they inline the classes.

### 1.3 Repeated Layout Patterns (Title + Subtitle + Metric + Progress)

| Pattern | Components | Notes |
|---------|------------|-------|
| **Title (uppercase) + metric + progress bar** | LuxuryPerformanceCard, SalesPerformanceCard, Sales Summary KPI, ExecutiveDashboardClient KPICard, EmployeeHomeClient OpsCard | Progress bar logic duplicated (emerald/amber/red thresholds) |
| **Title + subtitle + value** | KeyHolderCard, TasksTodayCard, SnapshotCard | Subtitle placement varies (`-mt-3 mb-4` vs `-mt-2 mb-3`) |

### 1.4 CardShell Fragmentation

| Location | Component | Styling |
|----------|------------|---------|
| `components/dashboard/cards/CardShell` | CardShell | `rounded-lg` (dashboard) / `rounded-2xl` (luxury) |
| `components/ui/CardShell` | CardShell | `rounded-card p-5 shadow-card` + CSS vars |
| `components/ui/Card.tsx` | Card | `rounded-xl p-4 md:p-5` + inline style |
| `components/ui/OpsCard` | OpsCard | `rounded-xl p-4 md:p-6` |
| `components/ui/PanelCard` | PanelCard | `rounded-xl p-5` + title/actions layout |
| `components/ui/ChartCard` | ChartCard | `rounded-2xl p-6` |

**Finding:** Two different `CardShell` components exist (`dashboard/cards` vs `ui`). Home cards bypass both and use inline `rounded-2xl border border-border bg-surface p-6`.

---

## Phase 2 — Chart System Audit

### 2.1 Charts Implementing Same Logic Independently

| Chart | Location | Logic | Duplication |
|-------|----------|-------|-------------|
| **PerformanceLineChart** | dashboard/ | Wraps TargetVsActualLineChart (theme=home) | ✅ No duplication |
| **ExecutiveLineChart** | executive/ | Wraps TargetVsActualLineChart (theme=executive) | ✅ No duplication |
| **TargetVsActualLineChart** | charts/ | Shared base; tooltip, axis, scaling | ✅ Centralized |
| **SimpleLineChart** | dashboard/analytics/charts/ | Single-line, no target; own axis/grid logic | **Medium** — different use case; could share axis scaling with chartStyles |
| **SimpleBarChart** | dashboard/analytics/charts/ | Horizontal bar list; not SVG bars | **Low** — different from ExecutiveBarChart |
| **ExecutiveBarChart** | executive/ | SVG horizontal bars; hardcoded `#B8860B` | **Medium** — color should come from chartStyles |

### 2.2 Duplicated Logic

| Logic | Locations | Risk |
|-------|-----------|------|
| **Empty state** | SimpleLineChart, SimpleBarChart, TargetVsActualLineChart, ExecutiveBarChart | **P2** — Same SVG icon + "No data" pattern; extract `ChartEmptyState` |
| **Axis scaling (y)** | SimpleLineChart, TargetVsActualLineChart | **P1** — Both use `maxVal`, `yScale`; could share util |
| **Value formatting** | All charts | **P2** — Default `toLocaleString()`; acceptable |

### 2.3 Sparkline Duplication

| Component | Location | Scaling | Styling |
|-----------|----------|---------|---------|
| **MiniSparkline** | dashboard/ | `y = h - (v/max)*(h-4) + 2`; uses chartStyles tokens | Used by LuxuryPerformanceCard |
| **ExecSparkline** | dashboard-ui/ | `y = padding + h - ((v-min)/range)*h` (min-max range) | **Not used anywhere** — dead code |

**Finding:** ExecSparkline is defined but never imported. MiniSparkline uses zero-at-bottom; ExecSparkline uses min-max range. Consolidation: either remove ExecSparkline or unify under a single `SparklineChart` with `scale="zero" | "minmax"`.

### 2.4 Chart Styling Inconsistencies

| Chart | Border/Background | Grid | Colors |
|-------|-------------------|------|--------|
| TargetVsActualLineChart | None (parent provides) | chartStyles | chartStyles ✅ |
| SimpleLineChart | `rounded-xl border border-border bg-surface-subtle/50` | CHART_GRID_COLOR | CHART_ACTUAL_COLOR ✅ |
| SimpleBarChart | `rounded-xl border border-border bg-surface-subtle/50` | N/A | `bg-teal-600` (hardcoded) |
| ExecutiveBarChart | Parent | N/A | `#B8860B` (hardcoded; should use CHART_EXECUTIVE_*) |

### 2.5 Legend Structure

- **TargetVsActualLineChart:** Inline legend (Actual / Target) with theme-specific sizing ✅
- **SimpleLineChart, SimpleBarChart:** No legend (single series) ✅
- **ExecutiveBarChart:** No legend ✅

---

## Phase 3 — Dashboard Layout Consistency

### 3.1 Card Spacing

| Page | Section | Grid | Gap | Card Padding |
|------|---------|------|-----|---------------|
| **Home** | Performance | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` | `gap-6` | p-6 |
| **Home** | Operational | `grid-cols-1 lg:grid-cols-2` | `gap-6` | p-6 |
| **Executive Dashboard** | Top 4 cards | `sm:grid-cols-2 lg:grid-cols-4` | `gap-6` | CardShell p-5 |
| **Sales Summary** | Boutique targets | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` | `gap-4` | p-5 |
| **Sales Summary** | Sales strip | `grid-cols-2 md:grid-cols-4` | `gap-4` | p-4 |
| **Employee Home** | Targets | `md:grid-cols-2` | `gap-4` | OpsCard !p-3 |
| **ExecutiveDashboardClient** | KPIs | `xl:grid-cols-6` | `gap-4` | p-4 |

**Inconsistencies:**
- Home uses `gap-6`; Sales Summary uses `gap-4` for similar card grids.
- Card padding: `p-4`, `p-5`, `p-6` used interchangeably.
- ExecutiveDashboardClient uses `border-[#E8DFC8]` instead of `border-border`.

### 3.2 Grid Column Structure

| Page | Pattern |
|------|---------|
| Home | `max-w-7xl px-4 py-6 sm:px-6 lg:px-8` |
| Employee Home | `max-w-4xl` + `p-4 md:p-6` |
| Sales Summary | `max-w-6xl space-y-6` (no horizontal padding on container) |
| Executive Dashboard | `max-w-7xl p-4 md:p-6 pb-nav` |
| ExecutiveDashboardClient | `max-w-7xl space-y-6 p-4 md:p-6` |
| ExecutiveDashboardLayout | `grid-cols-12 gap-4` |

**Finding:** `max-w-4xl` vs `max-w-6xl` vs `max-w-7xl` — no standard. Section spacing: `space-y-6`, `mb-6`, `mb-10` mixed.

### 3.3 Header Hierarchy

| Level | Home | Sales Summary | Executive Dashboard |
|-------|------|---------------|---------------------|
| Section | `text-sm font-semibold uppercase tracking-[0.12em] text-muted` | `text-xs font-semibold uppercase tracking-[0.12em] text-muted` | `text-sm font-semibold text-muted` |
| Card title | `text-sm font-semibold uppercase tracking-[0.12em] text-muted` | — | — |

**Inconsistency:** Section headers use `text-sm` vs `text-xs` across pages.

### 3.4 Subtitle Usage

- Home: `text-xs text-muted` for date context, chart subtitle.
- Sales Summary: `text-xs text-muted` for chart, `text-xs` for KPI sub.
- Executive: `text-sm text-muted` for page subtitle.

### 3.5 Inline Card Wrappers (Not Using Components)

| Page | Location | Inline Pattern |
|------|----------|-----------------|
| Home | Target vs Actual chart | `rounded-2xl border border-border bg-surface p-6 shadow-sm... md:p-8` |
| Home | Tasks for date (assigned) | `rounded-2xl border border-border bg-surface p-6 shadow-sm...` |
| Home | Week summary | `rounded-2xl border border-border bg-surface p-6 shadow-sm` |
| Sales Summary | KPI cards | `rounded-2xl border border-border bg-surface p-5 shadow-sm...` |
| Sales Summary | Chart container | `rounded-2xl border... p-6 md:p-8` |
| Sales Summary | Sales strip cards | `rounded-2xl border... p-4` |
| ExecutiveDashboardClient | All chart/KPI cards | `rounded-2xl border border-[#E8DFC8] bg-white p-4` |

**Finding:** ChartCard exists but is not used. Home and Sales Summary could use ChartCard for chart containers.

---

## Phase 4 — Design Token Consistency

### 4.1 Duplicated Color Constants

| Constant | Locations | Value |
|----------|-----------|-------|
| **GOLD / Executive accent** | ExecutiveBarChart, ExecutiveDashboardClient | `#B8860B`, `#C6A756`, `#E8DFC8`, `#F8F4E8` |
| **chartStyles** | chartStyles.ts | `CHART_EXECUTIVE_ACTUAL_COLOR = #B8860B`, `CHART_EXECUTIVE_TARGET_COLOR = #D4C4A8` |
| **Performance thresholds** | LuxuryPerformanceCard, SalesSummaryClient, SalesBreakdownSection | emerald/amber/red at 100/60 |

**Recommendation:** Add `EXECUTIVE_CARD_BORDER`, `EXECUTIVE_CARD_BG` to chartStyles or a shared `executiveTheme.ts`. Use `CHART_EXECUTIVE_*` in ExecutiveBarChart.

### 4.2 Progress Bar Styles

| Component | Height | Track | Fill |
|-----------|--------|-------|------|
| **ProgressBar** (cards) | h-2 | `bg-surface-subtle` | variant: default/orange/red (sky-600, amber-500, red-500) |
| **LuxuryPerformanceCard** | h-1.5 | `bg-neutral-100` | emerald/amber/red |
| **EmployeeHomeClient** | h-2 | `bg-surface-subtle` | `bg-accent`, `bg-emerald-600` |
| **Sales Summary KPI** | h-2 | `bg-surface-subtle` | getPerformanceColor (emerald/amber/red) |
| **ExecStackedBar** | 6px | `bg-surface-subtle` | `bg-blue-700` |
| **ExecutiveDashboardClient KPICard** | h-1.5 | `bg-surface-subtle` | GOLD |

**Inconsistencies:**
- Track: `bg-neutral-100` vs `bg-surface-subtle`.
- Height: `h-1.5` vs `h-2`.
- ProgressBar uses `sky-600` for default; others use `emerald` or `accent` for "good".

### 4.3 Badge Styles

| Component | Variants | Styling |
|-----------|----------|---------|
| **Badge** | neutral, success, warning, danger | `bg-blue-50 text-blue-700` (success), `bg-amber-50 text-foreground` (warning) |
| **StatusPill** | primary, backup1, backup2, unassigned, etc. | `bg-blue-50 text-blue-900 border-blue-200` |
| **ExecBadge** | ok, watch, action, neutral | `bg-emerald-50 text-emerald-800 border-emerald-200` |
| **KeyHolderCard** | inline | `bg-accent/20 text-accent` |
| **ExecKpiBlock** status | ok, watch, action, neutral | Same as ExecBadge |

**Finding:** StatusPill and ExecBadge/ExecKpiBlock share similar semantic colors (emerald=ok, amber=warn) but different class names. Badge "success" uses blue; StatusPill "completed" uses emerald.

### 4.4 Typography Hierarchy

| Element | Classes | Used In |
|--------|---------|---------|
| Section title | `text-sm font-semibold uppercase tracking-[0.12em] text-muted` | Home |
| Section title | `text-xs font-semibold uppercase tracking-[0.12em] text-muted` | Sales Summary |
| Card title | `text-[11px] font-semibold uppercase tracking-[0.15em] text-muted` | LuxuryPerformanceCard, LuxuryTopSellerCard |
| Card title | `text-sm font-semibold uppercase tracking-[0.12em] text-muted` | Home cards |
| Card title | `text-xs font-semibold uppercase tracking-wide text-muted` | SnapshotCard |

**Inconsistency:** Card title font size varies: `text-[11px]`, `text-xs`, `text-sm`.

### 4.5 Inline Styling That Should Be Centralized

- `style={{ backgroundColor: 'var(--surface)' }}` — Card, CardShell (ui), KPIBlock
- `style={{ width: \`${pct}%\` }}` — repeated in many progress bars
- `border-[#E8DFC8]`, `bg-[#F8F4E8]` — ExecutiveDashboardClient

---

## Phase 5 — Component Folder Structure

### 5.1 Current Structure

```
components/
├── dashboard/           # Home performance, pace, sparkline, sections
│   ├── cards/           # SnapshotCard, SalesPerformanceCard, CardShell, ProgressBar, etc.
│   ├── home/            # CoverageStatusCard, TasksTodayCard, KeyHolderCard, etc.
│   └── analytics/       # SalesAnalyticsSection, SimpleLineChart, SimpleBarChart
├── dashboard-ui/        # ExecKpiBlock, ExecSparkline, ExecStackedBar, ExecBadge, etc.
├── executive/           # ExecutiveLineChart, ExecutiveBarChart
├── charts/              # TargetVsActualLineChart (shared)
└── ui/                  # Card, CardShell, ChartCard, KpiCard, KPIBlock, OpsCard, Badge, etc.
```

### 5.2 Evaluation

| Question | Finding |
|----------|---------|
| **Charts in shared folder?** | TargetVsActualLineChart is in `charts/`. SimpleLineChart, SimpleBarChart are in `dashboard/analytics/charts/`. ExecutiveBarChart in `executive/`. Fragmented. |
| **KPI cards in shared folder?** | KpiCard, KPIBlock in `ui/`. ExecKpiBlock in `dashboard-ui/`. SnapshotCard, SalesPerformanceCard in `dashboard/cards/`. LuxuryPerformanceCard in `dashboard/`. Mixed. |
| **Dashboard-specific vs generic UI?** | `dashboard-ui/` is executive-specific (Exec*). `ui/` has generic Card, OpsCard. `dashboard/home/` has home-specific cards. Some overlap. |

### 5.3 Proposed Future Structure (No Moves Yet)

```
components/
├── cards/               # Shared card primitives
│   ├── CardShell.tsx     # Single source; variants: dashboard, luxury, executive
│   ├── KpiCard.tsx       # Unified KPI card (label, value, progress, status)
│   └── ChartCard.tsx     # Chart wrapper
├── charts/               # All chart components
│   ├── TargetVsActualLineChart.tsx
│   ├── SimpleLineChart.tsx
│   ├── SimpleBarChart.tsx
│   ├── SparklineChart.tsx  # Unified MiniSparkline/ExecSparkline
│   └── ExecutiveBarChart.tsx
├── dashboard/
│   ├── home/            # Home-specific cards (use CardShell)
│   ├── cards/           # SnapshotCard family (use CardShell)
│   └── sections/
├── dashboard-ui/        # Executive-specific (ExecKpiBlock, ExecPanel, etc.)
├── executive/
└── ui/                  # Primitives: Button, Input, Badge, StatusPill, etc.
```

---

## Phase 6 — Duplication Classification

### P0 — Dangerous Duplication (Logic)

| Issue | Location | Risk |
|-------|----------|------|
| **getPerformanceColor logic** | LuxuryPerformanceCard, SalesSummaryClient | Same thresholds (100, 60); different return types (class vs string). Bug risk if one is updated and not the other. |
| **Progress bar variant logic** | ProgressBar, LuxuryPerformanceCard inline, SalesBreakdownSection, EmployeeHomeClient | Thresholds (40, 60) repeated. |

### P1 — Maintainability Duplication (UI Pattern)

| Issue | Components | Risk |
|-------|------------|------|
| **Card shell** | 6+ home cards, ChartCard, inline wrappers | Same 10+ class string repeated. Change requires many edits. |
| **Two CardShell components** | dashboard/cards, ui | Confusion; different styling. |
| **KPI card pattern** | LuxuryPerformanceCard, CircularProgressCard, Sales Summary KPI, ExecutiveDashboardClient KPICard | Same structure; 4+ implementations. |
| **Chart empty state** | 4 chart components | Same SVG + text pattern. |
| **Sparklines** | MiniSparkline, ExecSparkline (unused) | Two implementations; one unused. |

### P2 — Cosmetic Duplication (Styling)

| Issue | Examples |
|-------|----------|
| **Progress bar track** | `bg-neutral-100` vs `bg-surface-subtle` |
| **Executive colors** | `#E8DFC8`, `#C6A756`, `#B8860B` in multiple files |
| **Card title typography** | `text-[11px]`, `text-xs`, `text-sm` |
| **Section header** | `text-xs` vs `text-sm` |

---

## Phase 7 — Safe Consolidation Opportunities

### 7.1 Shared Base Card Components

| Opportunity | Strategy | Risk |
|-------------|----------|------|
| **Unified CardShell** | Merge `dashboard/cards/CardShell` and `ui/CardShell` into one; add `executive` variant. Migrate home cards to use it. | Low |
| **BaseKpiCard** | Create `BaseKpiCard` with title, value, progress bar, optional sparkline. LuxuryPerformanceCard, CircularProgressCard, Sales Summary KPI extend or compose it. | Medium |
| **ChartCard usage** | Use ChartCard for Home "Target vs Actual", Sales Summary chart container, ExecutiveDashboardClient chart wrappers. | Low |

### 7.2 Reusable Chart Wrappers

| Opportunity | Strategy | Risk |
|-------------|----------|------|
| **ChartEmptyState** | Extract empty state (icon + message) to `components/charts/ChartEmptyState.tsx`. Use in SimpleLineChart, SimpleBarChart, TargetVsActualLineChart, ExecutiveBarChart. | Low |
| **ExecutiveBarChart color** | Replace hardcoded `#B8860B` with `CHART_EXECUTIVE_ACTUAL_COLOR` from chartStyles. | Low |

### 7.3 Standardized KPI Layout Patterns

| Opportunity | Strategy | Risk |
|-------------|----------|------|
| **getPerformanceColor** | Move to `lib/performanceColors.ts` or `chartStyles.ts`. Single source for thresholds and class names. | Low |
| **ProgressBar** | Standardize track to `bg-surface-subtle`, height to `h-2`. Add `variant="accent"` for Employee Home if needed. | Low |

### 7.4 Consolidated Sparkline Components

| Opportunity | Strategy | Risk |
|-------------|----------|------|
| **Remove ExecSparkline** | If no planned use, delete. | Low |
| **Unified SparklineChart** | Create `SparklineChart` with `scale="zero" | "minmax"`. MiniSparkline becomes thin wrapper or alias. | Medium |

---

## Phase 8 — Output Summary

### 8.1 Duplicated Card Components

| Component | Page(s) | Duplication Type | Risk | Suggested Strategy |
|-----------|---------|------------------|------|---------------------|
| LuxuryPerformanceCard | Home | KPI structure + progress | P1 | Extract BaseKpiCard; add sparkline slot |
| CircularProgressCard | — | Same as above | P1 | Use BaseKpiCard or merge with LuxuryPerformanceCard |
| Home cards (6) | Home | Card shell | P1 | Use CardShell (luxury variant) |
| Sales Summary KPI | Sales Summary | Inline KPI card | P1 | Use BaseKpiCard or LuxuryPerformanceCard |
| ExecutiveDashboardClient KPICard | Executive | Inline KPI card | P1 | Use shared KPI component; theme=executive |
| CardShell (2 versions) | dashboard, ui | Two implementations | P1 | Merge into one |

### 8.2 Duplicated Chart Components

| Component | Duplication Type | Risk | Suggested Strategy |
|-----------|------------------|------|---------------------|
| ExecSparkline | Unused; overlaps MiniSparkline | P2 | Remove or unify |
| Chart empty state | 4 implementations | P1 | Extract ChartEmptyState |
| ExecutiveBarChart color | Hardcoded vs chartStyles | P2 | Use chartStyles |
| SimpleBarChart | `bg-teal-600` vs chartStyles | P2 | Use CHART_ACTUAL_COLOR or token |

### 8.3 Layout Inconsistencies

| Issue | Pages | Risk | Suggested Strategy |
|-------|-------|------|---------------------|
| Grid gap (gap-4 vs gap-6) | Home, Sales Summary, Executive | P2 | Standardize: gap-6 for card grids |
| Card padding (p-4, p-5, p-6) | Multiple | P2 | Standardize: p-6 for primary cards |
| Section header size | Home (text-sm) vs Sales (text-xs) | P2 | Pick one; document in design system |
| Max width | 4xl, 6xl, 7xl | P2 | Standardize: 7xl for dashboards |
| Executive border color | ExecutiveDashboardClient | P2 | Use design token |

### 8.4 Design Token Inconsistencies

| Issue | Risk | Suggested Strategy |
|-------|------|---------------------|
| Executive colors scattered | P2 | Add executiveTheme.ts or extend chartStyles |
| getPerformanceColor duplicated | P0 | Centralize in lib/ |
| Progress bar track/height | P2 | Standardize in ProgressBar |
| Badge/StatusPill color semantics | P2 | Document; align success=emerald |

### 8.5 Component Structure Improvement Opportunities

| Opportunity | Risk | Suggested Strategy |
|-------------|------|---------------------|
| Charts in shared folder | Low | Move SimpleLineChart, SimpleBarChart to components/charts/ |
| Single CardShell | Low | Merge dashboard + ui CardShell |
| KPI cards consolidation | Medium | Introduce BaseKpiCard; migrate incrementally |

---

## Appendix: Component Inventory

### Cards (28 files)

- **dashboard/home:** CoverageStatusCard, TasksTodayCard, KeyHolderCard, OperationalAlertsCard, ShiftSnapshotCard
- **dashboard/cards:** SnapshotCard, SalesPerformanceCard, ScheduleHealthCard, TaskControlCard, ControlAlertsCard, CardShell, ProgressBar
- **dashboard:** LuxuryPerformanceCard, LuxuryPaceCard, LuxuryTopSellerCard, CircularProgressCard, PaceIndicatorCard, TopSellerCard
- **ui:** Card, CardShell, ChartCard, KpiCard, KPIBlock, OpsCard, PanelCard, ShiftCard

### Charts (9 files)

- **charts:** TargetVsActualLineChart
- **dashboard:** PerformanceLineChart, MiniSparkline
- **dashboard/analytics/charts:** SimpleLineChart, SimpleBarChart
- **executive:** ExecutiveLineChart, ExecutiveBarChart
- **dashboard-ui:** ExecSparkline, ExecStackedBar

### Design Tokens

- **lib/chartStyles.ts:** Chart colors, stroke widths, axis, sparkline

---

*End of report. No code changes were made. This audit is diagnostic only.*
