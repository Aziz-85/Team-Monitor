# Boutique Isolation — Strict Patch Audit & Fix

**Environment:** Production (Asia/Riyadh, week start Saturday)  
**Goal:** Full isolation between boutiques; no cross-boutique leakage.  
**Constraints:** No schedule algorithm changes; no UI redesign; minimal patches only.

---

## TASK A — Isolation Map (summary)

| Route / area | Admin-only? | Operational scope required? | Tables read/write | boutiqueId enforced? | Risk |
|--------------|-------------|-----------------------------|--------------------|----------------------|------|
| **app/api/admin/** | Yes | No | Various | Admin filter / N/A | LOW |
| **app/api/auth/** | No | No | User, Session | N/A | LOW |
| **app/api/home** | No | Yes | Employee, Schedule, SalesEntry, Task, etc. | Yes (getOperationalScope) | OK |
| **app/api/dashboard** | No | Yes | SalesEntry, Employee, Task, etc. | Yes (getScheduleScope + boutiqueId filter) | OK |
| **app/api/schedule/** (week, grid, lock, unlock, etc.) | No | Yes | Employee, Schedule, ShiftOverride, etc. | Yes (getScheduleScope) | OK |
| **app/api/overrides/** | No | Yes | ShiftOverride | Yes (getScheduleScope) | OK |
| **app/api/overrides/[id]** | No | Yes | ShiftOverride | **Patched:** getScheduleScope + findFirst(id, boutiqueId) | OK |
| **app/api/sales/daily/** | No | Yes | BoutiqueSalesSummary, BoutiqueSalesLine, SalesEntry | Yes (operational scope) | OK |
| **app/api/executive/** (monthly, route, etc.) | No | Yes (or admin filter) | SalesEntry, Employee, etc. | Yes (scope or boutiqueIds) | OK |
| **app/api/leaves/requests** | No | Yes | LeaveRequest | **Patched:** requireOperationalBoutique, single boutiqueId | OK |
| **app/api/leaves/[id]** | No | Yes | Leave | **Patched:** requireOperationalBoutique + findFirst(id, employee.boutiqueId) | OK |
| **app/api/leaves/** (approve, reject, etc.) | No | Varies | Leave, LeaveRequest | Some use scope | MEDIUM |
| **app/api/approvals** | No | Not yet | ApprovalRequest | **Missing:** no boutiqueId filter | HIGH |
| **app/api/approvals/[id]/approve, reject** | No | Not yet | ApprovalRequest | **Missing:** approveRequest(id) may not verify boutique | HIGH |
| **app/api/tasks/**, **inventory/** (many) | No | Yes (most) | Task, Inventory, etc. | Many use getOperationalScope/getScheduleScope | OK / MEDIUM |
| **app/api/me/scope** | No | No (preference) | UserPreference | N/A | OK |
| **app/api/kpi/**, **executive/insights**, etc. | No | Varies | Various | resolveScopeForUser (multi) or operational | MEDIUM |

**Notes:**
- No `pages/api` in project; no server actions using Prisma found.
- Cron/repair: `app/api/admin/sales/repair` is ADMIN-only.

---

## TASK B — Hard rules (enforcement status)

| Rule | Status |
|------|--------|
| R1: Non-admin APIs call requireOperationalBoutique() or getScheduleScope() / getOperationalScope() | **Partial** — Many routes use getOperationalScope/getScheduleScope. Some (approvals, leaves/* other than requests and [id], executive with resolveScopeForUser) still use multi-boutique or no scope. |
| R2: Every Prisma query in non-admin scope includes boutiqueId (or Employee.boutiqueId) | **Partial** — Patched routes enforce. approvals/* and some leaves/* do not. |
| R3: Mutations enforce boutiqueId in write path | **Partial** — overrides/[id], leaves/[id] patched (verify-then-mutate). |
| R4: Admin routes do NOT use requireOperationalBoutique | **Yes** — Admin uses admin filter only. |
| R5: Routes like /api/.../:id ensure record belongs to boutiqueId | **Partial** — overrides/[id], leaves/[id] patched. approvals/[id] delegate to approveRequest (needs audit). |
| R6: Cache keyed by boutiqueId | **Not audited** — UI/SWR/React cache not changed in this patch. |

---

## TASK C — Search patterns (findings)

1. **Prisma without boutiqueId (examples)**  
   - `approvals/route.ts`: `findMany` on ApprovalRequest with no `boutiqueId`.  
   - `leaves/[id]`: was `update/delete` by `id` only → **fixed** with findFirst(id, employee.boutiqueId).  
   - `overrides/[id]`: was `findUnique({ id })` → **fixed** with getScheduleScope + findFirst(id, boutiqueId).

2. **Routes not calling requireOperationalBoutique / getOperationalScope / getScheduleScope**  
   - Many executive routes use `resolveScopeForUser` or `resolveExecutiveBoutiqueIds` (multi-boutique or admin filter).  
   - **Patched:** overrides/[id] (getScheduleScope), leaves/requests (requireOperationalBoutique), leaves/[id] (requireOperationalBoutique).  
   - **Still missing scope:** approvals (GET + [id]/approve, [id]/reject), planner/export, kpi/*, some leaves/* (evaluate, approve, reject, etc.), inventory/zones/upload-map, tasks/list, tasks/day, tasks/range, audit, suggestions/coverage (week, route), and others. See “Remaining risky” below.

3. **findUnique by id in operational scope**  
   - **overrides/[id]**: was findUnique(id) → **replaced** with findFirst(id, boutiqueId).  
   - **leaves/[id]**: **replaced** with findFirst(id, employee.boutiqueId).

4. **boutiqueId from request body in non-admin**  
   - **leaves/requests**: was accepting query `boutiqueId` from URL and narrowing scope → **changed** to ignore for scope; only operational boutique from requireOperationalBoutique().

---

## TASK D — Helper and patches

**Helper (existing):**
- `lib/scope/requireOperationalBoutique.ts` — Returns `{ ok: true, boutiqueId, boutiqueLabel }` or `{ ok: false, res: NextResponse }`. Used when operational scope is required.
- `lib/scope/operationalScope.ts` — `getOperationalScope()`, `requireOperationalScope()`.
- `lib/scope/scheduleScope.ts` — `getScheduleScope()` for schedule-related routes.

**Patches applied:**

| File | Changes |
|------|--------|
| **app/api/overrides/[id]/route.ts** | (1) Import and call `getScheduleScope()` at start of PATCH and DELETE; return 403 if no boutiqueId. (2) Replace `findUnique({ where: { id } })` with `findFirst({ where: { id, boutiqueId } })`. (3) Update/delete still by `id` after ownership verified. |
| **app/api/leaves/[id]/route.ts** | (1) Import and call `requireOperationalBoutique()` at start of PATCH and DELETE; return 403 if not ok. (2) Before update: `findFirst({ where: { id, employee: { boutiqueId } } })`; 404 if not found. (3) Before delete: same findFirst; then delete by id. Leave has no boutiqueId; ownership via Employee.boutiqueId. |
| **app/api/leaves/requests/route.ts** | (1) Replace `resolveScopeForUser` with `requireOperationalBoutique()`. (2) Use single `boutiqueId` from scope in `where`. (3) Ignore query param `boutiqueId` for scope (operational only). |

**Data model assumptions:**
- `ShiftOverride.boutiqueId` may be null; findFirst(id, boutiqueId) returns 404 for other boutique or null (intended).
- `Leave` has no boutiqueId; scoping via `employee.boutiqueId`.
- `LeaveRequest` has `boutiqueId`; filtered by operational boutique only.

---

## TASK E — Checklist and patch list

### 1) Checklist summary

- **Total routes audited:** 138 (app/api/**/route.ts).
- **Routes patched in this pass:** 3 (overrides/[id], leaves/[id], leaves/requests).
- **Remaining risky routes (no operational scope or missing boutiqueId in query):** K ≈ 20+ (see list below).

**Remaining risky (high priority):**
- `app/api/approvals/route.ts` — findMany without boutiqueId.
- `app/api/approvals/[id]/approve/route.ts` — approveRequest(id) without explicit boutique check.
- `app/api/approvals/[id]/reject/route.ts` — same.
- `app/api/leaves/evaluate/route.ts`, `leaves/approve/route.ts`, `leaves/reject/route.ts`, `leaves/escalate/route.ts`, `leaves/admin-approve/route.ts` — need operational scope + boutiqueId where applicable (LeaveRequest has boutiqueId).
- `app/api/inventory/daily/route.ts`, `inventory/zones/weekly/route.ts`, `inventory/follow-up/*`, `inventory/daily/stats/route.ts`, etc. — verify each uses getScheduleScope or getOperationalScope and filters by boutiqueId.
- `app/api/tasks/setup/route.ts`, `tasks/setup/[taskId]/route.ts`, `tasks/setup/[taskId]/schedule/route.ts` — verify operational scope.
- `app/api/executive/route.ts`, `executive/insights/route.ts`, etc. — use resolveScopeForUser (multi); consider enforcing single operational boutique for non-admin callers if required by product.
- `app/api/kpi/uploads/route.ts`, `kpi/uploads/[id]/route.ts`, `kpi/employee/route.ts` — verify scope.
- `app/api/me/sales/route.ts`, `me/sales/[id]/route.ts`, `me/targets/route.ts` — user-scoped; verify no cross-boutique by contract.

### 2) Patch list by file (this pass)

| File | What changed | Assumptions |
|------|--------------|-------------|
| **app/api/overrides/[id]/route.ts** | Added getScheduleScope(); 403 if no boutique. findFirst(id, boutiqueId) instead of findUnique(id). | ShiftOverride has boutiqueId (optional). |
| **app/api/leaves/[id]/route.ts** | Added requireOperationalBoutique(); findFirst(id, employee.boutiqueId) before update/delete; 404 if not in scope. | Leave scoped via Employee.boutiqueId. |
| **app/api/leaves/requests/route.ts** | Replaced resolveScopeForUser with requireOperationalBoutique(); single boutiqueId in where; removed query boutiqueId for scope. | LeaveRequest.boutiqueId; operational = single boutique. |

### 3) Boutique leakage test plan (manual)

1. **Login Boutique A**  
   - Select Boutique A in scope selector.  
   - Open Schedule, Tasks, Sales, Targets (operational pages).  
   - Confirm data shown is only for Boutique A (employees, overrides, leave requests, sales).

2. **Switch to Boutique B**  
   - Change scope to Boutique B.  
   - Confirm Schedule, Tasks, Sales, Leave requests, Overrides all change to Boutique B only.  
   - No names or IDs from Boutique A in lists/grids.

3. **Non-admin API without boutique**  
   - Clear or do not set operational boutique (e.g. new session or preference cleared).  
   - Call e.g. GET /api/leaves/requests or GET /api/home.  
   - **Expected:** 403 with message like "Operational Boutique Required" or "No operational boutique available".

4. **Access by ID from other boutique**  
   - With Boutique A selected, obtain an override ID or leave ID that belongs to Boutique B (e.g. from DB or previous session).  
   - PATCH or DELETE /api/overrides/[id] or PATCH/DELETE /api/leaves/[id] with that ID.  
   - **Expected:** 404 Not found (record not in operational scope).

5. **Cache refetch on switch**  
   - With Boutique A selected, load Schedule or Leave requests.  
   - Switch to Boutique B.  
   - **Expected:** Data refreshes to Boutique B (no stale Boutique A data). If using SWR/React Query, ensure keys include boutiqueId.

---

## TASK F — No overstep

- No new endpoints added.  
- No UI redesign; no new banners beyond what was already planned.  
- No domain refactor; only scope enforcement and where-clause fixes.

---

**Phase 2 — Tasks + Targets isolation (completed):**

- **Tasks:** All task routes now require operational scope and filter by `boutiqueId`:
  - `tasks/my-today`, `tasks/list`, `tasks/day`, `tasks/range`, `tasks/export-weekly`, `tasks/completion`: `requireOperationalScope()` + `where: { active: true, boutiqueId }`.
  - `tasks/monitor`: already had scope; added `boutiqueId: scope.boutiqueId` to `task.findMany` where.
  - `tasks/completion`: `findFirst({ where: { id: taskId, boutiqueId } })` instead of `findUnique({ id })`.
- **Targets:** `me/targets` uses `requireOperationalScope()` and `findFirst({ month, boutiqueId })` / `findFirst({ month, userId, boutiqueId })` for boutique and employee targets.
- **Schema:** `BoutiqueMonthlyTarget`: `@@unique([boutiqueId, month])`. `EmployeeMonthlyTarget`: `@@unique([boutiqueId, month, userId])`. Migration: `20260228000000_targets_unique_boutique_month`.
- **Admin targets:** `admin/targets`, `admin/generate-employee-targets`, `admin/boutique-target`, `admin/boutiques/bootstrap` updated to use `findFirst`/composite unique and (where applicable) `boutiqueId` from admin filter or default.
- **Dashboard:** Employee path uses `user.employee?.boutiqueId ?? boutiqueId` for targets/tasks; manager path filters by `scheduleScope.boutiqueId`. Executive score/aggregation use `findFirst` for boutique target.
- **Overrides:** `overrides/[id]` already patched (getScheduleScope + findFirst(id, boutiqueId)). POST `overrides` already passes `boutiqueId: scheduleScope.boutiqueId` to `applyOverrideChange`.

**Next steps (recommended):**
- Add requireOperationalBoutique (or getScheduleScope where appropriate) to approvals/route.ts and approvals/[id]/approve and reject; filter ApprovalRequest by boutiqueId.  
- Audit approveRequest() in lib/services/approvals.ts to ensure it restricts by boutiqueId when used from operational context.  
- Enforce single operational boutique on remaining leaves/* and inventory/tasks routes that are used by operational pages.
