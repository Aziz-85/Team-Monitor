# Team Monitor — Route & Page Audit

Audit date: 2026-07-07 (Phase 1 simplification)  
Scope: all `app/**/page.tsx` routes (119), `lib/navConfig.ts`, `lib/nav/sidebarShellNav.ts`.

**No pages were deleted.** Legacy routes remain reachable; nav-hidden where noted.

## Legend

| Status | Meaning |
|--------|---------|
| **PRIMARY** | Main product entry for managers |
| **MANUAL_EDIT** | Secondary manual grid editor |
| **KEEP** | Active product surface |
| **HIDE_FROM_NAV** | Intentionally not in sidebar (hub, deep link, admin tool) |
| **LEGACY** / **LEGACY_LAB** | Redirect, lab, or superseded flow |
| **DELETE_CANDIDATE** | Orphaned / duplicate; safe to remove after traffic check |

## Schedule (priority — Phase 1)

| Route | File | Nav? | Linked? | Status | Reason | Replacement |
|-------|------|------|---------|--------|--------|-------------|
| `/schedule/next` | `app/(dashboard)/schedule/next/page.tsx` | Yes | Yes | **PRIMARY** | Primary weekly generator (Schedule Planning group) | — |
| `/schedule/edit` | `app/(dashboard)/schedule/edit/page.tsx` | Hidden | Yes | **MANUAL_EDIT** | Manual grid adjustments after proposal | `/schedule/next` |
| `/schedule/view` | `app/(dashboard)/schedule/view/page.tsx` | Yes | Yes | **KEEP** | Read-only schedule for staff | — |
| `/schedule/audit` | `app/(dashboard)/schedule/audit/page.tsx` | Yes | Yes | **KEEP** | Governance audit log | — |
| `/schedule/audit-edits` | `app/(dashboard)/schedule/audit-edits/page.tsx` | Hub | Yes | **KEEP** | Edit audit trail | — |
| `/schedule` | `app/(dashboard)/schedule/page.tsx` | — | Redirect | **KEEP** | Managers → `/schedule/next`; others → `/schedule/view` | — |
| `/schedule/v3` | `app/(dashboard)/schedule/v3/page.tsx` | Hidden | Deep link | **LEGACY_LAB** | Engine lab; `hiddenFromNav` + banner | `/schedule/next` |
| `/schedule/editor` | `app/(dashboard)/schedule/editor/page.tsx` | No | Redirect | **LEGACY** | Old URL → `/schedule/edit` | `/schedule/edit` |
| `SchedulePageClient` | `app/(dashboard)/schedule/SchedulePageClient.tsx` | — | **No** | **DELETE_CANDIDATE** | Not mounted by any route | `/schedule/next` |

### Schedule components (not routes)

| Item | File | Status | Reason | Replacement |
|------|------|--------|--------|-------------|
| Schedule Assistant modal | `components/schedule/ScheduleAssistantModal.tsx` | **LEGACY** | Old plan assistant; reachable from Edit → Advanced only | Schedule Next |
| Proposed Schedule Review | `components/schedule/ProposedScheduleReview.tsx` | **LEGACY** | v3 proposal flow in Edit → Advanced | Schedule Next |
| Raw slot warning lists | Various (pre-formatter) | **DELETE_CANDIDATE** | Replaced by `coverageWarningFormatter` | `CoverageWarningSummary` |
| Coverage formatter | `lib/schedule/coverageWarningFormatter.ts` | **KEEP** | Shared grouped warnings | — |
| `CoverageWarningSummary` | `components/schedule/CoverageWarningSummary.tsx` | **KEEP** | Standard warning UI | — |

### Sidebar (Phase 1)

Group **Schedule Planning** shows:

- Schedule Next → `/schedule/next`
- Schedule View → `/schedule/view`
- Schedule Audit → `/schedule/audit`

Hidden from sidebar: `/schedule/edit` (manual), `/schedule/v3` (lab), legacy assistant entry points.

## Home & dashboard

| Route | File | Nav? | Status | Reason |
|-------|------|------|--------|--------|
| `/` | `app/(dashboard)/page.tsx` | Yes | **KEEP** | Manager home |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Yes | **KEEP** | Executive dashboard |
| `/employee` | `app/(dashboard)/employee/page.tsx` | Yes | **KEEP** | Employee home |
| `/performance` | `app/(dashboard)/performance/page.tsx` | Hub | **KEEP** | Performance hub |

## Executive

| Route | Nav? | Status |
|-------|------|--------|
| `/executive` | Hub | **KEEP** |
| `/executive/monthly` | Hub | **KEEP** |
| `/executive/insights` | Hub | **KEEP** |
| `/executive/compare` | Hub | **KEEP** |
| `/executive/employees` | Hub | **KEEP** |
| `/executive/employees/[empId]` | Deep | **KEEP** |
| `/executive/network` | Hub | **HIDE_FROM_NAV** |

## Sales

| Route | Nav? | Status |
|-------|------|--------|
| `/sales/daily` | Yes | **KEEP** |
| `/sales/my` | Yes | **KEEP** |
| `/sales/summary` | Hub | **KEEP** |
| `/sales/returns` | Hub | **KEEP** |
| `/sales/analytics` | Hub | **KEEP** |
| `/sales/import` | Admin | **KEEP** |
| `/sales/import-matrix` | Admin | **KEEP** |
| `/sales/import-issues` | Admin | **KEEP** |
| `/sales/monthly-matrix` | Admin | **KEEP** |
| `/sales/leadership-impact` | Hub | **HIDE_FROM_NAV** |

## Tasks & inventory

| Route | Nav? | Status |
|-------|------|--------|
| `/tasks` | Yes | **KEEP** |
| `/tasks/setup` | Yes | **KEEP** |
| `/tasks/monitor` | Manager | **KEEP** |
| `/inventory/daily` | Yes | **KEEP** |
| `/inventory/daily/history` | Yes | **KEEP** |
| `/inventory/zones` | Yes | **KEEP** |
| `/inventory/zones/weekly` | Deep | **KEEP** |
| `/inventory/follow-up` | Yes | **KEEP** |

## Leaves & compliance

| Route | Nav? | Status |
|-------|------|--------|
| `/leaves` | Yes | **KEEP** |
| `/leaves/requests` | Employee | **KEEP** |
| `/boutique/leaves` | Manager | **KEEP** |
| `/compliance` | Yes | **KEEP** |
| `/approvals` | Yes | **KEEP** |

## Reports & export

| Route | Nav? | Status |
|-------|------|--------|
| `/reports/export-center` | Yes | **KEEP** |
| `/reports/weekly` | Hub | **KEEP** |
| `/reports/store` | Hub | **KEEP** |
| `/reports/store/[boutiqueId]` | Deep | **KEEP** |
| `/reports/store/[boutiqueId]/print` | Deep | **KEEP** |
| `/reports/schedule-export` | Sidebar export | **KEEP** |
| `/planner-export` | Super-admin | **HIDE_FROM_NAV** |

## Nav hub (`/nav/*`)

| Route | Status | Reason |
|-------|--------|--------|
| `/nav/team` | **KEEP** | Drill-down hub |
| `/nav/team/schedule` | **KEEP** | Schedule hub mirror |
| `/nav/team/employees` | **KEEP** | Hub |
| `/nav/team/leaves` | **KEEP** | Hub |
| `/nav/operations` | **KEEP** | Hub |
| `/nav/operations/tasks` | **KEEP** | Hub |
| `/nav/operations/inventory` | **KEEP** | Hub |
| `/nav/analytics` | **KEEP** | Hub |
| `/nav/analytics/sales` | **KEEP** | Hub |
| `/nav/analytics/reports` | **KEEP** | Hub |
| `/nav/system` | **KEEP** | Admin hub |
| `/nav/system/admin` | **KEEP** | Admin hub |
| `/nav/system/imports` | **KEEP** | Admin hub |

## Admin (`/admin/*`) — 38 routes

All admin routes are **KEEP** or **HIDE_FROM_NAV** (super-admin / integration tooling). Not listed individually; they are linked from `/nav/system`, administration menus, or direct bookmarks.

Notable:

| Route | Status | Reason |
|-------|--------|--------|
| `/admin/coverage-rules` | **KEEP** | Coverage policy config |
| `/admin/integrations/planner` | **HIDE_FROM_NAV** | Integration |
| `/admin/system-audit` | **HIDE_FROM_NAV** | Super-admin audit |

## Auth

| Route | Status |
|-------|--------|
| `/login` | **KEEP** |
| `/change-password` | **KEEP** |

## Company / area / targets

| Route | Status |
|-------|--------|
| `/company` | **KEEP** |
| `/company/*` (4 sub-routes) | **KEEP** |
| `/area/employees` | **KEEP** |
| `/area/targets` | **KEEP** |
| `/targets` | **KEEP** |
| `/targets/*` (3 sub-routes) | **KEEP** |
| `/me/target` | **KEEP** |
| `/boutique/tasks` | **KEEP** |
| `/sync/planner` | **KEEP** |
| `/kpi/upload` | **HIDE_FROM_NAV** |
| `/about` | **KEEP** |

## Coverage warning cleanup (this pass)

Shared formatter: `lib/schedule/coverageWarningFormatter.ts`  
Shared UI: `components/schedule/CoverageWarningSummary.tsx`

Updated surfaces:

- Home dashboard — Operational Alerts, week summary
- Executive Schedule Overview
- Schedule View — week warnings panel
- Schedule Planning — technical panel (`CompactScheduleWarnings`)
- Schedule month tables — compact per-day warning cell
- Technical Analysis / v3 lab — grouped slot violations
- Schedule Assistant modal — apply blocked summary

Main UI rule: **one line** — `Coverage needs attention: X days affected.`  
Details: collapsed, grouped by day and period (never 30-minute slot lists by default).

## Recommended follow-up

1. Delete `SchedulePageClient.tsx` after confirming zero traffic.
2. Retire `ScheduleAssistantModal` when proposal-first flow is universal.
3. Keep `/schedule/v3` hidden from nav (lab only).
4. Monitor `/schedule/editor` redirect — candidate for permanent removal of route file.
