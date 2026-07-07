# Unused Pages Audit

Audit date: 2026-07-07  
Scope: `app/`, navigation (`lib/navConfig.ts`, `lib/nav/sidebarShellNav.ts`), and schedule-related UI.

This report flags routes that are unreachable from nav, duplicated, legacy, or orphaned. **No pages were deleted** in this pass.

## Schedule routes

| Route | File | Status | Reason | Replacement |
|-------|------|--------|--------|-------------|
| `/schedule/view` | `app/(dashboard)/schedule/view/page.tsx` | **KEEP** | Primary read-only schedule for all roles | — |
| `/schedule/edit` | `app/(dashboard)/schedule/edit/page.tsx` | **KEEP** | Official manager planning + grid editor | — |
| `/schedule/next` | `app/(dashboard)/schedule/next/page.tsx` | **KEEP** | New parallel pattern-based generator | — |
| `/schedule/audit` | `app/(dashboard)/schedule/audit/page.tsx` | **KEEP** | In sidebar; governance audit | — |
| `/schedule/audit-edits` | `app/(dashboard)/schedule/audit-edits/page.tsx` | **KEEP** | In nav hub; edit audit trail | — |
| `/schedule` | `app/(dashboard)/schedule/page.tsx` | **KEEP** | Smart redirect → `/schedule/edit` or `/schedule/view` | — |
| `/schedule/v3` | `app/(dashboard)/schedule/v3/page.tsx` | **LEGACY** | Engine lab; `hiddenFromNav: true` in `navConfig` | `/schedule/edit` (proposal flow) |
| `/schedule/editor` | `app/(dashboard)/schedule/editor/page.tsx` | **LEGACY** | Redirect only → `/schedule/edit` | `/schedule/edit` |
| `SchedulePageClient.tsx` | `app/(dashboard)/schedule/SchedulePageClient.tsx` | **DELETE_CANDIDATE** | Not mounted by any route; superseded by `ScheduleEditClient` / `ScheduleViewClient` | `/schedule/edit` |

## Schedule components (not pages)

| Item | File | Status | Reason | Replacement |
|------|------|--------|--------|-------------|
| Schedule Assistant modal | `components/schedule/ScheduleAssistantModal.tsx` | **LEGACY** | Old plan-assistant flow; still opened from editor technical area | Proposal review in `ScheduleEditClient` |
| Schedule Overview section | `components/dashboard/sections/ScheduleOverviewSection.tsx` | **KEEP** | Executive dashboard AM/PM snapshot; now uses compact coverage formatter (no slot spam) | — |
| Raw slot violation lists | Various (fixed in this pass) | **DELETE_CANDIDATE** | Replaced by `coverageWarningFormatter` + `CoverageWarningSummary` | Grouped warnings UI |

## Reports / export

| Route | File | Status | Reason | Replacement |
|-------|------|--------|--------|-------------|
| `/reports/schedule-export` | `app/(dashboard)/reports/schedule-export/page.tsx` | **KEEP** | Linked from sidebar export center | `/reports/export-center` |
| `/planner-export` | `app/(dashboard)/planner-export/page.tsx` | **HIDE_FROM_NAV** | Super-admin tooling; not in main sidebar | — |

## Hub / drill-down nav (`/nav/*`)

| Route pattern | Status | Reason |
|---------------|--------|--------|
| `/nav/team/schedule` | **KEEP** | Hub mirror of schedule links |
| `/nav/*` hub pages | **KEEP** | Secondary navigation; not duplicates of sidebar |

## Dashboard home vs executive

| Surface | Status | Reason |
|---------|--------|--------|
| `HomePageClient` operational alerts | **KEEP** (updated) | Now shows one coverage summary line instead of per-slot bullets |
| `ExecutiveDashboard` Schedule Overview | **KEEP** (updated) | Uses formatter; imbalance line only when AM > PM |
| Duplicate week warning list on home | **DELETE_CANDIDATE** (UI removed) | Was redundant with Operational Alerts; replaced by `CoverageWarningSummary` |

## Recommended follow-up (not done)

1. **Remove** `SchedulePageClient.tsx` after confirming no external deep links.
2. **Retire** `ScheduleAssistantModal` once all managers use Proposal Review / Schedule Next.
3. **Keep** `/schedule/v3` hidden — lab access via direct URL only.
4. Add redirect audit for `/schedule/editor` in analytics if traffic is zero.

## Navigation alignment

Sidebar schedule group (`lib/nav/sidebarShellNav.ts`):

- Schedule (View) → `/schedule/view`
- Schedule Planning → `/schedule/edit`
- Schedule Next → `/schedule/next`
- Schedule Audit → `/schedule/audit`

Not in sidebar (by design):

- `/schedule/v3` — LEGACY lab (`hiddenFromNav`)
- `/schedule/audit-edits` — hub / direct link
- `/schedule/editor` — legacy redirect
