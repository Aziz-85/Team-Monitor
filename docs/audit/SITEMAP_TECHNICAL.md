# Team Monitor — Technical Sitemap

**Generated:** 2025-02-14 | **Purpose:** Developer-facing route inventory with data sources and auth.

---

## Page Routes — Technical Details

| Path | Component | Data Sources (APIs) | Rendering | Auth | Scope Source |
|------|-----------|-------------------|-----------|------|--------------|
| `/` | `app/(dashboard)/page.tsx` | Redirect by role → /dashboard or /employee | Server | getSessionUser | User.boutiqueId |
| `/dashboard` | `dashboard/page.tsx` | GET /api/dashboard | Server+Client | Session | getScheduleScope |
| `/schedule/view` | `schedule/view/page.tsx` | GET /api/schedule/week/grid, /api/schedule/guests, /api/schedule/month, /api/schedule/month/excel | Client fetch | Session | Operational scope |
| `/schedule/edit` | `schedule/edit/page.tsx` | GET /api/schedule/week/grid, /api/schedule/guests, /api/schedule/week/status, POST grid/save, lock, unlock, approve | Client fetch | canEditSchedule | Operational scope |
| `/schedule/editor` | `schedule/editor/page.tsx` | GET /api/schedule/week, /api/suggestions/coverage, POST suggestions/coverage/apply | Client fetch | canEditSchedule | Operational scope |
| `/sales/daily` | `sales/daily/page.tsx` | GET /api/sales/daily, /api/sales/daily/lines, POST lock, lines | Client fetch | requireRole | getScheduleScope |
| `/sales/import` | `sales/import/page.tsx` | POST /api/sales/import/preview, apply, GET template, export | Client fetch | requireRole | getScheduleScope |
| `/sales/monthly-matrix` | `sales/monthly-matrix/page.tsx` | GET /api/sales/monthly-matrix | Client fetch (cache: no-store) | requireRole | getScheduleScope |
| `/executive/*` | `executive/*/page.tsx` | GET /api/executive/*, /api/executive/monthly, compare, employees, etc. | Client fetch | requireRole | Multi-boutique scope |
| `/tasks` | `tasks/page.tsx` | GET /api/tasks/list, /api/tasks/my-today | Client fetch | Session | getScheduleScope |
| `/tasks/monitor` | `tasks/monitor/page.tsx` | GET /api/tasks/monitor | Client fetch | requireRole | getScheduleScope |
| `/inventory/daily` | `inventory/daily/page.tsx` | GET /api/inventory/daily, stats, exclusions, POST complete, rebalance | Client fetch | requireRole | getScheduleScope |
| `/inventory/zones` | `inventory/zones/page.tsx` | GET /api/inventory/zones, assignments, weekly | Client fetch | requireRole | getScheduleScope |
| `/leaves/*` | `leaves/*/page.tsx` | GET /api/leaves/*, POST submit, approve, reject | Client fetch | requireRole/getSessionUser | getScheduleScope |
| `/admin/*` | `admin/*/page.tsx` | Various /api/admin/* | Client fetch | requireRole(ADMIN) or MANAGER | Admin scope / all boutiques |
| `/me/target` | `me/target/page.tsx` | GET /api/me/targets | Client fetch | Session | User.boutiqueId |

---

## API Routes — Auth & Scope

| Endpoint | Methods | Auth | Scope Enforcement |
|----------|---------|------|-------------------|
| `/api/auth/login` | POST | None | N/A |
| `/api/auth/logout` | POST | getSessionUser | N/A |
| `/api/auth/session` | GET | getSessionUser | N/A |
| `/api/auth/change-password` | POST | requireSession | N/A |
| `/api/dashboard` | GET | getSessionUser | getScheduleScope |
| `/api/schedule/week/grid` | GET | requireRole | getScheduleScope |
| `/api/schedule/week/grid/save` | POST | requireRole | getScheduleScope |
| `/api/schedule/guests` | GET, POST, DELETE | requireRole | getScheduleScope |
| `/api/sales/daily` | GET | requireRole | getScheduleScope |
| `/api/sales/monthly-matrix` | GET | requireRole | getScheduleScope |
| `/api/executive/monthly` | GET | requireRole + getSessionUser | Multi-boutique |
| `/api/admin/*` | Various | requireRole(ADMIN) or MANAGER | Admin scope |
| `/api/me/*` | Various | getSessionUser | User-scoped |

---

## Layout Hierarchy

```
app/layout.tsx (root)
├── app/(auth)/layout.tsx → login, change-password
└── app/(dashboard)/layout.tsx
    ├── getSessionUser() → redirect /login if null
    ├── Sidebar (getNavGroupsForUser)
    ├── MobileTopBar
    ├── RouteGuard (canAccessRoute from ROLE_ROUTES)
    └── IdleDetector
```

---

## Scope Sources (Single Source of Truth)

| Scope Type | Source | Used By |
|------------|--------|---------|
| **Operational Boutique** | `UserBoutiqueMembership` / `User.boutiqueId` + `OperationalBoutiqueSelector` | Schedule, Tasks, Inventory, Sales (non-admin) |
| **Schedule Scope** | `getScheduleScope()` from `/api/me/scope` + `scope.boutiqueIds` | Schedule grid, guests, week status |
| **Admin Scope** | All boutiques or selected | Admin pages |
| **Employee Membership** | `Employee.boutiqueId` | All employee-filtered queries |

---

## Key Files

| Concern | File |
|---------|------|
| Nav config | `lib/navConfig.ts` |
| Role routes | `lib/permissions.ts` |
| Schedule permissions | `lib/rbac/schedulePermissions.ts` |
| Schedule scope | `lib/scope/scheduleScope.ts` |
| Auth | `lib/auth.ts` |
