# Theme Upgrade — Batch 1 Plan

**Scope:** Global theme foundation, design tokens cleanup, sidebar polish, topbar polish, page header standardization.

---

## 1. Files to modify

| File | Change |
|------|--------|
| `app/globals.css` | Token comments; add `.page-content` utility (padding + pb-nav); optional `--muted-surface`. |
| `tailwind.config.ts` | Add `accent` at root (alias for luxury.accent) for simpler classes; add `muted-surface` if used. |
| `app/(dashboard)/layout.tsx` | Use `bg-background` class instead of inline style (optional, or keep style for consistency with body). |
| `app/(dashboard)/dashboard/page.tsx` | Remove `bg-slate-100`; use theme background (wrapper → `bg-background` or remove wrapper). |
| `app/(dashboard)/sales/summary/page.tsx` | Replace `bg-slate-100` with `bg-background`; add `pb-nav`; standardize padding `p-4 md:p-6`. |
| `app/(dashboard)/sales/my/page.tsx` | Same. |
| `app/(dashboard)/sales/returns/page.tsx` | Same. |
| `app/(dashboard)/admin/control-panel/delegation/page.tsx` | Same. |
| `app/(dashboard)/executive/employees/[empId]/page.tsx` | Replace `bg-slate-50` with `bg-background`. |
| `app/(dashboard)/executive/compare/page.tsx` | Same. |
| `app/(auth)/change-password/page.tsx` | Replace `bg-slate-100` with `bg-background`. |
| `components/nav/Sidebar.tsx` | Active state: `border-l-sky-500` → `border-luxury-accent`; sidebar surface border from token; footer select/buttons use theme border. |
| `components/nav/MobileTopBar.tsx` | Active nav: same accent border; drawer surface. |
| `components/nav/MobileBottomNav.tsx` | Active link: `text-sky-600` → `text-luxury-accent`. |
| `components/ui/PageHeader.tsx` | **New.** Reusable page header: title (text-2xl), subtitle (text-sm muted), optional actions row. |
| `components/dashboard/ExecutiveDashboard.tsx` | Replace inline h1 with `<PageHeader>`; keep role-based title/subtitle. |
| `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` | Replace inline h1/p with `<PageHeader>`. |
| `lib/ui-styles.ts` | `pageBg`: `bg-slate-50` → `bg-background`. |

---

## 2. Token changes

- **No new CSS variables** in Batch 1 (optional: `--muted-surface` for table headers later).
- **Tailwind:** Add top-level `accent: "var(--accent)"` so `border-accent`, `text-accent`, `bg-accent` work without `luxury-` prefix. Keep `luxury.accent` for backward compatibility.
- **Unify usage:** All page wrappers use `bg-background` (Tailwind class from existing `colors.background`).
- **Focus ring:** Keep `ring-blue-500` for accessibility (no change).

---

## 3. Component updates

### 3.1 Global
- **globals.css:** Add `.page-content { padding: 1rem 1.5rem; padding-bottom: 4.5rem; }` at 768px `padding: 1.5rem`. Use for optional future layout. Add short comment block for token roles.

### 3.2 Sidebar
- **Active item:** `border-l-sky-500` / `border-r-sky-500` → `border-l-4 border-luxury-accent` / `border-r-4 border-r-luxury-accent` (RTL). Keep `bg-slate-100 font-medium text-slate-900`.
- **Border:** Keep `border-slate-200` or switch to `border-[var(--border)]` via class if we add it to Tailwind (we have `luxury.border` → `border-luxury-border`).
- **Footer:** Select and links — ensure consistent with design (no logic change).

### 3.3 MobileTopBar
- **Active link in drawer:** Same as sidebar — accent border (border-l-4 / border-r-4) and current bg.

### 3.4 MobileBottomNav
- **Active link:** `text-sky-600` → `text-luxury-accent`, keep `font-semibold`.

### 3.5 PageHeader (new)
- **Props:** `title: string`, `subtitle?: string`, `actions?: ReactNode`.
- **Layout:** Flex wrap; title (text-2xl font-semibold) using `var(--primary)` or `text-foreground`; subtitle (text-sm, muted); actions in right slot. Match SectionHeader pattern but with larger title and consistent spacing (e.g. mb-6 for section below).

### 3.6 ExecutiveDashboard
- Replace `<h1 className="mb-6 text-2xl font-semibold text-slate-900">` with `<PageHeader title={t(`dashboard.title.${titleKey}`)} />`. No subtitle for now.

### 3.7 SalesSummaryClient
- Replace the header block with `<PageHeader title={t('sales.summary.title')} subtitle={t('sales.summary.subtitle')} />`.

---

## 4. Diff preview

### globals.css
- Add comment: "Design tokens — single source for theme."
- Add utility: `.page-content { padding: 1rem; padding-bottom: 4.5rem; }` and `@media (min-width: 768px) { .page-content { padding: 1.5rem; padding-bottom: 1.5rem; } }`.

### tailwind.config.ts
- In `theme.extend.colors`, add `accent: "var(--accent)"` at root level (so `text-accent`, `bg-accent`, `border-accent` work).

### Page wrappers (dashboard, sales/summary, sales/my, sales/returns, delegation, executive employees, executive compare, change-password)
- Replace `bg-slate-100` or `bg-slate-50` with `bg-background`.
- Where present, add `pb-nav` to wrapper and use `p-4 md:p-6` for consistency.

### Sidebar.tsx
- Line ~150: `border-l-sky-500` → `border-luxury-accent`, `border-r-sky-500` → `border-r-luxury-accent`.

### MobileTopBar.tsx
- Active link class: `border-l-sky-500` / `border-r-sky-500` → `border-luxury-accent` / `border-r-luxury-accent`.

### MobileBottomNav.tsx
- Active: `text-sky-600` → `text-luxury-accent`.

### PageHeader.tsx (new file)
- Default export `PageHeader({ title, subtitle?, actions? })`; layout as above; use tokens for text color.

### ExecutiveDashboard.tsx
- Import PageHeader; replace h1 with PageHeader.

### SalesSummaryClient.tsx
- Import PageHeader; replace div with h1/p with PageHeader; adjust wrapper spacing.

### lib/ui-styles.ts
- `pageBg = 'bg-slate-50'` → `pageBg = 'bg-background'`.

---

## 5. Rollback

- Revert commit(s) for Batch 1.
- No API, route, or schema changes; safe to roll back CSS and component changes.

---

## 6. Batch 1 implemented

**Files modified:**
- `app/globals.css` — token comment, `.page-content` utility
- `tailwind.config.ts` — `accent`, `muted` at root
- `app/(dashboard)/layout.tsx` — `bg-background` class
- `app/(dashboard)/dashboard/page.tsx` — wrapper removed; dashboard uses layout background
- `app/(dashboard)/sales/summary/page.tsx` — `bg-background`, `pb-nav`, `p-4 md:p-6`
- `app/(dashboard)/sales/my/page.tsx`, `sales/returns/page.tsx` — same
- `app/(dashboard)/admin/control-panel/delegation/page.tsx` — same
- `app/(dashboard)/executive/employees/[empId]/page.tsx`, `executive/compare/page.tsx` — `bg-background`, padding
- `app/(auth)/change-password/page.tsx` — `bg-background`
- `components/nav/Sidebar.tsx`, `MobileTopBar.tsx`, `MobileBottomNav.tsx` — active state uses `border-accent` / `text-accent`
- `components/ui/PageHeader.tsx` — **new**
- `components/dashboard/ExecutiveDashboard.tsx` — PageHeader, `pb-nav`
- `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` — PageHeader
- `lib/ui-styles.ts` — `pageBg` → `bg-background`
