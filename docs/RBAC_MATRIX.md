# RBAC Matrix — Team Monitor

**No write API is callable by EMPLOYEE.** All write operations require MANAGER, ASSISTANT_MANAGER, or ADMIN (or ADMIN-only) and are enforced server-side. UI hides actions for EMPLOYEE but must not be relied upon for security.

## Role summary

| Role | Schedule View | Schedule Edit | Override APIs | Admin | Tasks/Inventory (own) |
|------|----------------|---------------|---------------|-------|------------------------|
| EMPLOYEE | Read-only (own or full per route) | ❌ No | ❌ 403 | ❌ No | View / complete own |
| MANAGER | Full | ✅ Yes | ✅ Yes | ❌ No | Full (no user/rule changes) |
| ASSISTANT_MANAGER | Full | ✅ Yes | ✅ Yes | ❌ No | Same as Manager |
| ADMIN | Full | ✅ Yes | ✅ Yes | ✅ Yes | Full + users, rules, import |

## API routes — who can call

### Schedule (week grid is single source of truth)

| Route | GET | POST/PATCH/DELETE | Roles (read) | Roles (write) |
|-------|-----|-------------------|--------------|---------------|
| `/api/schedule/week/grid` | ✅ | — | MANAGER, ASSISTANT_MANAGER, ADMIN, EMPLOYEE (scoped by canViewFullSchedule) | — |
| `/api/schedule/week/grid/save` | — | ✅ | — | MANAGER, ASSISTANT_MANAGER, ADMIN only |
| `/api/schedule/week` | ✅ | — | MANAGER, ASSISTANT_MANAGER, ADMIN | — |
| `/api/schedule/month` | ✅ | — | MANAGER, ASSISTANT_MANAGER, ADMIN | — |
| `/api/overrides` | — | POST | — | MANAGER, ASSISTANT_MANAGER, ADMIN |
| `/api/overrides/[id]` | — | PATCH/DELETE | — | MANAGER, ASSISTANT_MANAGER, ADMIN |

**Confirmation:** EMPLOYEE cannot POST to overrides or grid/save; server returns 401/403.

### Suggestions (coverage)

| Route | Read | Apply (write) |
|-------|------|----------------|
| `/api/suggestions/coverage` | MANAGER, ADMIN, EMPLOYEE | — |
| `/api/suggestions/coverage/week` | MANAGER, ADMIN, EMPLOYEE | — |
| `/api/suggestions/coverage/apply` | — | MANAGER, ADMIN only |

### Leaves

| Route | GET | POST/PUT/PATCH/DELETE |
|-------|-----|------------------------|
| `/api/leaves`, `/api/leaves/[id]`, `/api/leaves/employees` | — | MANAGER, ADMIN only |

### Tasks

| Route | Who |
|-------|-----|
| `/api/tasks/day`, `/api/tasks/range` | Any authenticated; response scoped by user |
| `/api/tasks/setup/*`, `/api/planner/export` | MANAGER, ADMIN only |

### Inventory

| Route | Who (write) |
|-------|-------------|
| `/api/inventory/daily` | EMPLOYEE, MANAGER, ADMIN (daily view/complete) |
| `/api/inventory/daily/complete` | requireSession (any logged-in) |
| `/api/inventory/daily/exclusions`, rebalance, recompute, stats | MANAGER, ADMIN |
| `/api/inventory/zones/*` | MANAGER, ADMIN (assignments); weekly complete = requireSession |
| `/api/inventory/absent` | GET: MANAGER, ADMIN, EMPLOYEE; POST/DELETE: MANAGER, ADMIN |
| `/api/inventory/follow-up/*` | MANAGER, ADMIN |

### Admin

| Route | Who |
|-------|-----|
| `/api/admin/*` (users, employees, coverage-rules, import) | ADMIN only |

### Auth

| Route | Who |
|-------|-----|
| `/api/auth/session`, `/api/auth/change-password` | requireSession (any logged-in) |
| `/api/home` | MANAGER, ADMIN |
| `/api/employee/home` | requireSession |

## Enforcement

- Every write endpoint that modifies schedule, overrides, leaves, tasks setup, admin, or coverage must call `requireRole([...])` with the allowed roles and return 401/403 for others.
- Schedule editor pages (`/schedule/edit`, `/schedule/editor`) redirect EMPLOYEE to `/schedule/view` via `canEditSchedule(user.role)`.
- Nav items for Schedule Editor are only shown for MANAGER, ASSISTANT_MANAGER, ADMIN (see `lib/permissions.ts`).
