# Navigation, Demo Mode & Luxury Theme — Implementation Report

**Date:** 2026-02-26  
**Mode:** STRICT ARCHITECT — Production safe, additive, reversible.

---

## Phase 1 — Professional Navigation Restructure

### Target structure (implemented)

| Section | Label | Contents |
|--------|--------|----------|
| **OPERATIONS** | Operations | Dashboard, Schedule (view/edit/editor/audit), Tasks, Inventory, Boutique tasks, Approvals, Daily Sales, My Sales |
| **PERFORMANCE** | Performance | Executive (single + insights/compare/employees/monthly), Targets, KPI Upload, Sales Summary/Returns/Import, Leadership Impact, Sales Edit Requests, My Target |
| **HR_AND_TEAM** | HR & Team | Employees, Area employees/targets, My Leaves, Leaves, Boutique leaves, Delegation, Roles & Permissions (access) |
| **SYSTEM** | System | Administration (dashboard, users, audit, settings, version), Boutiques, Regions, Boutique groups, Coverage rules, KPI templates, Reset emp/password, Planner export/sync, Import (dashboard + sales, snapshot, historical, issues, monthly matrix) |
| **HELP** | Help | About |

### Changes

- **lib/navConfig.ts** — Replaced flat group list with four main groups (OPERATIONS, PERFORMANCE, HR_AND_TEAM, SYSTEM) + HELP. Removed duplicate group keys; consolidated ADMINISTRATION, IMPORT, PLANNER_SYNC under SYSTEM. Executive items gated by `FEATURES.EXECUTIVE`. Role visibility and schedule permissions unchanged (`itemVisible`, `canEditSchedule`, `canApproveWeek`).
- **components/nav/Sidebar.tsx** — Updated `DEFAULT_OPEN_GROUPS` for new group keys; PERFORMANCE group opens by default; primary link for PERFORMANCE (when executive items exist) remains `/executive`.
- **messages/en.json** — Added `nav.group.PERFORMANCE`, `nav.group.HR_AND_TEAM`, `nav.group.SYSTEM` (kept legacy keys for compatibility).

### RBAC & isolation

- No change to route-level RBAC. `getNavGroupsForUser` / `getNavLinksForUser` / `getNavLinksForRole` still filter by role and schedule permissions. Multi-boutique isolation unchanged; SUPER_ADMIN still scoped per session.

---

## Phase 2 — Demo Mode (DEMO_VIEWER)

### Role & capabilities

- **New role:** `DEMO_VIEWER` (added to Prisma `enum Role`).
- **Can:** Log in, view Dashboard, Executive (and sub-pages), Schedule (view), KPI upload (view), About.
- **Cannot:** Edit schedule, add sales, edit targets, approve/reject leaves, access system/admin, export data. All mutation APIs blocked for this role.

### Implementation

- **prisma/schema.prisma** — Added `DEMO_VIEWER` to `enum Role`. **Migration required:** run `npx prisma migrate dev --name add_demo_viewer_role` (or equivalent).
- **lib/auth.ts** — Users with no `boutiqueId` are allowed when role is `DEMO_VIEWER` (same pattern as SUPER_ADMIN).
- **app/(dashboard)/layout.tsx** — Allow DEMO_VIEWER without boutique; set `navRole`, `canEditSchedule`, `canApproveWeek` for DEMO_VIEWER; show **“DEMO MODE — READ ONLY”** banner when `isDemoMode`.
- **lib/permissions.ts** — Added `ROLE_ROUTES.DEMO_VIEWER` (read-only routes); added `isDemoViewer(role)`.
- **lib/navConfig.ts** — Included DEMO_VIEWER in roles for Dashboard, Schedule view, Executive (all), KPI upload, About.
- **lib/roleLabel.ts** — Added `DEMO_VIEWER` to `ROLE_KEYS`.
- **messages/en.json** — Added `roleDemoViewer`: "Demo Viewer".
- **lib/demoGuard.ts** — New: `getDemoGuardResponse(request, user)` returns 403 for DEMO_VIEWER on POST/PUT/PATCH/DELETE (except `POST /api/auth/logout`). `requireNotDemoViewer(request, getUser)` helper for handlers.
- **app/api/leaves/approve/route.ts** — Calls `getDemoGuardResponse` after `getSessionUser()`.
- **app/api/leaves/reject/route.ts** — Same.
- **app/api/sales/entry/route.ts** — Same; uses `roleUser` after `requireRole` for handler logic.
- **lib/rbac/effectiveAccess.ts** — `ROLE_ORDER` includes DEMO_VIEWER and AREA_MANAGER; `baselineFlags` returns all false for DEMO_VIEWER.
- **components/RouteGuard.tsx** — DEMO_VIEWER redirected to `/dashboard` when accessing a disallowed route.
- **lib/mobileAuth.ts** — Added `AREA_MANAGER` and `DEMO_VIEWER` to `MOBILE_PERMISSIONS_BY_ROLE` (DEMO_VIEWER: read-only `schedule:view`).

### Idle logout

- **IdleDetector** already enforces 30-minute inactivity and redirect to login; no change. Applies to all roles including DEMO_VIEWER.

### API protection

- Mutation endpoints that use `getSessionUser()` without a role allowlist should call `getDemoGuardResponse(request, user)` at the start and return its result if non-null. Applied in leaves/approve, leaves/reject, sales/entry. Other mutation routes use `requireRole([...])` which excludes DEMO_VIEWER, so they already return 403 for that role. **Checklist:** when adding new mutation APIs, either include the demo guard or use `requireRole` with an explicit list that omits DEMO_VIEWER.

---

## Phase 3 — Light Corporate Luxury UI Theme

### Design tokens

- **lib/designTokens.ts** — New. Tokens: background `#F8F8F6`, primary `#1E1E1E`, accent `#C6A75E`, success `#4A7C59`, error `#B85450`, border, muted, radius (card 12px, button 8px), soft shadow.
- **app/globals.css** — `:root` updated to Light Corporate Luxury (--app-bg, --surface, --border, --text, --muted, --accent, --primary, --success, --error, --radius-card, --radius-button, --shadow-card).
- **tailwind.config.ts** — Extended theme with `luxury.*` colors, `rounded-card`, `shadow-card`.

### Reusable components

- **components/ui/CardShell.tsx** — New. Card with 12px radius, soft shadow, spacious padding, uses CSS vars.
- **components/ui/ExecutivePanel.tsx** — New. Panel with optional title, subtitle, actions; uses luxury tokens.
- **components/ui/KPIBlock.tsx** — New. Single KPI with optional gold highlight (`highlight` uses `var(--accent)`).
- **components/ui/SectionHeader.tsx** — Updated to use `var(--primary)` and `var(--muted)` for title and subtitle.

Existing **Card**, **Panel**, **KpiCard** unchanged; they already use `var(--surface)` / `var(--border)`. New components are additive for consistent luxury styling.

---

## Files changed (summary)

| Area | Files |
|------|--------|
| **Nav** | `lib/navConfig.ts`, `components/nav/Sidebar.tsx`, `messages/en.json` |
| **Demo** | `prisma/schema.prisma`, `lib/auth.ts`, `lib/permissions.ts`, `lib/roleLabel.ts`, `lib/demoGuard.ts`, `lib/rbac/effectiveAccess.ts`, `lib/mobileAuth.ts`, `app/(dashboard)/layout.tsx`, `components/RouteGuard.tsx`, `app/api/leaves/approve/route.ts`, `app/api/leaves/reject/route.ts`, `app/api/sales/entry/route.ts`, `messages/en.json` |
| **Theme** | `lib/designTokens.ts`, `app/globals.css`, `tailwind.config.ts`, `components/ui/CardShell.tsx`, `components/ui/ExecutivePanel.tsx`, `components/ui/KPIBlock.tsx`, `components/ui/SectionHeader.tsx` |
| **Docs** | `docs/NAV_DEMO_THEME_REPORT.md` (this file) |

---

## Validation checklist

- **Multi-boutique isolation** — Unchanged; scope and effective access logic unchanged except DEMO_VIEWER handling.
- **Role separation** — DEMO_VIEWER restricted to read-only routes and blocked on mutations; other roles unchanged.
- **API protection** — Demo guard applied on key mutation routes; DEMO_VIEWER not in any `requireRole` allowlist for mutations.
- **Routes** — No routes removed; nav only reorganized and DEMO_VIEWER routes added.
- **Build / TypeScript** — After running `npx prisma migrate dev --name add_demo_viewer_role` and `npx prisma generate`, run `npm run typecheck` and `npm run build`. Resolve any pre-existing Prisma/client errors if present.
- **Production** — Additive and reversible: revert schema migration to drop DEMO_VIEWER; revert navConfig to restore previous groups; theme vars can be reverted in globals.css and tailwind.

---

## Security confirmation

- DEMO_VIEWER cannot call mutation APIs (guard returns 403); logout is allowed.
- RouteGuard and ROLE_ROUTES restrict DEMO_VIEWER to allowed paths; direct URL access to admin/system redirects to `/dashboard`.
- No new bypass; session and auth flow unchanged.

---

## UX summary

- **Nav:** Clear hierarchy (Operations → Performance → HR & Team → System → Help), collapsible sections, active state and primary Executive link preserved.
- **Demo:** Obvious “DEMO MODE — READ ONLY” banner; 30-min idle logout; read-only nav and APIs.
- **Theme:** Softer background and borders, muted gold accent, consistent card/panel/KPI styling for a more executive, luxury-retail presentation.
