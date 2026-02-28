# Verification Checklist — Full Control & Manager Permissions

## TASK A) UserBoutiqueMembership permission flags
- [x] Schema: `canManageTasks`, `canManageLeaves`, `canManageSales`, `canManageInventory` (default false)
- [x] Migration applied: `20260217100000_membership_flags_and_leave_request`
- [x] ADMIN has implicit full permissions (checked in `lib/membershipPermissions.ts`: `if (userRole === 'ADMIN') return true`)
- [x] Admin memberships API and UI: create/edit membership with these flags

## TASK B) Admin Console
- [x] `/admin/boutiques` — list, create, edit, disable (ADMIN only, audited)
- [x] `/admin/regions` — list, create, edit (ADMIN only, audited)
- [x] `/admin/boutique-groups` — list, create, edit, manage members (ADMIN only, audited)
- [x] `/admin/memberships` — list, create, edit with permission flags (ADMIN only, audited)
- [x] `/admin/system` — DEFAULT_BOUTIQUE_ID (ADMIN only, audited)

## TASK C) Boutique Bootstrap Wizard
- [x] Optional "Create with wizard" on admin boutiques page
- [x] Steps: 1) Create boutique (name/code/region), 2) Assign manager (optional), 3) Optional current month target, 4) Review & confirm
- [x] `POST /api/admin/boutiques/bootstrap` — creates boutique, optional membership (MANAGER + flags), optional BoutiqueMonthlyTarget
- [x] Audit: BOUTIQUE_CREATE, BOUTIQUE_MANAGER_ASSIGNED, BOUTIQUE_BOOTSTRAPPED

## TASK D) Leave Management (boutique-scoped)
- [x] Model: `LeaveRequest` (boutiqueId, userId, startDate, endDate, type, status, createdById, approvedById, approvedAt, rejectionReason)
- [x] `GET /api/leaves/requests` — list within scope (query: self, status, boutiqueId)
- [x] `POST /api/leaves/request` — employee submit (boutique in scope)
- [x] `POST /api/leaves/approve` — MANAGER with canManageLeaves or ADMIN; audit LEAVE_APPROVED
- [x] `POST /api/leaves/reject` — same; audit LEAVE_REJECTED
- [x] UI: `/leaves/requests` — employee submit + view own
- [x] UI: `/boutique/leaves` — manager list + approve/reject (within scope)
- [x] Legacy `GET/POST /api/leaves` kept for existing Leave (empId-based) for MANAGER/ADMIN

## TASK E) Task Management permissions
- [x] `GET /api/tasks/setup` — resolve scope; filter tasks by scope; MANAGER requires `canManageTasksInAny(boutiqueIds)`
- [x] `POST /api/tasks/setup` — require boutiqueId in scope and `canManageInBoutique(..., 'canManageTasks')`
- [x] `PATCH/DELETE /api/tasks/setup/[taskId]` — load task; assert task.boutiqueId in scope and canManageTasks for that boutique
- [x] UI: `/boutique/tasks` — manager view of tasks in scope (links to /tasks/setup)

## TASK F) Sales Ledger permissions
- [x] `POST /api/sales/daily/summary` — after scope check, require `canManageSalesInBoutique(userId, role, boutiqueId)` for MANAGER
- [x] `POST /api/sales/daily/lines` — same canManageSales check
- [x] `POST /api/sales/daily/lock` — same canManageSales check
- [x] ADMIN always allowed (canManageSalesInBoutique returns true for ADMIN)

## TASK G) Scope selector
- [x] ADMIN/MANAGER: full scope selector (BOUTIQUE, REGION, GROUP) via `canSelectRegionGroup` from `/api/me/boutiques`
- [x] ASSISTANT_MANAGER/EMPLOYEE: badge-only (no dropdown; single boutique from membership or default)
- [x] New boutiques/regions/groups: reflected from DB; `/api/me/boutiques` and resolveScope use current data

## Server-side authorization
- All mutations: session required; role and membership flags enforced in API handlers.
- No client-only guards for sensitive actions.

## Audit
- Admin CRUD: `AuditLog` module `ADMIN`, actions as in `lib/admin/audit.ts`
- Leave approve/reject: `AuditLog` module `LEAVE`, actions LEAVE_APPROVED, LEAVE_REJECTED (`lib/leaveAudit.ts`)
