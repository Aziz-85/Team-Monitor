# Roster Tenancy Policy — Verification

**Foundation:** `Employee.boutiqueId` is the **only** operational roster source-of-truth.  
`UserBoutiqueMembership` controls **login access** only, not roster membership.

---

## 1. Definitions (non-negotiable)

| Term | Definition |
|------|------------|
| **Roster** | `Employee` table: `Employee.empId` (canonical id), `Employee.boutiqueId` (current assignment), `Employee.active` (eligibility). |
| **Login access** | `User` + `UserBoutiqueMembership`. Not used to decide who appears in roster lists. |
| **Operational scope** | For every operational request: `boutiqueIds = resolveScopeForUser(userId, role)`. All operational queries use `Employee.boutiqueId IN boutiqueIds`. |

---

## 2. Helper module: `lib/tenancy/operationalRoster.ts`

- **`resolveOperationalBoutiqueIds(userId, role, requestedScope?)`** → `{ boutiqueIds, label }`  
  Uses stored preference + role; never trust client-provided `boutiqueId` for filtering.

- **`getOperationalEmployees(boutiqueIds [, options])`** → `Employee[]`  
  Filters: `Employee.boutiqueId IN boutiqueIds`, `active = true`, `isSystemOnly = false`, `notDisabledUserWhere`.

- **`getOperationalEmpIds(boutiqueIds)`** → `Set<string>`  
  For allowlists / validation.

- **`assertEmployeeInBoutiqueScope(empId, boutiqueIds)`**  
  Throws `EmployeeOutOfScopeError` (code `CROSS_BOUTIQUE_BLOCKED`) if employee not in scope.

- **`assertEmployeesInBoutiqueScope(empIds, boutiqueIds)`**  
  Same for multiple employees; `invalidEmpIds` on error.

- **`logCrossBoutiqueBlocked(actorUserId, module, invalidEmpIds, scopeBoutiqueIds [, reason])`**  
  Writes to `AuditLog` (action `CROSS_BOUTIQUE_BLOCKED`).

---

## 3. Where the policy is applied

| Module | What was done |
|--------|----------------|
| **Schedule** | Grid and save use server-resolved `boutiqueIds`. Save validates every `empId` with `assertEmployeesInBoutiqueScope`; on failure returns 400 + `ScheduleEditAudit` + `logCrossBoutiqueBlocked`. Roster, coverage, reminders, month, insights all filter by `boutiqueIds`. |
| **Tasks** | `PUT /api/tasks/setup/[taskId]/plan`: resolves scope, asserts task’s `boutiqueId` in scope, asserts primary/backup empIds in scope; on failure 400 + `logCrossBoutiqueBlocked('TASKS', ...)`. |
| **Leaves** | `GET /api/leaves/employees`: returns `getOperationalEmployees(boutiqueIds)` only (picker is roster-scoped). |
| **Sales** | Import: employee lookup built from `Employee` where `boutiqueId = request boutiqueId`. Rows matching an employee in another boutique are unmatched with reason `EMPLOYEE_OTHER_BOUTIQUE`. |
| **Inventory** | (Optional follow-up) Daily run and zone assignment should use `getOperationalEmployees(boutiqueIds)` and scope rotation/assignments by `boutiqueId`. |
| **Executive / Analytics** | (Optional follow-up) When aggregating by employee, filter by `Employee.boutiqueId IN boutiqueIds` except in ADMIN global mode. |

---

## 4. Database

- **`Employee.boutiqueId`**: NOT NULL, FK to `Boutique` (already in schema).
- **Indexes**: `Employee`: `@@index([boutiqueId])`, `@@index([boutiqueId, active])`.  
  Run `npx prisma migrate dev` to add the new index (non-destructive).

---

## 5. UI

- Operational pages: show **Scope: &lt;label&gt;** (resolved).  
  Employee pickers use only operational employees (from APIs that use `getOperationalEmployees` / scope).
- Admin pages: global + AdminFilterBar; admin can change `Employee.boutiqueId` with audit.

---

## 6. Audit and safety

- **Blocked cross-boutique attempt:**  
  `AuditLog`: action `CROSS_BOUTIQUE_BLOCKED`, module e.g. `SCHEDULE` / `TASKS`, `afterJson` includes `invalidEmpIds`, `scopeBoutiqueIds`, reason.
- **Schedule save block:**  
  Additionally `ScheduleEditAudit` with `source: 'CROSS_BOUTIQUE_BLOCKED'`.
- **Boutique change:**  
  Existing `EMPLOYEE_CHANGE_BOUTIQUE` (or equivalent) should include `fromBoutiqueId` / `toBoutiqueId`.

---

## 7. Verification checklist

1. **Scope to Boutique S02** → schedule/tasks/leaves show only S02 employees.
2. **Scope to Boutique S05** → same for S05 only.
3. **Assign S05 employee while in S02** (e.g. schedule save or task plan) → **400** + `CROSS_BOUTIQUE_BLOCKED` + audit created.
4. **Sales import:** Excel row with employee from another boutique → preview shows unmatched, reason `EMPLOYEE_OTHER_BOUTIQUE`; apply blocked when there are unmatched rows.
5. **Admin:** `/admin/employees` shows all; operational pages are scoped by resolved `boutiqueIds`.

---

## 8. Tests

- **`__tests__/schedule-boutique-scope.test.ts`**: Grid with `boutiqueIds` returns only employees in that scope; contract for save rejection and audit.
- **`__tests__/operational-roster.test.ts`** (optional): `getOperationalEmployees(boutiqueIds)` returns only employees with `boutiqueId IN boutiqueIds`; `assertEmployeesInBoutiqueScope` throws for out-of-scope empId.
