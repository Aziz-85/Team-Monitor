# Post-Refactor Navigation Validation Report

**Scope:** Stage 2 sidebar/navigation structure only. Audit only — no file or logic changes.

**Date:** 2025-02-25

---

## 1. Role visibility validation

For each role, below are the **nav groups** and **nav links** visible when using `getNavGroupsForUser` / `getNavLinksForRole` from `lib/navConfig.ts` (with `FEATURES.EXECUTIVE === true`). Schedule-based filtering (`itemVisible`: schedule edit, editor, approvals) is noted where it further restricts visibility on **Sidebar / MobileTopBar** (not on **MobileBottomNav**, which uses role-only).

| Role | Groups visible | Links (by group) |
|------|----------------|-----------------|
| **EMPLOYEE** | DASHBOARD, TEAM, SALES, TASKS, INVENTORY, HELP | Dashboard, My Home; Schedule (View), My Leaves; My Sales, Returns, My Target; Tasks; Daily Inventory, Zone Inventory; About |
| **ASSISTANT_MANAGER** | DASHBOARD, TEAM, SALES, TASKS, INVENTORY, HELP | Dashboard, My Home; Schedule View + (edit/editor/approvals if RBAC); Leaves, Boutique leaves, Delegation; Sales Summary, Returns, Import Sales, My Target; Tasks, Monitor, Setup, Boutique tasks; all Inventory; About |
| **MANAGER** | DASHBOARD, TEAM, SALES, TASKS, INVENTORY, REPORTS, SETTINGS, HELP | Home, Dashboard; all TEAM (no admin/employees); all SALES; all TASKS; all INVENTORY; Executive*; Export, Sync Planner; About |
| **ADMIN** | All 8 groups | All items in every group (schedule edit/approvals still gated by `itemVisible`) |
| **SUPER_ADMIN** | All 8 groups | Same as ADMIN |
| **AREA_MANAGER** | TEAM, HELP | Area employees, Area targets; About. **No DASHBOARD group** (no Home, no Dashboard link in nav). |
| **DEMO_VIEWER** | DASHBOARD, TEAM, SALES, REPORTS, HELP | Dashboard; Schedule (View); KPI Upload; Executive (all 5); About |

**Note:** Sidebar and MobileTopBar use `getNavLinksForUser` / `getNavGroupsForUser` (role + `canEditSchedule` / `canApproveWeek`). MobileBottomNav uses `getNavLinksForRole(role)` only, so it does **not** apply schedule permission filtering.

---

## 2. Broken nav detection

### 2.1 Nav items pointing to alias routes

| Severity | Item | Current href | Canonical / note | File |
|----------|------|--------------|------------------|------|
| **Medium** | Administration — Permissions / Access | `/admin/administration/access` | Page redirects to `/admin/memberships`. Nav uses alias; SETTINGS group uses canonical routes elsewhere. | `lib/navConfig.ts` (TEAM group, line 45) |

### 2.2 Nav items pointing to redirect-only routes

| Severity | Item | Current href | Behavior | File |
|----------|------|--------------|----------|------|
| **Low** | Export | `/planner-export` | Redirects to `/sync/planner`. Same destination as "Sync Planner"; two nav entries for one destination. | `lib/navConfig.ts` (SETTINGS, line 121); `app/(dashboard)/planner-export/page.tsx` |

### 2.3 Nav items visible to roles blocked server-side

| Severity | Item | Roles in nav | Server guard | File refs |
|----------|------|--------------|-------------|-----------|
| **High** | Executive (all 5 REPORTS links) | MANAGER, ADMIN, SUPER_ADMIN, **DEMO_VIEWER** | `executive/page.tsx` (and insights, compare, employees, monthly): only MANAGER, ADMIN, SUPER_ADMIN. DEMO_VIEWER is redirected to `/dashboard`. | `lib/navConfig.ts` (REPORTS, lines 96–100); `app/(dashboard)/executive/page.tsx` (line 8) |
| **High** | KPI Upload | ADMIN, SUPER_ADMIN, MANAGER, **DEMO_VIEWER** | `kpi/upload/page.tsx`: only ADMIN, SUPER_ADMIN, MANAGER. DEMO_VIEWER is redirected to `/`. | `lib/navConfig.ts` (SALES, line 63); `app/(dashboard)/kpi/upload/page.tsx` (line 8) |

### 2.4 Server-allowed pages missing from nav (admin)

| Severity | Page | Allowed roles | Note | File |
|----------|------|---------------|------|------|
| **Medium** | `/admin/memberships` | ADMIN, SUPER_ADMIN | Canonical page for "Permissions / Access". Nav links to alias `/admin/administration/access` (redirects here). No direct nav entry for `/admin/memberships`. | `app/(dashboard)/admin/memberships/page.tsx`; `lib/navConfig.ts` |
| **Low** | `/admin/system-audit` | ADMIN, SUPER_ADMIN | Listed in `ROLE_ROUTES`; no entry in navConfig SETTINGS. May be intentional (deep admin). | `lib/permissions.ts`; `app/(dashboard)/admin/system-audit/page.tsx` |

---

## 3. Group consistency audit

### 3.1 Duplicated destinations across groups

- **planner-export** and **sync/planner**: both in SETTINGS; `/planner-export` redirects to `/sync/planner`. Effectively one destination, two labels (Export vs Sync Planner). **Low** — UX redundancy.

### 3.2 Items that might belong in another group

- **KPI Upload** is in SALES. It could also be considered REPORTS or SETTINGS; current placement is acceptable and no change recommended for this audit.

### 3.3 Reports scattered outside REPORTS

- All Executive routes are in REPORTS. Sales summary, returns, targets, leadership impact, etc. are in SALES. No report-like destinations are left under PERFORMANCE or other old groups. **PASS.**

### 3.4 Settings/system tools outside SETTINGS

- Planner export and Sync planner are in SETTINGS (MANAGER+). No admin/system tools are exposed only outside SETTINGS. **PASS.**

---

## 4. Mobile nav consistency

### 4.1 Visibility logic

- **Sidebar:** `getNavGroupsForUser({ role, canEditSchedule, canApproveWeek })` — same as navConfig + schedule RBAC.
- **MobileTopBar (drawer):** `getNavLinksForUser({ role, canEditSchedule, canApproveWeek })` from `@/lib/permissions` (re-export of `navConfig`). **Same visibility as Sidebar.**
- **MobileBottomNav:** `getNavLinksForRole(role)` — **role-only**; no `canEditSchedule` / `canApproveWeek`.

### 4.2 Discrepancy

| Severity | Issue | Detail |
|----------|--------|--------|
| **Medium** | MobileBottomNav does not apply schedule permissions | A MANAGER without `canEditSchedule` or `canApproveWeek` will see "Schedule Editor" / "Schedule (day editor)" / "Approvals" in the bottom nav "More" list, while the Sidebar and MobileTopBar drawer will hide those links. So the same role can see **different** links on bottom nav vs drawer/sidebar. |

**File refs:** `components/nav/MobileBottomNav.tsx` (uses `getNavLinksForRole(role)` only); `components/nav/MobileTopBar.tsx` (uses `getNavLinksForUser(...)`); `lib/navConfig.ts` (`itemVisible` not used in `getNavLinksForRole`).

---

## 5. Translation audit

### 5.1 New group labels (nav.group)

- **en.json / ar.json:** DASHBOARD, TEAM, SALES, TASKS, INVENTORY, REPORTS, SETTINGS, HELP are present in both. **PASS.**

### 5.2 Item label keys used in navConfig

All keys used in `lib/navConfig.ts` were checked:

- `nav.*` and `nav.admin.*` — present in both en and ar (including `nav.sales.leadershipImpact` under `nav.sales`).
- `schedule.auditEditsTitle` — under `schedule` in both. **PASS.**
- `tasks.monitorNav`, `tasks.setup` — under `tasks` in both. **PASS.**

### 5.3 Old group names still used

- Legacy keys (OPERATIONS, PERFORMANCE, HR_AND_TEAM, SYSTEM, EXECUTIVE, etc.) remain in `nav.group` in en/ar. They are **not** referenced by the new nav structure (which uses DASHBOARD, TEAM, …). **No issue** — kept for backward compatibility.

### 5.4 Arabic naming

- New group labels have consistent Arabic (لوحة القيادة، الفريق، المبيعات، المهام، الجرد، التقارير، الإعدادات، مساعدة). No broken or inconsistent naming detected. **PASS.**

### 5.5 Label length (sidebar)

- No labels were found to be excessively long for typical sidebar width; "Administration — Users & Roles" / "Administration — Permissions / Access" are the longest and are acceptable. **PASS.**

---

## 6. Other consistency notes (audit only)

### 6.1 ROLE_ROUTES vs nav vs page guards

- **lib/permissions.ts** `ROLE_ROUTES.MANAGER` still includes `/admin/employees`. Page `admin/employees/page.tsx` allows only ADMIN and SUPER_ADMIN. So:
  - **Nav:** Correctly shows Employees only to ADMIN, SUPER_ADMIN.
  - **Page:** Correctly restricts to ADMIN, SUPER_ADMIN.
  - **ROLE_ROUTES:** Still allows MANAGER for `/admin/employees`. Any code using `canAccessRoute(role, pathname)` could treat MANAGER as allowed for that path even though the page redirects. **Informational** — no change requested in this audit.

### 6.2 AREA_MANAGER and Dashboard

- AREA_MANAGER has no DASHBOARD group item (no Home, no Dashboard). They do have TEAM (Area employees, Area targets) and HELP (About). `/dashboard` is server-allowed. So AREA_MANAGER can open `/dashboard` if they know the URL or land there, but there is no Dashboard link in the sidebar. **Low** — could be intentional (area-focused home).

---

## 7. Final validation summary

### Result: **CONDITIONAL PASS**

The new navigation structure is **internally consistent** for groups, ordering, and canonical SETTINGS routes. Remaining issues are confined to:

- **Role vs server alignment** (DEMO_VIEWER for Executive and KPI Upload).
- **One alias in TEAM** and **missing canonical entry** for Memberships.
- **Mobile bottom nav** using role-only visibility (schedule permissions not applied).
- **Duplicate destination** (planner-export → sync/planner) and **ROLE_ROUTES** / AREA_MANAGER dashboard as minor or informational items.

### Issue count by severity

| Severity | Count |
|----------|--------|
| High | 2 (DEMO_VIEWER sees Executive + KPI Upload; server blocks both) |
| Medium | 3 (alias administration/access; missing /admin/memberships; MobileBottomNav schedule gating) |
| Low | 3 (planner-export duplicate destination; AREA_MANAGER no Dashboard link; system-audit not in nav) |

### Recommended fixes (for later implementation; not applied in this audit)

1. **High:** Remove DEMO_VIEWER from REPORTS (Executive) and from KPI Upload in SALES in `lib/navConfig.ts` so nav matches server guards.
2. **Medium:** In `lib/navConfig.ts`, either (a) replace TEAM item `href` `/admin/administration/access` with `/admin/memberships` and keep the same label key, or (b) add a SETTINGS item for `/admin/memberships` and remove the TEAM administration/access item (if Access is considered settings-only).
3. **Medium:** Consider making MobileBottomNav use `getNavLinksForUser` with `canEditSchedule`/`canApproveWeek` (or an equivalent role+permission source) so it matches Sidebar/MobileTopBar visibility.
4. **Low:** Optionally remove "Export" (`/planner-export`) from SETTINGS and keep only "Sync Planner" to avoid two entries for one destination; or document that Export is the preferred label and keep redirect.
5. **Low:** Optionally add Dashboard (or Home) for AREA_MANAGER in DASHBOARD if product wants them to have an explicit dashboard link.

---

### Stage 2 cleanup (applied)

- **DEMO_VIEWER:** Removed from REPORTS (Executive) and KPI Upload in SALES so nav matches server access.
- **Memberships:** TEAM nav item now points to canonical `/admin/memberships` with key `nav.admin.memberships` (alias `/admin/administration/access` and redirect page unchanged).
- **MobileBottomNav:** Uses `getNavLinksForUser({ role, canEditSchedule, canApproveWeek })`; callers must pass `canEditSchedule` and `canApproveWeek` for consistency with Sidebar/MobileTopBar.
- **Planner:** Removed `/planner-export` from SETTINGS; kept only **Sync Planner** (`/sync/planner`, `nav.syncPlanner`). Redirect at `/planner-export` preserved.
- **AREA_MANAGER Dashboard:** Left unchanged; server allows `/dashboard`; no nav link by design. Add explicitly only if product intends it.

---

**Files referenced in this report**

- `lib/navConfig.ts`
- `components/nav/Sidebar.tsx`
- `components/nav/MobileTopBar.tsx`
- `components/nav/MobileBottomNav.tsx`
- `lib/permissions.ts`
- `messages/en.json`, `messages/ar.json`
- `app/(dashboard)/admin/employees/page.tsx`
- `app/(dashboard)/admin/administration/access/page.tsx`
- `app/(dashboard)/admin/memberships/page.tsx`
- `app/(dashboard)/executive/page.tsx`
- `app/(dashboard)/kpi/upload/page.tsx`
- `app/(dashboard)/planner-export/page.tsx`
