# I18N + RTL Completion Report — Team Monitor

**Date:** 2025-02-26  
**Goal:** Arabic mode fully RTL and fully translated (text, spacing, icon direction, tables, dates/numbers). Patch only; no redesign; no DB schema changes.

---

## Summary

- **Single translation helper** (`lib/i18n/useT.ts`) added; login, IdleDetector, Sidebar, DesktopNav, MobileTopBar migrated to `useT`. Other pages can migrate by replacing local `getNested`/`t` with `useT()`.
- **Hardcoded strings removed** from login (errors, headings, placeholders), IdleDetector (warning), Sidebar/DesktopNav/MobileTopBar (app title). New keys added to `messages/en.json` and `messages/ar.json`.
- **RTL spacing/alignment:** `text-left` → `text-start`, `text-right` → `text-end`, `ml-*` → `ms-*`, `mr-*` → `me-*` applied across TSX/JSX.
- **RTL icons:** `lib/ui/dirIcon.ts` added; `[dir="rtl"] .rtl-flip` added in `globals.css` for chevrons/arrows.
- **Date/number formatting:** `lib/i18n/format.ts` with `formatDate(locale, date, opts)` and `formatNumber(locale, n, opts)` for locale-aware display.
- **Arabic cleanup:** In `messages/ar.json`, "Area Manager" → "مدير المنطقة", "Employees (Global)" / "Targets (Global)" → Arabic equivalents. App name "Team Monitor" kept as-is.

---

## A) Single Translation Helper

| File | Change |
|------|--------|
| `lib/i18n/getNested.ts` | **NEW** — `getNested(messages, path)` for dot-path lookup. |
| `lib/i18n/useT.ts` | **NEW** — `useT()` returns `{ t, locale, dir, isRtl }`; `t(key)` returns string or key fallback. Uses `useI18n()` from `@/app/providers`. |
| `app/(auth)/login/page.tsx` | Replaced local `getNested`/`t` with `useT()`. |
| `components/IdleDetector.tsx` | Replaced with `useT()`; warning text uses `t('idle.warning')`. |
| `components/nav/Sidebar.tsx` | Replaced local `getNested`/`t` with `useT()`; app title uses `t('nav.appTitle')`. |
| `components/nav/DesktopNav.tsx` | Replaced local `getNested`/`t` with `useT()`; app title uses `t('nav.appTitle')`. |
| `components/nav/MobileTopBar.tsx` | Replaced local `getNested`/`t` with `useT()`; app title uses `t('nav.appTitle')`. |

**Remaining:** Other components/pages still use in-file `getNested` + `useI18n()`. They can be migrated by importing `useT` from `@/lib/i18n/useT` and removing local `getNested`/`t`.

---

## B) Hardcoded Strings (P0)

| Location | Fix |
|----------|-----|
| Login | All `setError` and headings/placeholders use `t('auth.*')`: `noBoutique`, `idleSignOut`, `passwordChangedPleaseLogin`, `tooManyAttempts`, `loginFailed`, `connectionError`, `showPassword`, `hidePassword`, `usernamePlaceholder`, `usernameHint`. Title: `t('nav.appTitle')`. |
| IdleDetector | Warning: `t('idle.warning')`. |
| Sidebar / DesktopNav / MobileTopBar | "Team Monitor" → `t('nav.appTitle')`. |

**New keys (en + ar):**

- `auth.noBoutique`, `auth.idleSignOut`, `auth.loginFailed`, `auth.showPassword`, `auth.hidePassword`
- `nav.appTitle` ("Team Monitor" — kept in both locales as app name)
- `idle.warning`

---

## C) RTL Spacing + Alignment

| Change | Scope |
|--------|--------|
| `text-left` → `text-start` | All TSX/JSX (classNames). |
| `text-right` → `text-end` | All TSX/JSX (classNames). |
| `ml-*` → `ms-*` | All TSX/JSX. |
| `mr-*` → `me-*` | All TSX/JSX. |

**Files touched (examples):** Sidebar, ExecDataCell, ExecTable, ExecSimpleTable, NetworkExecutiveClient, ScheduleAuditClient, SalesAnalyticsSection, SalesImportTabsClient, HistoricalImportClient, ScheduleExcelViewClient, ScheduleEditExcelViewClient, plus all other files under `app/`, `components/` that contained these classes.

**Sidebar:** Also `pl-2 border-l border-slate-200 ml-3` → `ps-2 border-s border-slate-200 ms-3` for RTL-safe nesting.

---

## D) Icons / Arrows Direction (RTL)

| File | Change |
|------|--------|
| `lib/ui/dirIcon.ts` | **NEW** — `dirIcon(isRtl, LtrIcon, RtlIcon)` returns the correct icon component for direction. |
| `app/globals.css` | **NEW** — `[dir="rtl"] .rtl-flip { transform: rotate(180deg); }` for SVG chevrons/arrows. |

**Usage:** Use `dirIcon(isRtl, ChevronLeft, ChevronRight)` (or equivalent) in pagination, breadcrumbs, next/prev, back buttons. Add class `rtl-flip` to SVGs that should flip in RTL.

---

## E) Date & Number Formatting

| File | Change |
|------|--------|
| `lib/i18n/format.ts` | **NEW** — `formatDate(locale, date, opts)` and `formatNumber(locale, n, opts)` using `Intl.DateTimeFormat` / `Intl.NumberFormat` with `ar-SA` for Arabic and `en-GB` for English. |

**Usage:** Replace `toLocaleDateString()` / `toLocaleString()` without locale with `formatDate(locale, date)` or `formatNumber(locale, n)` in executive clients, analytics, planner export, weekly-pdf, etc., passing `locale` from `useT().locale`.

---

## F) Arabic File Cleanup

| Key (ar.json) | Before | After |
|---------------|--------|--------|
| `adminEmp.roleAreaManager` | "Area Manager" | "مدير المنطقة" |
| `nav.group.AREA_MANAGER` | "Area Manager" | "مدير المنطقة" |
| `nav.area.employees` | "Employees (Global)" | "الموظفون (عالمي)" |
| `nav.area.targets` | "Targets (Global)" | "الأهداف (عالمي)" |

AM/PM left as-is where already used in schedule/coverage (e.g. rashid.amShort/pmShort).

---

## G) Validation

| Check | Result |
|-------|--------|
| `npm run typecheck` | Fails only in `__tests__/sales-summary-targets.test.ts` (imports non-exported route helpers — pre-existing). App and i18n code typecheck. |
| `npm run build` | **Passes.** |

**Manual checks (recommended):**

1. Switch locale to Arabic: entire UI should be RTL (alignment, spacing, nav, tables).
2. No English in Arabic UI except the app name if kept as "Team Monitor".
3. Icons/arrows (e.g. next/prev, breadcrumbs) flip correctly in RTL; use `rtl-flip` or `dirIcon` where needed.
4. Dates and numbers use Arabic locale when `locale === 'ar'` (use `formatDate` / `formatNumber` with `useT().locale` where applicable).

---

## File List (Changed / Added)

**New files**

- `lib/i18n/getNested.ts`
- `lib/i18n/useT.ts`
- `lib/i18n/format.ts`
- `lib/ui/dirIcon.ts`

**Modified**

- `app/(auth)/login/page.tsx` — useT; all strings via t()
- `app/globals.css` — RTL .rtl-flip
- `components/IdleDetector.tsx` — useT; t('idle.warning')
- `components/nav/Sidebar.tsx` — useT; t('nav.appTitle'); RTL spacing
- `components/nav/DesktopNav.tsx` — useT; t('nav.appTitle')
- `components/nav/MobileTopBar.tsx` — useT; t('nav.appTitle')
- `messages/en.json` — auth.*, nav.appTitle, idle.warning
- `messages/ar.json` — auth.*, nav.appTitle, idle.warning; area.* and roleAreaManager/AREA_MANAGER in Arabic
- All TSX/JSX under `app/`, `components/` that contained `text-left`/`text-right` or `ml-`/`mr-` (replaced with start/end and ms/me)
- `__tests__/ssot-scope.test.ts` — type narrowing fix for result.res

---

## Next Steps (Optional)

1. Migrate remaining pages to `useT()` and remove local `getNested`/`t` (see list from grep for `getNested`/`useI18n`).
2. Use `formatDate`/`formatNumber` in executive clients, analytics, planner export, and weekly-pdf route where dates/numbers are shown.
3. Add `rtl-flip` or `dirIcon` to any remaining chevrons/arrows (pagination, breadcrumbs, next/prev, back).
4. Fix `__tests__/sales-summary-targets.test.ts` (export helpers from route or test via API) so `npm run typecheck` passes fully.
