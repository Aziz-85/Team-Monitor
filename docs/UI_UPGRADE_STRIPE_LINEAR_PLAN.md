# UI/UX Upgrade — Stripe/Linear Style

**Goal:** Transform the admin-style interface into a professional enterprise dashboard (Stripe/Linear style). No business logic, API, schema, or route changes.

---

## 1. UI AUDIT SUMMARY

### Current state (post–Theme Batch 1)

**Design tokens**
- **globals.css:** `--background`, `--foreground`, `--surface`, `--border`, `--text`, `--muted`, `--accent`, `--primary`, `--success`, `--error`, `--radius-card`, `--radius-button`, `--shadow-card`. Single source; no spacing scale.
- **tailwind.config.ts:** `colors.background`, `foreground`, `accent`, `muted`, `luxury.*`; `borderRadius.card`, `luxury-btn`; `boxShadow.card`. No spacing or typography scale extension.
- **lib/ui-styles.ts:** Mix of token-aligned (`pageBg = bg-background`) and raw Tailwind (`bg-white`, `border-slate-200`, `bg-blue-600` for buttons). Not fully token-driven.

**Layout shell**
- **Sidebar:** White, border-slate-200, w-52/lg:w-56, accent for active state. Functional; could use surface token and tighter hierarchy (group labels vs items).
- **Mobile top bar:** Sticky, drawer with same active style. Works.
- **Mobile bottom nav:** Fixed bottom, accent for active. Works.
- **Page header:** `PageHeader` used on Dashboard and Sales Summary; title + subtitle + actions. Good base.

**Dashboard**
- **Cards:** SnapshotCard (rounded-2xl, p-5), KpiCard (rounded-xl, p-4), SalesPerformanceCard uses SnapshotCard. Mixed radius (xl vs 2xl). No mini charts; dense text.
- **Grid:** `gap-6`, `sm:grid-cols-2 lg:grid-cols-4`. Good.
- **Quick links (employee):** Inline link buttons; could be card-style or pill.

**Reports (e.g. Sales Summary)**
- **Filter bar:** Raw inputs (date, select, button) in a flex-wrap row; no container, no labels hierarchy, no active filter summary.
- **Tables:** DataTable (luxury) has rounded-xl, slate header; some pages use raw `<table>`. No row hover in DataTable; no sticky header.
- **Target cards:** Inline grid of small cards; consistent.

**Mobile**
- **pb-nav** used in places; layout padding varies (p-4 md:p-6).
- **Filter bars** stack but feel cramped; no dedicated filter-bar component.
- **Tables** scroll horizontally; no card-style mobile fallback.

**Gaps vs Stripe/Linear**
- No unified spacing scale (e.g. 4/8/12/16/24/32).
- Radii and shadows not fully systematic (e.g. sm/md/lg).
- Buttons in ui-styles use blue, not accent; many pages use ad-hoc button classes.
- Filter bars look ad-hoc; no “active filters” chip row.
- Tables lack row hover and optional sticky header.
- KPI cards lack optional sparkline/mini chart area.

---

## 2. DESIGN STRATEGY (Stripe/Linear)

**Principles**
- **Calm, minimal:** Lots of whitespace; avoid visual noise.
- **Single accent:** Use theme accent (gold) for primary actions and key states; avoid blue overload.
- **Surfaces:** Clear elevation (background → surface → elevated); subtle borders and shadows.
- **Typography:** Clear hierarchy (page title → section → label → caption); consistent sizes.
- **Data density:** Balanced; tables and cards scannable without feeling cramped.

**Tokens to add/align**
- **Colors:** Keep current; ensure `surface`, `border`, `muted` used in components; add `surface-subtle` (e.g. table header bg) if needed.
- **Spacing:** Map to a scale (e.g. 4, 8, 12, 16, 20, 24, 32) and use in Tailwind extend so `space-*` / `p-*` / `gap-*` align.
- **Radii:** Standardize: `radius-sm` (6px), `radius-md` (8px), `radius-lg` (12px), `radius-xl` (16px); use in cards, buttons, inputs.
- **Shadows:** Add `shadow-sm`, `shadow-md`, `shadow-lg` from tokens for cards and dropdowns.

**Layout shell**
- Sidebar: Slightly cleaner group/item contrast; use `border-border` (token); optional compact mode not in scope.
- Top bar: Already minimal; ensure token-based.
- Page header: Keep; optional breadcrumb later.

**Dashboard**
- KPI cards: One radius (e.g. 12px), consistent padding; optional “trend” or mini chart slot (placeholder or simple bar).
- Section titles: Consistent size and margin.
- Quick links: Pill or secondary-button style using tokens.

**Reports**
- Filter bar: Wrapped in a surface container (card-like or bordered bar); labels; primary button = accent.
- Active filters: Row of chips (e.g. “Boutique: AlRashid”, “From–To”) with clear-one or clear-all.
- Tables: Row hover; header uses surface-subtle; optional sticky thead.

**Mobile**
- Consistent content padding and pb-nav.
- Filter bar stacks vertically; chips wrap.
- Cards full-width on small screens; tables stay scroll.

---

## 3. FILES TO CHANGE (by phase)

### Phase 1 — Design system
| File | Change |
|------|--------|
| `app/globals.css` | Add `--spacing-*`, `--radius-sm/md/lg/xl`, `--shadow-sm/md/lg`; keep existing vars. |
| `tailwind.config.ts` | Extend `spacing` (optional alias), `borderRadius` (sm/md/lg/xl from vars), `boxShadow` (sm/md/lg from vars). |
| `lib/ui-styles.ts` | Align card, buttons, inputs, table to use theme tokens (accent, border, surface, radius, shadow). |

### Phase 2 — Layout shell
| File | Change |
|------|--------|
| `components/nav/Sidebar.tsx` | Use `bg-surface`, `border-border`; group label vs item visual hierarchy. |
| `components/nav/MobileTopBar.tsx` | Use `bg-surface`, `border-border`. |
| `components/nav/MobileBottomNav.tsx` | Use `bg-surface`, `border-border`. |
| `components/ui/PageHeader.tsx` | Optional: add optional breadcrumb slot; ensure token text. |

### Phase 3 — Dashboard UI
| File | Change |
|------|--------|
| `components/ui/KpiCard.tsx` | Token-based (surface, border, radius, shadow); optional trend/mini-chart slot. |
| `components/dashboard/cards/SnapshotCard.tsx` | Unify radius with design system; use tokens. |
| `components/dashboard/cards/SalesPerformanceCard.tsx` | Use SnapshotCard/KpiCard tokens; optional small trend. |
| `components/dashboard/cards/ScheduleHealthCard.tsx` | Same. |
| `components/dashboard/cards/TaskControlCard.tsx` | Same. |
| `components/dashboard/cards/ControlAlertsCard.tsx` | Same. |
| `components/dashboard/ExecutiveDashboard.tsx` | Section title style; quick links use token buttons. |

### Phase 4 — Reports UI
| File | Change |
|------|--------|
| `components/ui/FilterBar.tsx` | **New.** Wrapper for filters; optional active-filter chips. |
| `components/ui/ActiveFilterChips.tsx` | **New (or part of FilterBar).** Chips for active filters + clear. |
| `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` | Use FilterBar; standard inputs; primary button = accent; active filter summary. |
| `components/ui/DataTable.tsx` | Row hover; header bg from token; optional sticky. |

### Phase 5 — Mobile UX
| File | Change |
|------|--------|
| `app/globals.css` | Ensure .page-content and .pb-nav used where needed. |
| Dashboard + report pages | Confirm pb-nav and responsive grid. |
| `components/nav/MobileBottomNav.tsx` | Touch target size; optional label visibility. |

---

## 4. DIFF PREVIEW (batch by batch)

### Batch 1 — Phase 1: Design system
- **globals.css:** Add CSS vars: `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 16px`; `--shadow-sm`, `--shadow-md`, `--shadow-lg` (refined values). Optionally `--surface-subtle: #F5F5F4`.
- **tailwind.config.ts:** `borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)' }` (or map to existing radius-card/button); `boxShadow: { sm: '...', md: '...', lg: '...' }`.
- **lib/ui-styles.ts:** `card` use `bg-surface border-border rounded-lg shadow-card` (tokens); `btnPrimary` use `bg-accent` and hover shade; `textPrimary` → `text-foreground`; `borderDefault` → `border-border`; table classes use `border-border`, `bg-surface`, optional `bg-surface-subtle` for header.

### Batch 2 — Phase 2: Layout shell
- **Sidebar:** `bg-white` → `bg-surface`, `border-slate-200` → `border-border`; group headers slightly bolder or uppercase; nav item padding consistent.
- **MobileTopBar / MobileBottomNav:** Same surface/border tokens.
- **PageHeader:** Use `text-foreground` and `text-muted` (already done if using tokens).

### Batch 3 — Phase 3: Dashboard UI
- **SnapshotCard:** `rounded-2xl` → `rounded-xl` (or var), `border-slate-200` → `border-border`, `bg-white` → `bg-surface`, title `text-muted`.
- **KpiCard:** Same; delta/status use semantic colors (success, error, muted).
- **SalesPerformanceCard etc.:** No prop changes; they use SnapshotCard/KpiCard.
- **ExecutiveDashboard:** Section h2 use `text-sm font-semibold text-muted` or similar; quick links `rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle` (or from ui-styles).

### Batch 4 — Phase 4: Reports UI
- **FilterBar:** New component: `<div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap items-end gap-3">` + children; optional `activeFilters` prop render chips.
- **ActiveFilterChips:** Map of label → value; chip `rounded-full border border-border bg-surface-subtle px-3 py-1 text-sm`; clear button.
- **SalesSummaryClient:** Wrap filters in FilterBar; use design-system input/select/button classes; pass active filters (boutique, from-to) to chips.
- **DataTable:** `thead tr` add `bg-surface-subtle` or keep slate-50; `tbody tr` add `hover:bg-surface-subtle/50`; wrapper `border-border`.

### Batch 5 — Phase 5: Mobile UX
- Audit pages for `pb-nav`; add where content could be obscured.
- Dashboard grid: ensure `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- FilterBar: `flex-col` on small screen if needed; chips wrap.
- Bottom nav: ensure min height/touch area.

---

## 5. IMPLEMENTATION ORDER

1. **Batch 1** — Phase 1: Design system (tokens + ui-styles).
2. **Batch 2** — Phase 2: Layout shell (sidebar, topbar, bottom nav tokens).
3. **Batch 3** — Phase 3: Dashboard UI (cards, section titles, quick links).
4. **Batch 4** — Phase 4: Reports UI (FilterBar, Sales Summary, DataTable).
5. **Batch 5** — Phase 5: Mobile UX (pb-nav, responsive, touch).

Each batch: apply changes → list files → note rollback (revert commit).

---

## 6. Implementation status

**Batch 1 (Phase 1) — Done**
- globals.css: added --surface-subtle, --accent-hover, --radius-sm/md/lg/xl, --shadow-sm/md/lg, --warning
- tailwind: surface, surface-subtle, accent-hover, borderRadius sm/md/lg/xl, boxShadow sm/md/lg
- lib/ui-styles: card, text, border, btnPrimary/Secondary/Danger, inputBase, table* use tokens; added filterBar

**Batch 2 (Phase 2) — Done**
- Sidebar, MobileTopBar, MobileBottomNav: bg-surface, border-border, text-foreground/muted, surface-subtle for hover/active
- Mobile bottom nav: min-h-[44px] for touch targets

**Batch 3 (Phase 3) — Done**
- KpiCard, SnapshotCard: token-based (border-border, bg-surface, shadow-card, text-muted/foreground)
- ExecutiveDashboard: section title text-muted; quick links use border-border, bg-surface, hover:bg-surface-subtle

**Batch 4 (Phase 4) — Done**
- FilterBar component: wrapper with active filter chips
- SalesSummaryClient: FilterBar, inputBase, btnPrimary, activeFilters, token-based target/summary cards
- DataTable: border-border, bg-surface, bg-surface-subtle header, row hover via .data-table-tbody tr:hover in globals

**Batch 5 (Phase 5) — Addressed in Batch 2**
- pb-nav and responsive padding already in use; bottom nav touch targets improved
