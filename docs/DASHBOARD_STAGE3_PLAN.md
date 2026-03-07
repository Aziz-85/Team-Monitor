# Stage 3: Dashboard by Role — Implementation Plan

## Objective
Turn `/dashboard` into a role-aware control center: each role sees the most relevant information with less clutter and clear hierarchy. No route/API/schema changes; reuse existing `/api/dashboard` and components.

---

## 1. Audit summary

### Current state
- **Route:** `app/(dashboard)/dashboard/page.tsx` — renders `<ExecutiveDashboard />` only; no role passed from server.
- **Client:** `components/dashboard/ExecutiveDashboard.tsx` — fetches `/api/dashboard`, gets `rbac.role`, `showFullDashboard`, `showAntiGaming`, `showPlannerSync`. Renders same layout for all roles with title "Executive Dashboard".
- **API:** `app/api/dashboard/route.ts` — already role-aware:
  - **EMPLOYEE:** Returns only that user’s sales, today’s tasks, their roster slot, zone status; single-row `salesBreakdown` and `teamTable`.
  - **Non-EMPLOYEE:** Branch-level metrics; `fullDashboard = isAdmin || isManager` → ASSISTANT_MANAGER and DEMO_VIEWER get branch data but `showAntiGaming`/`showPlannerSync` false.
- **Components reused:** SalesPerformanceCard, ScheduleHealthCard, TaskControlCard, ControlAlertsCard, SalesBreakdownSection, ScheduleOverviewSection, TaskIntegritySection, TeamTableSection. All receive data from the single API response.

### Scope isolation (unchanged)
- `resolveMetricsScope(request)` already enforces single-boutique for non–SUPER_ADMIN; EMPLOYEE gets `employeeOnly: true`. No change to APIs or RBAC.

---

## 2. Role-by-role dashboard structure (after refactor)

| Role | Page title | Subtitle | KPI row | Action/shortcuts | Sections shown | Hidden |
|------|------------|----------|---------|-------------------|----------------|--------|
| **EMPLOYEE** | My Dashboard | — | My target (sales), Today’s schedule, My tasks, Alerts (minimal) | Quick links: Tasks, My Sales, My Target, My Leaves | — | Sales breakdown (redundant), Schedule overview (branch), Task integrity, Team table |
| **ASSISTANT_MANAGER** | Branch Dashboard | — | Sales, Schedule health, Task control, Control alerts | — | Sales breakdown, Schedule overview, Team table | Task integrity |
| **MANAGER** | Manager Dashboard | — | Sales, Schedule health, Task control, Control alerts | — | Sales breakdown, Schedule overview, Task integrity, Team table | — |
| **ADMIN / SUPER_ADMIN** | Admin Dashboard | Optional: “Viewing: [boutique]” | Same as Manager | — | Same as Manager | — |
| **DEMO_VIEWER** | Demo Dashboard | — | Same as ASSISTANT_MANAGER (branch snapshot) | — | Same as ASSISTANT_MANAGER | Task integrity |
| **AREA_MANAGER** | Area Dashboard | — | Not primary path; if they land on /dashboard, show branch-style view | — | Same as ASSISTANT_MANAGER | Task integrity |

---

## 3. Files to change

| File | Change |
|------|--------|
| `components/dashboard/ExecutiveDashboard.tsx` | Role-based title (from `data.rbac.role`), conditional section visibility, EMPLOYEE quick links. Reuse existing cards/sections. |
| `messages/en.json` | Add `dashboard.title.my`, `dashboard.title.branch`, `dashboard.title.manager`, `dashboard.title.admin`, `dashboard.title.demo`, `dashboard.title.area`; `dashboard.quickLinks.tasks`, `dashboard.quickLinks.mySales`, `dashboard.quickLinks.myTarget`, `dashboard.quickLinks.myLeaves`. |
| `messages/ar.json` | Same keys with Arabic values. |
| `app/(dashboard)/dashboard/page.tsx` | No change (keep single entry; client gets role from API). |

No new routes, no API changes, no new dashboard API endpoints. Optional later: ADMIN subtitle “Viewing: X” if scope label is returned by API (out of scope for this pass).

---

## 4. Implementation details

### 4.1 Title and subtitle
- Derive from `data.rbac.role` after first successful fetch.
- Map: EMPLOYEE → `dashboard.title.my`, ASSISTANT_MANAGER → `dashboard.title.branch`, MANAGER → `dashboard.title.manager`, ADMIN/SUPER_ADMIN → `dashboard.title.admin`, DEMO_VIEWER → `dashboard.title.demo`, AREA_MANAGER → `dashboard.title.area`. Fallback: “Dashboard”.

### 4.2 Section visibility (by role)
- **EMPLOYEE:** Show only: snapshot cards (sales, schedule health, task control, control alerts). Show quick links. Hide: SalesBreakdownSection, ScheduleOverviewSection, TaskIntegritySection, TeamTableSection.
- **ASSISTANT_MANAGER / DEMO_VIEWER / AREA_MANAGER:** Show: all 4 snapshot cards, SalesBreakdownSection, ScheduleOverviewSection, TeamTableSection. Hide: TaskIntegritySection (already gated by `rbac.showAntiGaming` in current code).
- **MANAGER / ADMIN / SUPER_ADMIN:** Show all sections (current behavior).

### 4.3 Quick links (EMPLOYEE only)
- Row of links below KPI cards: Tasks → `/tasks`, My Sales → `/sales/my`, My Target → `/me/target`, My Leaves → `/leaves/requests`. Use Next.js `Link`, small card or pill style.

### 4.4 Layout pattern (all roles)
- Page title (h1)
- Optional subtitle (role-specific, e.g. Admin “Viewing: …” — skip if no scope label in response)
- KPI row (grid of cards)
- Quick links (EMPLOYEE only)
- Operational sections in order: Sales breakdown (if shown), Schedule overview (if shown), Task integrity (if shown), Team table (if shown)

### 4.5 No changes to
- `/api/dashboard/route.ts` (already returns correct data per role)
- Card/section components (props unchanged)
- Routes or navigation
- DB or business logic

---

## 5. Diff preview (conceptual)

### ExecutiveDashboard.tsx
- Add `role` derived from `data?.rbac?.role`.
- Replace hardcoded `<h1>Executive Dashboard</h1>` with `<h1>{t(\`dashboard.title.${roleKey}\`)}</h1>` (with roleKey mapping).
- Wrap SalesBreakdownSection in `{role !== 'EMPLOYEE' && salesBreakdown && ...}`.
- Wrap ScheduleOverviewSection in `{role !== 'EMPLOYEE' && scheduleOverview && ...}`.
- Keep TaskIntegritySection gated by `rbac.showAntiGaming` (unchanged).
- Wrap TeamTableSection in `{role !== 'EMPLOYEE' && teamTable && ...}` (EMPLOYEE already has single row; hide to reduce clutter).
- Add EMPLOYEE-only block: quick links section with 4 Links.

### messages/en.json
- Add under `"nav"` or new `"dashboard"`: `"title": { "my": "My Dashboard", "branch": "Branch Dashboard", "manager": "Manager Dashboard", "admin": "Admin Dashboard", "demo": "Demo Dashboard", "area": "Area Dashboard" }`, `"quickLinks": { "tasks": "Tasks", "mySales": "My Sales", "myTarget": "My Target", "myLeaves": "My Leaves" }`.

### messages/ar.json
- Same structure; Arabic values for titles and quick links.

---

## 6. Rollback
- Revert ExecutiveDashboard.tsx to single title and show all sections for all roles; remove quick links.
- Revert message keys. No migrations or API rollback needed.
