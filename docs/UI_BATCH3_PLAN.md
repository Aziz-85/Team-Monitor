# UI Major Leap — Batch 3 Plan

## 1. Files to be modified

| File | Change |
|------|--------|
| **`components/ui/DataTable.tsx`** | Add `stickyHeader?: boolean` (default true when scrollable), `zebra?: boolean`; apply sticky thead (sticky top-0 z-10 bg-surface-subtle); zebra via data attribute or class on tbody; ensure wrapper has overflow for sticky to take effect. |
| **`app/globals.css`** | Add `.data-table-sticky thead tr` shadow; optional `.data-table-zebra tbody tr:nth-child(even)` bg; keep/refine `.data-table-tbody tr:hover`. |
| **`components/ui/EmptyState.tsx`** | **New.** Props: title, description?, icon?: ReactNode, action?: ReactNode; token styling; use in Sales Summary and Returns when no data. |
| **`app/(dashboard)/sales/summary/SalesSummaryClient.tsx`** | Replace raw `<table>` with DataTable + DataTableHead/Th/Body/Td; use EmptyState when no breakdown rows; token classes for KPI grid (text-foreground, border-border). |
| **`app/(dashboard)/sales/returns/SalesReturnsClient.tsx`** | Replace raw table with DataTable + Head/Th/Body/Td; empty state with EmptyState. |
| **`components/dashboard/sections/TeamTableSection.tsx`** | Replace raw table with DataTable (luxury variant); token classes (border-border, bg-surface-subtle, text-foreground); remove slate-*. |
| **`components/dashboard/analytics/sections/SalesAnalyticsSection.tsx`** | Replace raw table with DataTable; token classes. |

Optional (if time): one Executive page table refactor (e.g. ExecutiveInsightsClient) as pattern; otherwise leave for later batch.

## 2. DataTable design plan

- **Sticky header:** When the table wrapper has overflow (e.g. overflow-x-auto or overflow-auto), thead tr gets `sticky top-0 z-10 bg-surface-subtle` so it stays visible when scrolling. Add prop `stickyHeader?: boolean` (default `true` for luxury, `true` for admin). Wrapper needs a constrained height for vertical sticky to matter; for horizontal-only scroll we still apply sticky so that when user scrolls vertically (e.g. in a scrollable container), header sticks. Optional CSS in globals: `.data-table-sticky thead tr { box-shadow: var(--shadow-sm); }` for separation.
- **Zebra rows:** Prop `zebra?: boolean`. When true, wrapper gets `data-zebra="true"` or class `data-table-zebra`; in globals `.data-table-zebra tbody tr:nth-child(even) { background-color: var(--surface-subtle); }` or Tailwind `even:bg-surface-subtle/50` on rows. Prefer applying to DataTableBody so we add a class to tbody when zebra is true.
- **Row hover:** Already in globals `.data-table-tbody tr:hover`. Keep it; ensure DataTable body keeps class `data-table-tbody`.
- **Responsive:** Wrapper keeps `overflow-x-auto` for mobile/laptop; table keeps `min-w-0` / `table-fixed` where appropriate; no schema/API changes so no new breakpoints or layout logic.
- **Export:** AdminDataTable and LuxuryTable pass through new props (stickyHeader, zebra) to DataTable.

## 3. Raw tables to standardize first (priority)

| Page / Component | Current | Change |
|------------------|---------|--------|
| **Sales Summary** (`SalesSummaryClient.tsx`) | Raw `<table>` for employee breakdown | DataTable (luxury) + DataTableHead/Th/Body/Td; EmptyState when no data. |
| **Sales Returns** (`SalesReturnsClient.tsx`) | Raw `<table>` for returns list | DataTable + Head/Th/Body/Td; EmptyState when items.length === 0. |
| **Team performance** (`TeamTableSection.tsx`) | Raw `<table>` with slate-50/slate-200 | DataTable (luxury), token classes. |
| **Dashboard analytics** (`SalesAnalyticsSection.tsx`) | Raw `<table>` by role | DataTable (luxury), token classes. |

Deferred (later batch): ExecutiveSinglePageClient, NetworkExecutiveClient, ExecSimpleTable, other admin/import/schedule tables — many tables; Batch 3 focuses on high-visibility report pages above.

## 4. Diff preview

- **DataTable.tsx:** Add `stickyHeader?: boolean`, `zebra?: boolean`. Wrapper div gets class `data-table-sticky` when stickyHeader; thead tr gets `sticky top-0 z-10 bg-surface-subtle`. DataTableBody receives zebra and adds class for even rows or parent data-table-zebra. Table wrapper may get `max-h-[…] overflow-auto` only if we want vertical scroll; otherwise keep overflow-x-auto and sticky still helps in parent scroll contexts.
- **globals.css:** `.data-table-sticky thead tr { box-shadow: var(--shadow-sm); }`; `.data-table-zebra tbody tr:nth-child(even) { background-color: … }`; keep `.data-table-tbody tr:hover`.
- **EmptyState.tsx:** New file; title, description, optional icon, optional action; centered; text-foreground, text-muted.
- **SalesSummaryClient:** Import DataTable, DataTableHead, DataTableTh, DataTableBody, DataTableTd, EmptyState; replace table block with DataTable (zebra optional); when breakdownByEmployee.length === 0 show EmptyState (or keep inline message styled with EmptyState); KPI grid use border-border, text-foreground.
- **SalesReturnsClient:** Replace table with DataTable; empty state EmptyState.
- **TeamTableSection:** Use DataTable + Head/Th/Body/Td; replace slate-* with border-border, bg-surface-subtle, text-foreground, text-muted.
- **SalesAnalyticsSection:** Use DataTable for byRole table; token classes.
