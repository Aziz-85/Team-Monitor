# Major UI Leap — Executive Operations Dashboard

**Goal:** Transform the UI into a modern SaaS-quality interface (Stripe / Linear / Notion / Retool / Shopify Admin).  
**Style:** Executive Clean + subtle Luxury Light.  
**Constraints:** No schema, API, route, RBAC, or business-logic changes. UI/UX only.

---

## 1. UI AUDIT

### 1.1 Current styling sources

| Source | Role |
|--------|------|
| **`app/globals.css`** | CSS variables: `--background`, `--foreground`, `--surface`, `--surface-subtle`, `--border`, `--text`, `--muted`, `--accent`, `--accent-hover`, `--primary`, `--success`, `--error`, `--warning`; radii `--radius-sm/md/lg/xl`, `--radius-card/button`; shadows `--shadow-sm/md/lg`, `--shadow-card`. Utilities: `.pb-nav`, `.page-content`, `.data-table-tbody tr:hover`, focus-visible, RTL. |
| **`tailwind.config.ts`** | Theme extend: `colors` (background, foreground, accent, muted, surface, surface-subtle, border, luxury.*); `borderRadius` (sm, md, lg, xl, card, luxury-btn); `boxShadow` (sm, md, lg, card). No spacing scale. |
| **`lib/ui-styles.ts`** | Shared class strings: pageBg, card, textPrimary/Secondary/Muted, borderDefault/Strong, btnPrimary/Secondary/Danger, inputBase, tableWrapper/HeaderRow/HeaderCell/Cell/CellMuted, filterBar, plus schedule/pills/alerts/container. Token-aligned for core UI. |
| **Components** | Mix: many use Tailwind with token classes (bg-surface, border-border, text-foreground); some still use raw slate (e.g. Sales Summary target cards text-slate-700). PageHeader and FilterBar exist and are used. |

### 1.2 Gaps vs target (Stripe/Linear/Notion)

**Design system**
- No explicit **spacing scale** (space-xs through space-xl) as tokens; spacing is ad hoc (p-4, gap-3, etc.).
- **Surface-elevated** (modals, dropdowns) not defined; only surface and surface-subtle.
- **Text hierarchy** uses foreground/muted but no explicit text-primary vs text-secondary alias in tokens.
- **Success/warning/danger** exist in CSS but semantic usage is inconsistent (e.g. pills still use slate/amber/red directly).

**Layout shell**
- **Sidebar:** Width w-52 (208px) / lg:w-56 (224px); not “slim” by Stripe/Linear standards (~200–240px is common). Group hierarchy is present (collapsible groups). Active state uses accent border. No icons in nav items. No collapsible “mini” sidebar on desktop.
- **Top bar:** There is **no desktop top bar**. MobileTopBar is mobile-only (hamburger + boutique + locale). So: no global page title, breadcrumb, search, notifications, or profile menu on desktop.
- **Content container:** Main is just `<main className="flex-1 min-w-0">`; page-level wrappers set their own max-width and padding (e.g. dashboard max-w-7xl p-4 md:p-6). No shared content wrapper with max-width + padding.

**Page header**
- **PageHeader** exists: title (text-2xl), optional subtitle, optional actions. Used on Dashboard and Sales Summary. Matches requested “title + subtitle + actions” pattern; can be adopted everywhere and optionally extended (e.g. breadcrumb slot).

**KPI cards**
- **KpiCard** and **SnapshotCard** are token-based (border, surface, shadow, muted label). KpiCard has label, value, note, delta, status. Missing: explicit “trend” slot (e.g. +12% vs last week) and optional mini chart. Min height not standardized.

**Filter toolbars**
- **FilterBar** exists: wrapper with optional active filter chips. Sales Summary uses it with From/To dates, boutique select, Apply. Missing: **quick period chips** (Today, Week, Month, Quarter, Custom), **Reset** button, and a single **filter summary line** (“Viewing AlRashid • Jan 1 → Mar 7”) instead of only chip list.

**Tables**
- **DataTable** (luxury/admin): token-based wrapper and header, row hover via `.data-table-tbody`. Missing: **sticky header** when scrolling, optional **zebra** variant, consistent use across all report pages (some still use raw `<table>`).

**Mobile**
- **pb-nav** and responsive padding exist. MobileTopBar and MobileBottomNav are token-based; bottom nav has min-h-[44px]. FilterBar stacks. Some pages may still lack pb-nav or consistent padding.

**Optional enhancements**
- No **command palette** (⌘K).
- No **toast** system (alerts are inline).
- No **skeleton** loading; only “Loading…” text.
- **Empty states** are minimal (“No sales in this period…”); could be more consistent and visually clear.

---

## 2. PROPOSED DESIGN SYSTEM

### 2.1 Token naming and mapping

Align with your requested names and keep compatibility with existing vars where it makes sense.

**Colors**

| Token | CSS var | Tailwind | Usage |
|-------|---------|----------|--------|
| background | `--background` | `bg-background` | Page canvas |
| surface | `--surface` | `bg-surface` | Cards, panels, inputs |
| surface-elevated | `--surface-elevated` (new) | `bg-surface-elevated` | Modals, dropdowns, popovers |
| surface-subtle | keep | `bg-surface-subtle` | Table header, hover, muted areas |
| border | `--border` | `border-border` | Default borders |
| text-primary | alias `--foreground` | `text-foreground` | Headings, primary text |
| text-secondary | alias `--muted` or new | `text-muted` | Body, labels |
| text-muted | keep | `text-muted` | Captions, hints |
| accent | `--accent` | `bg-accent`, `text-accent`, `border-accent` | Primary actions, active nav |
| success | `--success` | e.g. `text-success`, `bg-success/10` | Positive states |
| warning | `--warning` | e.g. `text-warning`, `bg-warning/10` | Warnings |
| danger | `--error` or `--danger` | e.g. `text-danger` | Errors, destructive |

**Spacing**

| Token | Value | Tailwind |
|-------|--------|----------|
| space-xs | 4px | `space-xs` or keep `1`, `gap-1` |
| space-sm | 8px | `2` |
| space-md | 12px | `3` |
| space-lg | 16px | `4` |
| space-xl | 24px | `6` |

Implement as Tailwind `extend.spacing` so existing `p-4`, `gap-3` etc. stay valid; optionally add named keys (e.g. `xs: '4px'`) for documentation and future use.

**Radius**

| Token | Value | Current |
|-------|--------|---------|
| radius-sm | 6px | `--radius-sm` |
| radius-md | 8px | `--radius-md` |
| radius-lg | 12px | `--radius-lg` |
| radius-xl | 16px | `--radius-xl` |

Keep existing vars; ensure all cards/buttons/inputs use these (no raw rounded-lg values where token is better).

**Shadows**

| Token | Use |
|-------|-----|
| shadow-sm | Inputs, chips |
| shadow-md | Cards, dropdowns |
| shadow-lg | Modals, popovers |

Already in globals; ensure Tailwind and components use them consistently.

### 2.2 Design principles (Executive Clean + Luxury Light)

- **Single source of truth:** All UI decisions flow from globals.css + Tailwind extend. No one-off slate-* or blue-* for core surfaces/text.
- **Hierarchy:** Page title → section title → card title → label → caption. Clear size and weight steps.
- **Surfaces:** Background (page) → surface (cards) → surface-elevated (overlays). Borders and shadows from tokens.
- **Touch and pointer:** Min 44px touch targets on mobile; hover states only where they add clarity.

---

## 3. FILES TO MODIFY

### Step 1 — Design system

| File | Change |
|------|--------|
| `app/globals.css` | Add `--surface-elevated`, optional `--danger` alias; add spacing vars if desired; document token roles. |
| `tailwind.config.ts` | Add `surface-elevated`, `success`, `warning`, `danger` (or map from existing); optional `spacing` extend (xs, sm, md, lg, xl). |
| `lib/ui-styles.ts` | Use only token-based classes; add any new tokens (e.g. surface-elevated for modals). |

### Step 2 — Layout shell

| File | Change |
|------|--------|
| `components/nav/Sidebar.tsx` | Slimmer width (e.g. w-48 lg:w-52); clearer group vs item hierarchy (typography/spacing); stronger active state; subtle hover; optional nav icons; collapsible on mobile (already drawer). |
| `components/nav/DesktopTopBar.tsx` | **New.** Desktop-only bar: page title (or breadcrumb), optional search, notifications, profile/locale. Renders in layout next to main. |
| `app/(dashboard)/layout.tsx` | Add DesktopTopBar; pass user/role; optionally wrap main in a content wrapper (max-width + padding). |
| `components/ui/PageHeader.tsx` | Optional: breadcrumb slot; ensure token typography. |

### Step 3 — Page header system

| File | Change |
|------|--------|
| `components/ui/PageHeader.tsx` | Keep title + subtitle + actions; add optional `breadcrumb?: ReactNode`; use space tokens. |
| All report/dashboard pages | Use PageHeader consistently (many already do); add actions where needed (Filters, Export). |

### Step 4 — KPI cards

| File | Change |
|------|--------|
| `components/ui/KpiCard.tsx` | Add optional `trend?: string` and/or `trendSlot?: ReactNode`; min-height or consistent padding; ensure label/value/trend hierarchy. |
| `components/dashboard/cards/SnapshotCard.tsx` | Align with KpiCard padding/radius; optional trend area. |
| Dashboard cards (SalesPerformanceCard, etc.) | Use KpiCard/SnapshotCard; pass trend text where data exists. |

### Step 5 — Filter toolbars

| File | Change |
|------|--------|
| `components/ui/FilterBar.tsx` | Add optional **quick period chips** (Today, Week, Month, Quarter, Custom); add **Reset** button slot; add **filter summary line** (e.g. “Viewing X • Date range”) as first-class prop. |
| `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` | Use period chips (wire to from/to); add Reset; set FilterBar summary line to “Viewing {boutique} • {from} → {to}”. |

### Step 6 — Tables

| File | Change |
|------|--------|
| `components/ui/DataTable.tsx` | Sticky thead (e.g. `sticky top-0 z-10 bg-surface-subtle`); optional `zebra` prop for alternating rows; ensure all use DataTable/LuxuryTable. |
| `app/globals.css` | If sticky header needs shadow, add .data-table-sticky class. |
| Report pages with raw `<table>` | Refactor to use DataTable + DataTableHead/Th/Body/Td. |

### Step 7 — Mobile UX

| File | Change |
|------|--------|
| `app/globals.css` | Confirm .page-content and .pb-nav. |
| `components/nav/MobileTopBar.tsx` | Ensure token usage; optional compact title. |
| `components/nav/MobileBottomNav.tsx` | Touch targets, token usage (done). |
| FilterBar / report pages | Ensure filters stack cleanly; summary line wraps. |

### Step 8 — Optional enhancements

| File | Change |
|------|--------|
| Command palette | New component + shortcut (⌘K); search routes/actions; optional. |
| Toasts | New Toast provider + hook; replace inline error/success where appropriate; optional. |
| Skeletons | New Skeleton component; use in dashboard/reports while loading; optional. |
| Empty states | Reusable EmptyState component; use in Sales Summary and elsewhere; optional. |

---

## 4. IMPLEMENTATION PLAN (BATCHES)

### Batch 1 — Foundation and shell

**Scope:** Global theme tokens, sidebar polish, desktop top bar, page header system.

**Tasks**
1. **Tokens:** Add `--surface-elevated`; optional spacing vars; document in globals.css. Extend Tailwind (surface-elevated, semantic colors if needed).
2. **Sidebar:** Reduce width to w-48 lg:w-52; tighten group vs item spacing; stronger active (e.g. bg + border accent); hover:bg-surface-subtle; optional group label typography (text-xs uppercase text-muted).
3. **DesktopTopBar:** New component. Left: optional breadcrumb or app name; center/right: optional search placeholder, notifications placeholder, profile (name + dropdown: change password, logout) and locale. Shown only on md+.
4. **Layout:** Render DesktopTopBar above main when not mobile; main unchanged or wrapped in .page-content + max-width.
5. **PageHeader:** Add optional breadcrumb slot; use design tokens.

**Files:** `globals.css`, `tailwind.config.ts`, `lib/ui-styles.ts`, `Sidebar.tsx`, new `DesktopTopBar.tsx`, `layout.tsx`, `PageHeader.tsx`.

**Rollback:** Revert commit(s); no API/schema impact.

---

### Batch 2 — KPI cards, filter bars, controls

**Scope:** KPI card upgrade, FilterBar with period chips + summary line + Reset, buttons/inputs/selects consistency.

**Tasks**
1. **KpiCard:** Optional trend/trendSlot; consistent min-height or padding; token typography.
2. **SnapshotCard:** Same radius/padding as KpiCard.
3. **FilterBar:** Props: quickPeriods (e.g. [{ id: 'week', label: 'Week' }]), onPeriodSelect, summaryLine (string or ReactNode), onReset. Render period chips; summary line below or above controls; Reset button.
4. **Sales Summary:** Wire period chips to set from/to; add Reset (clear dates / reset to default); pass summaryLine “Viewing {boutique} • {from} → {to}”.
5. **Buttons/inputs:** Ensure all use ui-styles or token classes; replace any remaining raw slate/blue in primary actions.

**Files:** `KpiCard.tsx`, `SnapshotCard.tsx`, dashboard cards if needed, `FilterBar.tsx`, `SalesSummaryClient.tsx`, any page with ad-hoc buttons/inputs.

**Rollback:** Revert commit(s).

---

### Batch 3 — Tables, mobile, consistency

**Scope:** DataTable sticky header and optional zebra; mobile audit; replace raw tables; empty states.

**Tasks**
1. **DataTable:** thead tr with sticky top-0 z-10 bg-surface-subtle; optional zebra (tbody tr:nth-child(even)).
2. **globals.css:** .data-table-sticky if needed for shadow under sticky header.
3. **Report pages:** Replace raw `<table>` with DataTable/LuxuryTable where applicable.
4. **Mobile:** Audit key pages for pb-nav, padding, filter stacking; fix gaps.
5. **Empty state:** Optional EmptyState component; use in Sales Summary and one other report.
6. **Leftover:** Replace remaining text-slate-* / bg-white with tokens where it’s clearly part of the design system.

**Files:** `DataTable.tsx`, `globals.css`, report page clients (Sales Summary, etc.), optional `EmptyState.tsx`.

**Rollback:** Revert commit(s).

---

### Optional batch — Command palette, toasts, skeletons

- Command palette: new component, keyboard shortcut, list of links/actions.
- Toasts: provider + useToast; show on success/error instead of inline message where appropriate.
- Skeletons: component + use in dashboard and Sales Summary loading state.

---

## 5. DIFF PREVIEW (SUMMARY)

### Batch 1

- **globals.css:** Add `--surface-elevated: #FFFFFF` (or slightly off-white); short comment block for token roles. Optionally `--space-xs` … `--space-xl`.
- **tailwind.config.ts:** `surface-elevated`, optional `spacing: { xs: '4px', sm: '8px', ... }`.
- **Sidebar.tsx:** `w-52 lg:w-56` → `w-48 lg:w-52`; group header `text-xs font-medium uppercase text-muted`; item padding; active `bg-surface-subtle` + border-accent; hover `hover:bg-surface-subtle`.
- **DesktopTopBar.tsx (new):** Sticky bar; left: app name or breadcrumb; right: locale select, profile dropdown (name, change password, logout). Token classes throughout.
- **layout.tsx:** Import and render DesktopTopBar above main (hidden on mobile); no change to RouteGuard or data flow.
- **PageHeader.tsx:** Add optional `breadcrumb?: ReactNode` above title; keep title/subtitle/actions.

### Batch 2

- **KpiCard.tsx:** Add `trend?: string` and `trendSlot?: ReactNode`; render below value; optional min-h.
- **FilterBar.tsx:** New props `quickPeriods`, `onPeriodSelect`, `summaryLine`, `onReset`. First row: period chips + date range + boutique + Apply + Reset. Second row or above table: summary line.
- **SalesSummaryClient.tsx:** Define period presets (e.g. last 7d, last 30d, quarter); map to from/to; pass summaryLine; call onReset to reset dates/boutique to default.
- **ui-styles / buttons:** Any remaining primary buttons use btnPrimary (accent).

### Batch 3

- **DataTable.tsx:** thead tr: `sticky top-0 z-10 bg-surface-subtle`; optional `zebra` on wrapper and tbody tr even:bg-surface-subtle/40.
- **globals.css:** Optional `.data-table-sticky thead tr { box-shadow: var(--shadow-sm); }`.
- **Report pages:** Replace raw table with DataTable, DataTableHead, DataTableTh, DataTableBody, DataTableTd.
- **Empty state:** New component; use in Sales Summary when no data.

---

## 6. APPROVAL CHECKPOINT

Before implementation:

1. **UI audit** — Done above (§1).  
2. **Design system** — Proposed above (§2).  
3. **Files to modify** — Listed above (§3).  
4. **Implementation plan** — Batches 1–3 (+ optional) above (§4).  
5. **Diff preview** — Summarized above (§5).

If you approve this plan, next step is to implement **Batch 1** (tokens, sidebar, desktop top bar, page header), then Batch 2, then Batch 3, with no schema/API/route/RBAC changes.

**Design principle:** Visually opinionated, architecturally conservative — improve the UI strongly without disrupting the product structure.

---

## 7. Batch 1 — Implemented

**Files modified**
- **`app/globals.css`** — Added `--surface-elevated: #FFFFFF`; clarified token comments (background, surfaces, border, text).
- **`tailwind.config.ts`** — Added `surface-elevated` to theme extend colors.
- **`components/nav/Sidebar.tsx`** — Width `w-52 lg:w-56` → `w-48 lg:w-52`; nav padding `px-3 py-4` → `px-2.5 py-3`; group labels `text-xs font-medium uppercase tracking-wide text-muted` with hover; item padding `px-3 py-2` → `px-2.5 py-2`; tighter spacing.
- **`components/nav/DesktopTopBar.tsx`** — **New.** Sticky desktop-only header: app name (link), locale select, profile dropdown (name, Change password, Logout). Uses `bg-surface-elevated`, `border-border`; hidden on mobile (`md:flex`).
- **`app/(dashboard)/layout.tsx`** — Import and render `<DesktopTopBar name={user.employee?.name ?? undefined} />` between MobileTopBar and main.
- **`components/ui/PageHeader.tsx`** — Added optional `breadcrumb?: ReactNode`; render above title when present; props unchanged for title/subtitle/actions.

**Rollback:** Revert the Batch 1 commit(s). No DB, API, route, or RBAC changes.
