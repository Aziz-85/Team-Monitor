# Theme Upgrade / Design System Refactor — Audit & Strategy

**Objective:** Executive Clean + subtle Luxury Light theme. No DB/API/route/logic changes; visual system and layout only.

---

## PHASE 1 — UI AUDIT

### 1.1 Where theme tokens and styles live

| Location | Purpose |
|----------|--------|
| **`app/globals.css`** | CSS variables (`:root`): `--background`, `--foreground`, `--app-bg`, `--surface`, `--border`, `--text`, `--muted`, `--accent`, `--primary`, `--success`, `--error`, `--radius-card`, `--radius-button`, `--shadow-card`. Body uses `var(--text)` and `var(--app-bg)`. Utilities: `.text-balance`, `.pb-nav`, focus-visible ring (blue), RTL flip. |
| **`tailwind.config.ts`** | Theme extend: `colors.background/foreground` and `colors.luxury.*` mapped to the same CSS vars; `borderRadius.card` / `luxury-btn`; `boxShadow.card`. No custom spacing/typography scale. |
| **`lib/ui-styles.ts`** | Shared class strings: `pageBg` (bg-slate-50), `card`, `textPrimary/Secondary/Muted`, `borderDefault/Strong`, `btnPrimary/Secondary/Danger`, `inputBase`, table wrapper/header/cell, schedule Excel blocks, pills, alerts, `containerWidth` (max-w-6xl mx-auto px-4 md:px-6). **Not used everywhere**; many pages use ad-hoc Tailwind. |
| **Components** | Mix: some use CSS vars (Card, CardShell, SectionHeader, Input, Button primary via `style={{ backgroundColor: 'var(--accent)' }}`), many use raw Tailwind (slate-*, blue-*, rounded-lg, etc.). |

**Summary:** Tokens exist in `globals.css` and are partially exposed in Tailwind. A second source of truth lives in `lib/ui-styles.ts` (Tailwind-only). Usage is inconsistent: some components use vars, most use Tailwind directly.

---

### 1.2 Current color usage

- **Backgrounds:** `var(--app-bg)` (F8F8F6) in layout; **overridden** by `bg-slate-100` on dashboard page and `bg-slate-100` on sales/summary and change-password pages. `lib/ui-styles.ts` uses `bg-slate-50` for page. So: **three different page backgrounds** (var, slate-100, slate-50).
- **Surfaces/cards:** `var(--surface)` (white) in Card/CardShell; elsewhere `bg-white` + `border-slate-200` (SnapshotCard, PanelCard, KpiCard, DataTable, Sales Summary blocks).
- **Borders:** `var(--border)` (E8E6E3) in Card/CardShell; elsewhere `border-slate-200` or `border-slate-300`.
- **Text:** `var(--primary)` / `var(--text)` / `var(--muted)` in SectionHeader/Input; elsewhere `text-slate-900`, `text-slate-700`, `text-slate-600`, `text-slate-500` (and sometimes `text-slate-800`).
- **Accent/primary actions:** Button uses `var(--accent)` (C6A75E gold) for primary **but** Tailwind fallback is `bg-blue-600`. Nav active state uses `sky-500`/`sky-600` (blue). `lib/ui-styles.ts` uses `bg-blue-600` for primary. So: **accent is gold in one component, blue everywhere else**.
- **Focus rings:** Globals use `ring-blue-500`; Input/Button/Sidebar/forms use `focus:ring-blue-500` or `focus:ring-2 focus:ring-blue-500`.
- **Semantic:** Success (green) `var(--success)` / 4A7C59; error `var(--error)` / B85450; warning/amber used ad hoc (amber-100, amber-600, red-600).

**Summary:** Colors are split between CSS variables (warm luxury accent, custom border) and Tailwind slate/blue. Page background and primary CTA (gold vs blue) are inconsistent.

---

### 1.3 Spacing and radius system

- **Radius:** `--radius-card: 12px`, `--radius-button: 8px`; Tailwind `rounded-card`, `rounded-xl` (12px), `rounded-lg` (8px), `rounded-2xl` (SnapshotCard). So: **12px and 8px in vars; 2xl used in one card**.
- **Spacing:** No design token scale. Ad hoc: `p-4`, `p-5`, `p-6`, `px-3 py-2`, `gap-2`, `gap-4`, `gap-6`, `space-y-4`, `mb-4`, `mb-6`. Section gaps vary (mb-4, mb-6, space-y-4). Card padding: `p-4 md:p-5` (Card), `p-5` (SnapshotCard, PanelCard, CardShell), `p-3` (Sales Summary targets), `p-4` (Sales Summary main block).
- **Content width:** `max-w-7xl` (dashboard), `max-w-4xl` (Sales Summary), `max-w-6xl` (ui-styles container), `max-w-md` (modals). No single “content width” standard.

**Summary:** Spacing and radius are not standardized; card padding and section gaps differ by page.

---

### 1.4 Sidebar / top bar styling

- **Sidebar:** `bg-white`, `border-r border-slate-200` (or border-l RTL), `w-52 lg:w-56`. Header: border-b, px-3 py-4. Nav: rounded-lg, px-3 py-2, text-slate-700, hover:bg-slate-50; **active:** bg-slate-100, font-medium, text-slate-900, **border-l-4 border-l-sky-500** (blue). Footer: border-t, locale select and links with h-9, rounded-lg, border-slate-300, focus:ring-blue-500. Version text: text-slate-400.
- **Mobile top bar:** Sticky, border-b, bg-white, px-3 py-2; drawer: w-64, same active style (sky-500). Language select: h-8, border-slate-300, focus:ring-blue-500.
- **Mobile bottom nav:** Fixed bottom, border-t, bg-white, py-2; active link: font-semibold text-sky-600.

**Summary:** Shell is clean but uses **sky/blue for active state** while design intent (globals) is **gold accent**. No elevation or subtle surface hierarchy in shell.

---

### 1.5 Card styling patterns

- **Card (ui):** `rounded-xl`, `shadow-sm`, `p-4 md:p-5`, CSS var surface/border.
- **CardShell:** `rounded-card`, `shadow-card`, `p-5`, CSS var surface/border.
- **KpiCard:** `rounded-xl`, `border border-slate-200`, `bg-white`, `p-4`, `shadow-sm`; label uppercase tracking-wide text-slate-500; value text-3xl text-slate-900.
- **SnapshotCard:** `rounded-2xl`, `border border-slate-200`, `bg-white`, `p-5`, `shadow-sm`; title text-sm font-semibold uppercase text-slate-600.
- **PanelCard:** `rounded-xl`, `border border-slate-200`, `bg-white`, `p-5`, `shadow-sm`; title + actions row; border-t pt-4 for body.
- **Sales Summary:** Inline “cards”: `rounded-lg border border-slate-200 bg-white p-3 shadow-sm` (targets); main block `rounded-lg border bg-white p-4` (no border color specified); KPI blocks `rounded border p-2` (minimal).

**Summary:** Multiple card patterns (rounded-xl vs rounded-2xl, p-4 vs p-5, with/without explicit border color). Sales Summary and some report blocks use lighter styling than shared cards.

---

### 1.6 Table styling patterns

- **DataTable (luxury):** Wrapper `rounded-xl border border-slate-200 bg-white`, overflow-x-auto. Head: `border-b border-slate-200 bg-slate-50 text-slate-700`. Th: `px-3 py-2 text-xs font-semibold text-slate-700 md:text-sm`. Td: `border-b border-slate-200 px-3 py-2 text-sm`. No row hover.
- **Sales Summary table:** Raw `<table>`: `border-b` on tr, `py-1 pe-2` cells, no wrapper radius, no header background.
- **ExecutiveSinglePageClient / other reports:** Custom thead (e.g. text-[11px] uppercase text-slate-500), mixed padding (py-3 px-3), no shared component.

**Summary:** DataTable/LuxuryTable give one consistent pattern; many pages use raw tables with different paddings and no header treatment.

---

### 1.7 Button / input / select patterns

- **Button (ui):** Base h-10 px-4 rounded-lg; primary uses `var(--accent)` (gold) via style override; Tailwind has blue-600; secondary border + white. Focus ring blue.
- **lib/ui-styles.ts:** btnPrimary/secondary/danger with blue-600, border-slate-300, etc. Used in some places; many pages use inline classes (e.g. `rounded bg-slate-700 px-3 py-1` on Sales Summary apply button).
- **Input (ui):** Label with var(--muted); input h-10 rounded-lg border, var(surface/border/text), focus:ring-blue-500.
- **Raw inputs:** Many pages use native `<input>` / `<select>` with ad hoc classes: `rounded border px-2 py-1`, `rounded-lg border border-slate-300 bg-white px-3`, varying heights (h-8, h-9, h-10).

**Summary:** Shared Button/Input exist but are not used everywhere. Inline styles mix slate, blue, and one-off heights/paddings. Sales Summary uses a dark slate button instead of primary component.

---

### 1.8 Mobile layout weaknesses

- **Content padding:** Some pages use `p-4 md:p-6`, others `p-4` only; no consistent use of `pb-nav` for bottom nav clearance on all scrollable pages.
- **Filter/control bars:** Sales Summary: `flex flex-wrap items-center gap-2` — on small screens controls stack but look cramped; no clear “filter bar” container. Same pattern appears elsewhere (inline flex-wrap).
- **Tables:** DataTable has overflow-x-auto; no card-style mobile fallback or stacked layout. Small screens get horizontal scroll.
- **Touch targets:** Some buttons h-9, some h-10; bottom nav links are compact (py-1). No minimum touch-size standard.
- **Page headers:** Vary: some `text-2xl`, some `text-xl`; subtitle and actions row not standardized; on mobile title and actions can squeeze.

**Summary:** Mobile works but feels inconsistent: padding, filter density, table behavior, and header layout differ by page.

---

### 1.9 Visual inconsistencies across pages

- **Page background:** Layout uses `var(--app-bg)`; dashboard and sales/summary (and change-password) use `bg-slate-100`; ui-styles suggests `bg-slate-50`. Three variants.
- **Page container:** Dashboard `mx-auto max-w-7xl p-4 md:p-6`; Sales Summary `mx-auto max-w-4xl space-y-4` with page-level `p-4`; others `p-4 md:p-6` or `min-w-0 p-4 md:p-6`. No single wrapper (e.g. content + max-width + padding).
- **Page title:** Dashboard: `mb-6 text-2xl font-semibold text-slate-900`; Sales Summary: `text-xl font-semibold text-slate-900` + `mt-1 text-sm text-slate-500`; SectionHeader: `text-xl` + var(primary) and var(muted). Different levels and spacing.
- **Cards:** Mix of Card, CardShell, SnapshotCard, PanelCard, and raw divs with different radius/padding/shadow.
- **Primary actions:** Gold (Button) vs blue (nav, ui-styles, many inline buttons) vs slate-700 (Sales Summary apply).
- **Borders:** var(--border) vs border-slate-200 vs border-slate-300 used interchangeably.

**Summary:** Inconsistencies in background, container width, page title pattern, card components, primary color, and borders.

---

### 1.10 Components that should be standardized first

| Priority | Component / area | Current issue |
|----------|------------------|---------------|
| 1 | **Global theme foundation** | Unify page background, ensure one token set; optional spacing/radius scale. |
| 2 | **Navigation shell** | Sidebar, top bar, bottom nav: align active state with accent (or keep blue but document); consistent borders and spacing. |
| 3 | **Page header** | Reusable pattern: title (size/weight), subtitle, optional actions row; same padding and max-width as content. |
| 4 | **Page content wrapper** | Single pattern: e.g. `pb-nav` + padding + max-width so all pages look the same. |
| 5 | **KPI / snapshot cards** | One standard: label, value, subtext, progress; consistent padding, radius, and optional status. |
| 6 | **Filter / control bars** | Shared “filter bar” or “toolbar” container: grouped controls, clear hierarchy, responsive stacking. |
| 7 | **Tables** | Use DataTable/LuxuryTable (or one variant) everywhere; add row hover; ensure header contrast; mobile: keep scroll or add stacked pattern where appropriate. |
| 8 | **Buttons** | Single primary style (accent or blue, decide once); secondary/danger from design system; replace ad-hoc classes. |
| 9 | **Inputs / selects** | Use shared Input and a standard select style; same height and focus ring. |
| 10 | **Empty / loading / error states** | Shared patterns for “no data”, loading spinner, error message. |

---

## PHASE 2 — DESIGN SYSTEM STRATEGY

### A. COLOR SYSTEM

Refine and document a single palette. Prefer extending current `:root` vars and Tailwind so one source drives both.

- **background:** Page canvas — keep `#F8F8F6` or tune to a very light warm gray (e.g. #F7F6F4) for “luxury light”.
- **surface:** Cards, panels, dropdowns — `#FFFFFF`.
- **elevated surface:** Modals, dropdowns, sticky bars — white with slightly stronger shadow (optional var).
- **primary text:** Headings, key data — keep `#1E1E1E` or align to a single slate-900.
- **secondary text:** Body, labels — align to one muted (e.g. slate-600).
- **muted / helper:** Hints, captions — current `--muted` or slate-500.
- **border:** Default borders — keep `#E8E6E3` or unify to one token; optional `border-subtle` and `border-strong`.
- **muted surface:** Disabled or low-emphasis areas — e.g. slate-50.
- **primary accent:** CTAs, links, active nav — **choose one:** keep gold `#C6A75E` for “luxury” or align to a single blue for “enterprise”. Recommendation: **keep gold** for primary buttons and key links; use **slate/neutral** for nav active (or a subtle gold tint) to avoid blue overload.
- **success:** Green — keep or align to one (e.g. emerald-600).
- **warning:** Amber — one token (e.g. amber-600).
- **danger:** Red — keep or align (e.g. red-600).

Style direction: light, premium, calm; avoid harsh blue everywhere; subtle gold accent fits jewelry/boutique; focus ring can stay blue for accessibility or switch to accent.

---

### B. TYPOGRAPHY

- **Page titles:** One size (e.g. text-2xl) and weight (font-semibold), color from token. Optional responsive (text-xl on mobile, text-2xl on desktop).
- **Section headings:** One level down (e.g. text-lg or text-base font-semibold), consistent margin below.
- **Card labels:** Uppercase optional; one size (text-xs or text-sm) and muted color.
- **Table headers:** text-xs or text-sm, font-semibold, muted or secondary color.
- **Helper text:** text-sm or text-xs, muted.
- **Subtitles:** text-sm, muted, below title with fixed spacing (e.g. mt-1).

Use existing Tailwind scale; document which classes map to “page title”, “section”, “card label”, etc. No new font family required unless desired.

---

### C. SPACING & RHYTHM

- **Page padding:** One rule: e.g. `p-4 md:p-6` for main content; apply to a single content wrapper.
- **Section gap:** One value: e.g. `space-y-6` or `gap-6` between major sections.
- **Card padding:** One standard: e.g. `p-5` or `p-4 md:p-5` for all card-like surfaces.
- **Filter bar:** Consistent gap between controls (e.g. gap-3); optional padding and bottom margin.
- **Table cells:** Keep or standardize (e.g. px-3 py-2.5) for density and touch.
- **Mobile:** Slightly larger vertical rhythm (e.g. section gap 6 → 8 on small screens) and safe bottom padding (pb-nav) where bottom nav exists.

---

### D. SURFACES

- **Cards:** One radius (e.g. 12px / rounded-xl), one border (var or slate-200), one shadow (shadow-card or shadow-sm), one padding (p-5). CardShell/Card/SnapshotCard/PanelCard should converge or clearly extend a base.
- **Panels:** Same as cards or with a clear “panel” variant (e.g. with title bar).
- **Sticky filters/toolbars:** Light background (surface or background), border-b, consistent padding.
- **Sidebar:** Keep current structure; optionally use a subtle surface (e.g. white with a very light border) and align group/item spacing.
- **Top bar:** Same as sidebar surface; clear hierarchy for title and actions.
- **Dropdowns / selects:** Same border and radius as inputs; background surface.
- **Inputs:** One height (h-10), one border color, one focus ring; optional error state token.

---

### E. RESPONSIVE RULES

- **Page headers:** Title and actions: wrap on small screens; actions below or right; single line when space allows.
- **Cards:** Grid: 1 col mobile, 2 cols tablet, 4 (or 3) cols desktop; consistent gap.
- **Charts:** Full width in card; min-height so they don’t collapse.
- **Tables:** Horizontal scroll in a rounded container; optional “key columns” sticky; no layout change unless a stacked variant is added later.
- **Filter bars:** Stack vertically on narrow screens; horizontal with wrap on larger; same controls, no hiding critical filters.
- **Sidebar:** Hidden on mobile (current); drawer full height, same nav style.
- **Bottom nav:** Fixed; content above uses pb-nav; touch targets at least 44px where possible.

---

## PHASE 3 — PRIORITY COMPONENT REFACTOR (order)

1. **Global theme foundation** — globals.css, tailwind theme extend, optional ui-styles alignment.
2. **Navigation shell** — Sidebar, MobileTopBar, MobileBottomNav: colors, active state, spacing.
3. **Page header system** — Reusable PageHeader or enforce SectionHeader usage; title, subtitle, actions.
4. **Page content wrapper** — One layout wrapper (e.g. with pb-nav, padding, max-width) used by dashboard and all report pages.
5. **KPI cards** — Unify KpiCard, SnapshotCard, dashboard cards to one pattern (label, value, subtext, progress).
6. **Filter / control bars** — Shared FilterBar or toolbar component; use in Sales Summary and similar pages.
7. **Tables** — DataTable as default; row hover; consistent header; replace raw tables where feasible.
8. **Forms and controls** — Buttons (primary = accent or blue, one decision); Input/Select; date inputs; loading/disabled.

---

## PHASE 4 — LAPTOP + MOBILE POLISH

- **Laptop:** Spacious shell; clear content max-width (e.g. max-w-6xl or max-w-7xl); refined cards and tables; no clutter; consistent section spacing.
- **Mobile:** No dense horizontal squeeze; stacked filters; readable text; thumb-friendly buttons; compact but clear page headers; tables scroll; bottom nav always accounted for (pb-nav).

---

## PHASE 5 — DESIGN CONSTRAINTS

- **Do not:** Add decorative gradients everywhere; force dark mode; overuse shadows; add flashy SaaS gimmicks; make it look like a marketing site; introduce one-off page-specific styles.
- **Do:** Keep it elegant, enterprise-ready, operationally efficient; improve clarity first, then polish; feel like a premium internal platform.

---

## PHASE 6 — EXECUTION PLAN (summary)

1. **UI audit summary** — Above (tokens split across CSS vars and Tailwind; page background and primary color inconsistent; card/table/button patterns mixed; mobile and page-header patterns vary).
2. **Design direction** — Executive Clean, Luxury Light; one background, one accent (gold recommended), unified surfaces and spacing.
3. **Exact files to change first:**
   - `app/globals.css` — extend vars if needed (e.g. elevated surface, border-strong).
   - `tailwind.config.ts` — extend colors/spacing/radius if desired; ensure luxury.* and background/foreground used.
   - `app/(dashboard)/layout.tsx` — ensure single background token; main content wrapper optional.
   - `app/(dashboard)/dashboard/page.tsx` — remove bg-slate-100; use global background.
   - `app/(dashboard)/sales/summary/page.tsx` — same; child content wrapper for padding.
   - `components/nav/Sidebar.tsx` — active state and borders from tokens.
   - `components/nav/MobileTopBar.tsx` — same.
   - `components/nav/MobileBottomNav.tsx` — same.
   - One shared **PageHeader** or **content wrapper** component used by dashboard and Sales Summary (then others).
4. **Proposed theme tokens** — As in Section A (color); add optional `--surface-elevated`, `--border-strong`; document in globals.css.
5. **Components to standardize** — As in Phase 3 list (foundation → nav → page header → wrapper → KPI → filter bar → tables → forms).
6. **Diff preview / implementation plan** — Batch 1: globals + layout + nav + page header base. Batch 2: KPI cards, filter bars, Button/Input/Select. Batch 3: Tables, responsive tweaks, replace ad-hoc styles.

---

## PHASE 7 — BATCHES (reminder)

- **Batch 1:** Global theme foundation; sidebar/top bar/bottom nav polish; page header standardization base.
- **Batch 2:** KPI cards; filter bars; buttons/inputs/selects.
- **Batch 3:** Tables; responsive refinements; final consistency pass.

After each batch: list files changed, rationale, rollback path (revert commits or restore previous class names).

---

*End of audit and strategy. No code changes in this document; implementation to follow in batches.*
